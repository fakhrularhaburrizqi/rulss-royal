import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { MAX_MONEY, MAX_ORDER_CREATE_ATTEMPTS } from "@/lib/order/constants";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import { parseSequence } from "@/lib/order/order-number";
import { createCustomerOrder } from "@/lib/services/order-create.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    outlet: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const tx = {
  menuItem: { findMany: vi.fn() },
  diningTable: { findFirst: vi.fn() },
  customerOrder: { findMany: vi.fn(), create: vi.fn() },
  orderItem: { createMany: vi.fn() },
  activityLog: { create: vi.fn() },
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedOutletFindFirst = db.outlet.findFirst as unknown as Mock;
const mockedTransaction = db.$transaction as unknown as Mock;

const FROZEN_NOW = new Date("2026-03-10T08:30:00.000Z");
const EXPECTED_PREFIX = "OUT-JKT-20260310-";
const EXPECTED_ORDER_NUMBER = `${EXPECTED_PREFIX}0001`;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const outletRow = {
  id: "outlet-ctx",
  code: "JKT",
  setting: { timezone: "Asia/Jakarta" },
};

const menuRows = [
  { id: "menu-1", name: "Nasi Goreng", price: 25_000 },
  { id: "menu-2", name: "Es Teh", price: 5_000 },
];

function baseOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "CASHIER",
    outletId: "outlet-1",
    items: [{ menuItemId: "menu-1", quantity: 1 }],
    ...overrides,
  };
}

function tableOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return baseOrder({
    source: "QR_TABLE",
    diningTableId: "table-1",
    ...overrides,
  });
}

async function captureError(promise: Promise<unknown>): Promise<OrderDomainError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as OrderDomainError;
  }
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: Parameters<typeof getOrderErrorMessage>[0]
): Promise<OrderDomainError | null> {
  const error = await captureError(promise);
  expect(error).toBeInstanceOf(OrderDomainError);
  expect(error?.code).toBe(code);
  expect(error?.message).toBe(getOrderErrorMessage(code));
  return error;
}

function createArgs(): { data: Record<string, unknown> } {
  return tx.customerOrder.create.mock.calls[0]?.[0];
}

function createManyRows(): Array<Record<string, unknown>> {
  return tx.orderItem.createMany.mock.calls[0]?.[0]?.data;
}

type PrismaLikeError = Error & { code: string; meta?: Record<string, unknown> };

function prismaError(code: string, meta?: Record<string, unknown>): PrismaLikeError {
  const error = new Error(`simulated prisma ${code}`) as PrismaLikeError;
  error.code = code;
  if (meta !== undefined) {
    error.meta = meta;
  }
  return error;
}

function orderNumberConflict(): PrismaLikeError {
  return prismaError("P2002", { target: ["tenantId", "outletId", "orderNumber"] });
}

function queriedPrefixes(): string[] {
  return tx.customerOrder.findMany.mock.calls.map((call) => call[0].where.orderNumber.startsWith);
}

function expectBoundedTransactions(): void {
  for (const call of mockedTransaction.mock.calls) {
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);

  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedOutletFindFirst.mockResolvedValue(outletRow);
  mockedTransaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)
  );

  tx.menuItem.findMany.mockResolvedValue([menuRows[0]]);
  tx.diningTable.findFirst.mockResolvedValue({ id: "table-1" });
  tx.customerOrder.findMany.mockResolvedValue([]);
  tx.customerOrder.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "order-1",
    ...args.data,
  }));
  tx.orderItem.createMany.mockResolvedValue({ count: 1 });
  tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCustomerOrder - preflight", () => {
  it("maps invalid Zod input to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(
      createCustomerOrder({ source: "CASHIER" }),
      "INVALID_INPUT"
    );

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedOutletFindFirst).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied pricing, totals, or identity fields as INVALID_INPUT", async () => {
    for (const smuggled of [{ total: 1 }, { subtotal: 1 }, { tenantId: "evil" }, { userId: "x" }]) {
      const error = await expectDomainError(
        createCustomerOrder(baseOrder(smuggled)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("requires a dining table for QR_TABLE before context or database access", async () => {
    const error = await expectDomainError(
      createCustomerOrder(tableOrder({ diningTableId: undefined })),
      "TABLE_REQUIRED"
    );

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedOutletFindFirst).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and orders.manage", async () => {
    await createCustomerOrder(baseOrder({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "orders.manage");
  });

  it("keeps the context error and never reaches the database", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(createCustomerOrder(baseOrder()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedOutletFindFirst).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});

describe("createCustomerOrder - outlet preflight", () => {
  it("scopes the outlet lookup to the context tenant, outlet, and active flag", async () => {
    await createCustomerOrder(baseOrder());

    expect(mockedOutletFindFirst).toHaveBeenCalledTimes(1);
    expect(mockedOutletFindFirst).toHaveBeenCalledWith({
      where: {
        id: "outlet-ctx",
        tenantId: "tenant-ctx",
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        setting: { select: { timezone: true } },
      },
    });
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps a missing outlet to OUTLET_NOT_FOUND without opening a transaction", async () => {
    mockedOutletFindFirst.mockResolvedValue(null);

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "OUTLET_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });
});

describe("createCustomerOrder - success paths", () => {
  it("creates a CASHIER order without a table inside a single bounded transaction", async () => {
    const summary = await createCustomerOrder(baseOrder());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });

    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
    expect(createArgs().data.diningTableId).toBeNull();
    expect(summary.source).toBe("CASHIER");
    expect(summary.orderNumber).toBe(EXPECTED_ORDER_NUMBER);
  });

  it("validates a caller table against the authorized outletId from context", async () => {
    await createCustomerOrder(baseOrder({ diningTableId: "table-1" }));

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.findFirst).toHaveBeenCalledWith({
      where: { id: "table-1", outletId: "outlet-ctx", isActive: true },
      select: { id: true },
    });
    expect(createArgs().data.diningTableId).toBe("table-1");
  });

  it("creates a QR_TABLE order with a valid table", async () => {
    const summary = await createCustomerOrder(tableOrder());

    expect(tx.diningTable.findFirst).toHaveBeenCalledWith({
      where: { id: "table-1", outletId: "outlet-ctx", isActive: true },
      select: { id: true },
    });
    expect(summary.source).toBe("QR_TABLE");
    expect(createArgs().data.diningTableId).toBe("table-1");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls[0][1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("createCustomerOrder - transaction validation", () => {
  it("maps a missing table to TABLE_NOT_FOUND before the order is created", async () => {
    tx.diningTable.findFirst.mockResolvedValue(null);

    const error = await expectDomainError(createCustomerOrder(tableOrder()), "TABLE_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("queries menu items with tenant, outlet, item, and category filters", async () => {
    tx.menuItem.findMany.mockResolvedValue([menuRows[0], menuRows[1]]);
    tx.orderItem.createMany.mockResolvedValue({ count: 2 });

    await createCustomerOrder(
      baseOrder({
        items: [
          { menuItemId: "menu-1", quantity: 1 },
          { menuItemId: "menu-2", quantity: 2 },
        ],
      })
    );

    expect(tx.menuItem.findMany).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-ctx",
        outletId: "outlet-ctx",
        id: { in: ["menu-1", "menu-2"] },
        isActive: true,
        deletedAt: null,
        isSoldOut: false,
        category: { isActive: true, deletedAt: null },
      },
      select: { id: true, name: true, price: true },
    });
  });

  it("maps a partial or unorderable menu result to MENU_ITEM_UNAVAILABLE", async () => {
    tx.menuItem.findMany.mockResolvedValue([menuRows[0]]);

    const error = await expectDomainError(
      createCustomerOrder(
        baseOrder({
          items: [
            { menuItemId: "menu-1", quantity: 1 },
            { menuItemId: "menu-2", quantity: 1 },
          ],
        })
      ),
      "MENU_ITEM_UNAVAILABLE"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("prices every line and the order from database rows, not the payload", async () => {
    tx.menuItem.findMany.mockResolvedValue([menuRows[1], menuRows[0]]);
    tx.orderItem.createMany.mockResolvedValue({ count: 2 });

    const summary = await createCustomerOrder(
      baseOrder({
        items: [
          { menuItemId: "menu-1", quantity: 2 },
          { menuItemId: "menu-2", quantity: 3 },
        ],
      })
    );

    const rows = createManyRows();
    expect(rows.map((row) => row.menuItemId)).toEqual(["menu-1", "menu-2"]);
    expect(rows.map((row) => row.menuNameSnapshot)).toEqual(["Nasi Goreng", "Es Teh"]);
    expect(rows.map((row) => row.unitPrice)).toEqual([25_000, 5_000]);
    expect(rows.map((row) => row.subtotal)).toEqual([50_000, 15_000]);

    expect(createArgs().data.subtotal).toBe(65_000);
    expect(createArgs().data.total).toBe(65_000);
    expect(createArgs().data.taxAmount).toBe(0);
    expect(createArgs().data.serviceAmount).toBe(0);
    expect(summary.subtotal).toBe(65_000);
    expect(summary.total).toBe(65_000);
  });

  it("takes tenantId, outletId, and createdByUserId from the context actor", async () => {
    await createCustomerOrder(baseOrder());

    expect(createArgs().data.tenantId).toBe("tenant-ctx");
    expect(createArgs().data.outletId).toBe("outlet-ctx");
    expect(createArgs().data.createdByUserId).toBe("user-1");
    expect(createArgs().data.status).toBe("RECEIVED");
    expect(createArgs().data.version).toBe(1);
  });

  it("writes trimmed customer name, order note, and item note", async () => {
    await createCustomerOrder(
      baseOrder({
        customerName: "  Budi Santoso  ",
        note: "  tanpa sambal  ",
        items: [{ menuItemId: "menu-1", quantity: 1, note: "  sedikit pedas  " }],
      })
    );

    expect(createArgs().data.customerName).toBe("Budi Santoso");
    expect(createArgs().data.note).toBe("tanpa sambal");
    expect(createManyRows()[0].note).toBe("sedikit pedas");
  });

  it("writes null for empty or missing customer name, order note, and item note", async () => {
    await createCustomerOrder(
      baseOrder({
        customerName: "   ",
        note: "",
        items: [{ menuItemId: "menu-1", quantity: 1 }],
      })
    );

    expect(createArgs().data.customerName).toBeNull();
    expect(createArgs().data.note).toBeNull();
    expect(createManyRows()[0].note).toBeNull();
  });

  it("writes createMany rows with trusted tenant, outlet, order, and menu snapshots", async () => {
    await createCustomerOrder(
      baseOrder({ items: [{ menuItemId: "menu-1", quantity: 2, note: "x" }] })
    );

    expect(tx.orderItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.orderItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: "tenant-ctx",
          outletId: "outlet-ctx",
          orderId: "order-1",
          menuItemId: "menu-1",
          menuNameSnapshot: "Nasi Goreng",
          unitPrice: 25_000,
          quantity: 2,
          note: "x",
          subtotal: 50_000,
        },
      ],
    });
  });

  it("throws INTERNAL_ERROR when the createMany count mismatches and skips the activity log", async () => {
    tx.menuItem.findMany.mockResolvedValue([menuRows[0], menuRows[1]]);
    tx.orderItem.createMany.mockResolvedValue({ count: 1 });

    const error = await expectDomainError(
      createCustomerOrder(
        baseOrder({
          items: [
            { menuItemId: "menu-1", quantity: 1 },
            { menuItemId: "menu-2", quantity: 1 },
          ],
        })
      ),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("writes the activity log after the order and the items with an approved payload", async () => {
    const callOrder: string[] = [];
    tx.customerOrder.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      callOrder.push("order");
      return { id: "order-1", ...args.data };
    });
    tx.orderItem.createMany.mockImplementation(async () => {
      callOrder.push("items");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("log");
      return { id: "log-1" };
    });
    tx.customerOrder.findMany.mockResolvedValue([
      { orderNumber: `${EXPECTED_PREFIX}0007` },
      { orderNumber: `${EXPECTED_PREFIX}0003` },
      { orderNumber: "OUT-JKT-20260309-0099" },
    ]);

    await createCustomerOrder(baseOrder());

    expect(callOrder).toEqual(["order", "items", "log"]);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-ctx",
        outletId: "outlet-ctx",
        userId: "user-1",
        action: "order.created",
        entity: "CustomerOrder",
        entityId: "order-1",
        before: Prisma.DbNull,
        after: {
          orderNumber: `${EXPECTED_PREFIX}0008`,
          source: "CASHIER",
          status: "RECEIVED",
          subtotal: 25_000,
          total: 25_000,
          itemLineCount: 1,
        },
      },
    });
    expect(createArgs().data.orderNumber).toBe(`${EXPECTED_PREFIX}0008`);
    expect(tx.customerOrder.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-ctx",
        outletId: "outlet-ctx",
        orderNumber: { startsWith: EXPECTED_PREFIX },
      },
      select: { orderNumber: true },
    });
  });

  it("returns only the approved summary fields", async () => {
    const summary = await createCustomerOrder(baseOrder());

    expect(summary).toEqual({
      id: "order-1",
      orderNumber: EXPECTED_ORDER_NUMBER,
      source: "CASHIER",
      status: "RECEIVED",
      subtotal: 25_000,
      total: 25_000,
      version: 1,
    });
    expect(Object.keys(summary).sort()).toEqual([
      "id",
      "orderNumber",
      "source",
      "status",
      "subtotal",
      "total",
      "version",
    ]);
  });
});

describe("createCustomerOrder - error mapping", () => {
  it("maps an empty preflight database error to INTERNAL_ERROR without leaking details", async () => {
    mockedOutletFindFirst.mockRejectedValue(new Error(""));

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("maps an unknown transaction error to INTERNAL_ERROR without leaking database details", async () => {
    tx.customerOrder.create.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("createCustomerOrder - order number retry", () => {
  it("retries with a fresh transaction after an orderNumber unique violation and returns the second attempt", async () => {
    let createAttempts = 0;
    tx.customerOrder.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      createAttempts += 1;
      if (createAttempts === 1) {
        throw orderNumberConflict();
      }
      return { id: "order-2", ...args.data };
    });

    let reads = 0;
    tx.customerOrder.findMany.mockImplementation(async () => {
      reads += 1;
      return reads === 1 ? [] : [{ orderNumber: `${EXPECTED_PREFIX}0001` }];
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(mockedTransaction).toHaveBeenCalledTimes(2);
    expectBoundedTransactions();
    expect(mockedTransaction.mock.calls[0][0]).not.toBe(mockedTransaction.mock.calls[1][0]);
    expect(reads).toBe(2);
    expect(queriedPrefixes()).toEqual([EXPECTED_PREFIX, EXPECTED_PREFIX]);

    expect(summary.id).toBe("order-2");
    expect(summary.orderNumber).toBe(`${EXPECTED_PREFIX}0002`);
    expect(tx.orderItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(createAttempts).toBe(2);
  });

  it("stops after exactly MAX_ORDER_CREATE_ATTEMPTS conflicts and reports ORDER_NUMBER_CONFLICT", async () => {
    expect(MAX_ORDER_CREATE_ATTEMPTS).toBe(5);

    tx.customerOrder.create.mockImplementation(async () => {
      throw orderNumberConflict();
    });

    const error = await expectDomainError(
      createCustomerOrder(baseOrder()),
      "ORDER_NUMBER_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(mockedTransaction).toHaveBeenCalledTimes(5);
    expect(mockedTransaction.mock.calls).toHaveLength(5);
    expectBoundedTransactions();
    expect(tx.customerOrder.findMany).toHaveBeenCalledTimes(5);
    expect(tx.customerOrder.create).toHaveBeenCalledTimes(5);
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("does not retry a P2002 violation on a non-orderNumber unique target", async () => {
    tx.customerOrder.create.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "outletId", "id"] });
    });

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("tenantId");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.customerOrder.create).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2002 violation without a meta target", async () => {
    tx.customerOrder.create.mockImplementation(async () => {
      throw prismaError("P2002");
    });

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.customerOrder.create).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2002 violation with a partial target", async () => {
    tx.customerOrder.create.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["orderNumber"] });
    });

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.customerOrder.create).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2003 violation and maps it through toOrderError", async () => {
    tx.customerOrder.create.mockImplementation(async () => {
      throw prismaError("P2003", { field_name: ["outletId"] });
    });

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INVALID_INPUT"));
    expect(error?.message).not.toContain("simulated prisma");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.customerOrder.create).toHaveBeenCalledTimes(1);
  });
});

describe("createCustomerOrder - sequence limit", () => {
  it("issues sequence 9999 when the highest existing sequence is 9998", async () => {
    tx.customerOrder.findMany.mockResolvedValue([{ orderNumber: `${EXPECTED_PREFIX}9998` }]);

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe(`${EXPECTED_PREFIX}9999`);
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("reports ORDER_LIMIT_REACHED at sequence 9999 without writing or retrying", async () => {
    tx.customerOrder.findMany.mockResolvedValue([{ orderNumber: `${EXPECTED_PREFIX}9999` }]);

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "ORDER_LIMIT_REACHED");

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
  });

  it("uses the highest numeric sequence instead of counting existing rows", async () => {
    tx.customerOrder.findMany.mockResolvedValue([
      { orderNumber: `${EXPECTED_PREFIX}0001` },
      { orderNumber: `${EXPECTED_PREFIX}0004` },
      { orderNumber: `${EXPECTED_PREFIX}0002` },
    ]);

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe(`${EXPECTED_PREFIX}0005`);
  });

  it("ignores foreign and malformed order numbers outside the current prefix", async () => {
    tx.customerOrder.findMany.mockResolvedValue([
      { orderNumber: "OUT-OTHER-20260310-9999" },
      { orderNumber: "OUT-JKT-20260309-9999" },
      { orderNumber: `${EXPECTED_PREFIX}NOT-A-SEQ` },
      { orderNumber: `${EXPECTED_PREFIX}0003` },
    ]);

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe(`${EXPECTED_PREFIX}0004`);
    expect(tx.customerOrder.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-ctx",
        outletId: "outlet-ctx",
        orderNumber: { startsWith: EXPECTED_PREFIX },
      },
      select: { orderNumber: true },
    });
  });
});

describe("createCustomerOrder - stable prefix across retries", () => {
  it("keeps the prefix captured before the first attempt when the local day rolls over", async () => {
    vi.setSystemTime(new Date("2026-03-10T16:59:00.000Z"));

    let createAttempts = 0;
    tx.customerOrder.create.mockImplementation(async (args: { data: Record<string, unknown> }) => {
      createAttempts += 1;
      if (createAttempts === 1) {
        vi.setSystemTime(new Date("2026-03-10T17:05:00.000Z"));
        throw orderNumberConflict();
      }
      return { id: "order-2", ...args.data };
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(new Date().toISOString()).toBe("2026-03-10T17:05:00.000Z");
    expect(mockedTransaction).toHaveBeenCalledTimes(2);
    expect(mockedOutletFindFirst).toHaveBeenCalledTimes(1);
    expect(queriedPrefixes()).toEqual(["OUT-JKT-20260310-", "OUT-JKT-20260310-"]);
    expect(summary.orderNumber).toBe("OUT-JKT-20260310-0001");
    expect(summary.id).toBe("order-2");
  });
});

describe("createCustomerOrder - timezone resolution", () => {
  const LATE_UTC = "2026-03-10T17:30:00.000Z";

  it("falls back to DEFAULT_TIMEZONE when the outlet has no OutletSetting row", async () => {
    vi.setSystemTime(new Date(LATE_UTC));
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: null,
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20260311-0001");
  });

  it("falls back to DEFAULT_TIMEZONE when the timezone is null", async () => {
    vi.setSystemTime(new Date(LATE_UTC));
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: { timezone: null },
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20260311-0001");
  });

  it("falls back to DEFAULT_TIMEZONE when the timezone is an empty string", async () => {
    vi.setSystemTime(new Date(LATE_UTC));
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: { timezone: "" },
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20260311-0001");
  });

  it("falls back to DEFAULT_TIMEZONE when the timezone is whitespace only", async () => {
    vi.setSystemTime(new Date(LATE_UTC));
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: { timezone: "    " },
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20260311-0001");
  });

  it("trims a non-empty timezone before resolving the date part", async () => {
    vi.setSystemTime(new Date(LATE_UTC));
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: { timezone: "  UTC  " },
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20260310-0001");
  });

  it("maps an invalid timezone to INTERNAL_ERROR without opening a transaction", async () => {
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "JKT",
      setting: { timezone: "Not/AZone" },
    });

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
  });

  it("resolves 2026-09-30T17:30:00Z in Asia/Jakarta to the 20261001 date prefix", async () => {
    vi.setSystemTime(new Date("2026-09-30T17:30:00.000Z"));

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-JKT-20261001-0001");
    expect(queriedPrefixes()).toEqual(["OUT-JKT-20261001-"]);
  });

  it("keeps the order number parseable when the outlet code contains a hyphen", async () => {
    mockedOutletFindFirst.mockResolvedValue({
      id: "outlet-ctx",
      code: "pusat-kota",
      setting: { timezone: "Asia/Jakarta" },
    });

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.orderNumber).toBe("OUT-pusat-kota-20260310-0001");
    expect(parseSequence(summary.orderNumber)).toBe(1);
  });
});

describe("createCustomerOrder - INT32 pricing hardening", () => {
  it("accepts a single line whose value equals MAX_MONEY exactly", async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: "menu-1", name: "Paket Utama", price: MAX_MONEY },
    ]);

    const summary = await createCustomerOrder(baseOrder());

    expect(summary.subtotal).toBe(MAX_MONEY);
    expect(summary.total).toBe(MAX_MONEY);
    expect(createArgs().data.subtotal).toBe(MAX_MONEY);
    expect(createArgs().data.total).toBe(MAX_MONEY);
    expect(createManyRows()[0].subtotal).toBe(MAX_MONEY);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a single line above MAX_MONEY without writing or retrying", async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: "menu-1", name: "Paket Utama", price: MAX_MONEY },
    ]);

    const error = await expectDomainError(
      createCustomerOrder(baseOrder({ items: [{ menuItemId: "menu-1", quantity: 2 }] })),
      "AMOUNT_OUT_OF_RANGE"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
  });

  it("accepts two lines whose accumulated total equals MAX_MONEY exactly", async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: "menu-1", name: "Paket A", price: MAX_MONEY - 1_000 },
      { id: "menu-2", name: "Paket B", price: 1_000 },
    ]);
    tx.orderItem.createMany.mockResolvedValue({ count: 2 });

    const summary = await createCustomerOrder(
      baseOrder({
        items: [
          { menuItemId: "menu-1", quantity: 1 },
          { menuItemId: "menu-2", quantity: 1 },
        ],
      })
    );

    expect(summary.subtotal).toBe(MAX_MONEY);
    expect(summary.total).toBe(MAX_MONEY);
    expect(createManyRows().map((row) => row.subtotal)).toEqual([MAX_MONEY - 1_000, 1_000]);
  });

  it("rejects an accumulated total above MAX_MONEY without writing or retrying", async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: "menu-1", name: "Paket A", price: MAX_MONEY - 1_000 },
      { id: "menu-2", name: "Paket B", price: 1_001 },
    ]);
    tx.orderItem.createMany.mockResolvedValue({ count: 2 });

    const error = await expectDomainError(
      createCustomerOrder(
        baseOrder({
          items: [
            { menuItemId: "menu-1", quantity: 1 },
            { menuItemId: "menu-2", quantity: 1 },
          ],
        })
      ),
      "AMOUNT_OUT_OF_RANGE"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
  });
});

describe("createCustomerOrder - atomicity and defensive checks", () => {
  it("keeps an OrderDomainError raised inside the transaction without retrying", async () => {
    const domainError = new OrderDomainError("MENU_ITEM_UNAVAILABLE");
    tx.menuItem.findMany.mockRejectedValue(domainError);

    const error = await captureError(createCustomerOrder(baseOrder()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("MENU_ITEM_UNAVAILABLE");
    expect(error?.message).toBe(getOrderErrorMessage("MENU_ITEM_UNAVAILABLE"));
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedOutletFindFirst).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("skips the order items and the activity log when the order insert fails", async () => {
    tx.customerOrder.create.mockRejectedValue(new Error("insert failed"));

    const error = await expectDomainError(createCustomerOrder(baseOrder()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an unexpected menu row set to MENU_ITEM_UNAVAILABLE before any write", async () => {
    tx.menuItem.findMany.mockResolvedValue([
      { id: "menu-1", name: "Nasi Goreng", price: 25_000 },
      { id: "menu-9", name: "Tidak Dipesan", price: 1_000 },
    ]);

    const error = await expectDomainError(
      createCustomerOrder(
        baseOrder({
          items: [
            { menuItemId: "menu-1", quantity: 1 },
            { menuItemId: "menu-2", quantity: 1 },
          ],
        })
      ),
      "MENU_ITEM_UNAVAILABLE"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.create).not.toHaveBeenCalled();
    expect(tx.orderItem.createMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});
