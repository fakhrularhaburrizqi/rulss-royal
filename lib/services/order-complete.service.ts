import "server-only";

import { OrderStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";

export type CompletedOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  tenantId: string;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const ORDER_COMPLETED_ACTION = "order.completed";
const ORDER_ENTITY = "CustomerOrder";

export async function completeOrderDirect(input: {
  outletId: string;
  orderId: string;
  version: number;
}): Promise<CompletedOrderSummary> {
  const outletId = typeof input.outletId === "string" ? input.outletId.trim() : "";
  const orderId = typeof input.orderId === "string" ? input.orderId.trim() : "";
  const version = input.version;

  if (outletId === "" || orderId === "" || !Number.isInteger(version) || version < 1) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const context = await requireOrderContext(outletId, "orders.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const order = await tx.customerOrder.findFirst({
        where: {
          id: orderId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          version: true,
        },
      });

      if (order === null) {
        throw new OrderDomainError("ORDER_NOT_FOUND");
      }

      if (order.version !== version) {
        throw new OrderDomainError("VERSION_CONFLICT");
      }

      const updated = await tx.customerOrder.updateMany({
        where: {
          id: order.id,
          tenantId,
          outletId: authorizedOutletId,
          status: order.status,
          version: order.version,
        },
        data: {
          status: OrderStatus.COMPLETED,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("VERSION_CONFLICT");
      }

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: ORDER_COMPLETED_ACTION,
          entity: ORDER_ENTITY,
          entityId: order.id,
          before: {
            status: order.status,
            version: order.version,
          },
          after: {
            status: OrderStatus.COMPLETED,
            version: order.version + 1,
          },
        },
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: OrderStatus.COMPLETED,
        version: order.version + 1,
        tenantId,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
