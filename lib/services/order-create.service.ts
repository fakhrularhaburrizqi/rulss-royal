import "server-only";

import { OrderStatus, Prisma, type OrderSource } from "@prisma/client";

import { db } from "@/lib/db";
import {
  DEFAULT_TIMEZONE,
  MAX_ORDER_CREATE_ATTEMPTS,
  MAX_ORDER_SEQ_PER_DAY,
} from "@/lib/order/constants";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, isOrderNumberUniqueViolation, toOrderError } from "@/lib/order/errors";
import {
  formatOrderNumber,
  maxSequence,
  orderNumberPrefix,
  resolveLocalDate,
} from "@/lib/order/order-number";
import { itemSubtotal, orderTotals } from "@/lib/order/pricing";
import {
  domainCreateOrderSchema,
  type DomainCreateOrderInput,
} from "@/lib/validators/order.validator";

export type CreatedOrderSummary = {
  id: string;
  orderNumber: string;
  source: OrderSource;
  status: OrderStatus;
  subtotal: number;
  total: number;
  version: number;
};

type CreateOrderPlan = {
  readonly context: OrderContext;
  readonly input: DomainCreateOrderInput;
  readonly prefix: string;
};

type OrderLine = {
  readonly menuItemId: string;
  readonly menuNameSnapshot: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly note: string | null;
  readonly subtotal: number;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const ORDER_CREATED_ACTION = "order.created";
const ORDER_ENTITY = "CustomerOrder";

function resolveTimezone(raw: string | null | undefined): string {
  if (typeof raw !== "string") {
    return DEFAULT_TIMEZONE;
  }
  const timezone = raw.trim();
  return timezone === "" ? DEFAULT_TIMEZONE : timezone;
}

async function findAuthorizedOutlet(context: OrderContext) {
  try {
    return await db.outlet.findFirst({
      where: {
        id: context.outletId,
        tenantId: context.actor.tenantId,
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        setting: { select: { timezone: true } },
      },
    });
  } catch (error) {
    throw toOrderError(error);
  }
}

async function loadOrderLines(
  tx: Prisma.TransactionClient,
  plan: CreateOrderPlan
): Promise<OrderLine[]> {
  const menuItemIds = plan.input.items.map((item) => item.menuItemId);

  const menuRows = await tx.menuItem.findMany({
    where: {
      tenantId: plan.context.actor.tenantId,
      outletId: plan.context.outletId,
      id: { in: menuItemIds },
      isActive: true,
      deletedAt: null,
      isSoldOut: false,
      category: { isActive: true, deletedAt: null },
    },
    select: { id: true, name: true, price: true },
  });

  if (menuRows.length !== menuItemIds.length) {
    throw new OrderDomainError("MENU_ITEM_UNAVAILABLE");
  }

  const menuById = new Map(menuRows.map((row) => [row.id, row]));
  const lines: OrderLine[] = [];

  for (const item of plan.input.items) {
    const menu = menuById.get(item.menuItemId);
    if (!menu) {
      throw new OrderDomainError("MENU_ITEM_UNAVAILABLE");
    }
    lines.push({
      menuItemId: menu.id,
      menuNameSnapshot: menu.name,
      unitPrice: menu.price,
      quantity: item.quantity,
      note: item.note ?? null,
      subtotal: itemSubtotal(menu.price, item.quantity),
    });
  }

  return lines;
}

async function assertDiningTable(
  tx: Prisma.TransactionClient,
  plan: CreateOrderPlan
): Promise<void> {
  const diningTableId = plan.input.diningTableId ?? null;
  if (diningTableId === null) {
    return;
  }

  const table = await tx.diningTable.findFirst({
    where: {
      id: diningTableId,
      outletId: plan.context.outletId,
      isActive: true,
    },
    select: { id: true },
  });

  if (table === null) {
    throw new OrderDomainError("TABLE_NOT_FOUND");
  }
}

async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  plan: CreateOrderPlan
): Promise<string> {
  const existing = await tx.customerOrder.findMany({
    where: {
      tenantId: plan.context.actor.tenantId,
      outletId: plan.context.outletId,
      orderNumber: { startsWith: plan.prefix },
    },
    select: { orderNumber: true },
  });

  const sequence =
    maxSequence(
      existing.map((row) => row.orderNumber),
      plan.prefix
    ) + 1;

  if (sequence > MAX_ORDER_SEQ_PER_DAY) {
    throw new OrderDomainError("ORDER_LIMIT_REACHED");
  }

  return formatOrderNumber(plan.prefix, sequence);
}

async function persistOrder(
  tx: Prisma.TransactionClient,
  plan: CreateOrderPlan,
  lines: readonly OrderLine[],
  orderNumber: string
): Promise<CreatedOrderSummary> {
  const tenantId = plan.context.actor.tenantId;
  const outletId = plan.context.outletId;
  const totals = orderTotals(
    lines.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity }))
  );

  const order = await tx.customerOrder.create({
    data: {
      tenantId,
      outletId,
      diningTableId: plan.input.diningTableId ?? null,
      createdByUserId: plan.context.actor.userId,
      orderNumber,
      source: plan.input.source,
      status: OrderStatus.RECEIVED,
      customerName: plan.input.customerName ?? null,
      note: plan.input.note ?? null,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      serviceAmount: totals.serviceAmount,
      total: totals.total,
      version: 1,
    },
  });

  const inserted = await tx.orderItem.createMany({
    data: lines.map((line) => ({
      tenantId,
      outletId,
      orderId: order.id,
      menuItemId: line.menuItemId,
      menuNameSnapshot: line.menuNameSnapshot,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      note: line.note,
      subtotal: line.subtotal,
    })),
  });

  if (inserted.count !== lines.length) {
    throw new OrderDomainError("INTERNAL_ERROR");
  }

  await tx.activityLog.create({
    data: {
      tenantId,
      outletId,
      userId: plan.context.actor.userId,
      action: ORDER_CREATED_ACTION,
      entity: ORDER_ENTITY,
      entityId: order.id,
      before: Prisma.DbNull,
      after: {
        orderNumber: order.orderNumber,
        source: order.source,
        status: order.status,
        subtotal: order.subtotal,
        total: order.total,
        itemLineCount: inserted.count,
      },
    },
  });

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    source: order.source,
    status: order.status,
    subtotal: order.subtotal,
    total: order.total,
    version: order.version,
  };
}

async function executeCreateOrder(plan: CreateOrderPlan): Promise<CreatedOrderSummary> {
  return db.$transaction(async (tx) => {
    const lines = await loadOrderLines(tx, plan);
    await assertDiningTable(tx, plan);
    const orderNumber = await nextOrderNumber(tx, plan);
    return persistOrder(tx, plan, lines, orderNumber);
  }, TRANSACTION_OPTIONS);
}

export async function createCustomerOrder(input: unknown): Promise<CreatedOrderSummary> {
  const parsed = domainCreateOrderSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const orderInput = parsed.data;

  if (orderInput.source === "QR_TABLE" && (orderInput.diningTableId ?? null) === null) {
    throw new OrderDomainError("TABLE_REQUIRED");
  }

  const context = await requireOrderContext(orderInput.outletId, "orders.manage");

  const outlet = await findAuthorizedOutlet(context);
  if (outlet === null) {
    throw new OrderDomainError("OUTLET_NOT_FOUND");
  }

  const capturedNow = new Date();
  const timezone = resolveTimezone(outlet.setting?.timezone);
  const datePart = resolveLocalDate(capturedNow, timezone);
  const prefix = orderNumberPrefix(outlet.code, datePart);

  const plan: CreateOrderPlan = { context, input: orderInput, prefix };

  for (let attempt = 1; attempt <= MAX_ORDER_CREATE_ATTEMPTS; attempt += 1) {
    try {
      return await executeCreateOrder(plan);
    } catch (error) {
      if (isOrderNumberUniqueViolation(error)) {
        if (attempt < MAX_ORDER_CREATE_ATTEMPTS) {
          continue;
        }
        throw new OrderDomainError("ORDER_NUMBER_CONFLICT");
      }
      if (error instanceof OrderDomainError) {
        throw error;
      }
      throw toOrderError(error);
    }
  }

  throw new OrderDomainError("ORDER_NUMBER_CONFLICT");
}
