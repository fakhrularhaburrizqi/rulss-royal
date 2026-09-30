import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import { updateOrderStatus } from "@/lib/services/order-status.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

const tx = {
  customerOrder: { findFirst: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedTransaction = db.$transaction as unknown as Mock;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const orderRow = {
  id: "order-1",
  orderNumber: "OUT-JKT-20260310-0001",
  status: "RECEIVED",
  version: 1,
};

function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    orderId: "order-1",
    status: "PREPARING",
    version: 1,
    ...overrides,
  };
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

function findFirstArgs(): { where: Record<string, unknown>; select: Record<string, boolean> } {
  return tx.customerOrder.findFirst.mock.calls[0]?.[0];
}

function updateArgs(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  return tx.customerOrder.updateMany.mock.calls[0]?.[0];
}

function logArgs(): { data: Record<string, unknown> } {
  return tx.activityLog.create.mock.calls[0]?.[0];
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

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedTransaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)
  );
  tx.customerOrder.findFirst.mockResolvedValue(orderRow);
  tx.customerOrder.updateMany.mockResolvedValue({ count: 1 });
  tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

describe("updateOrderStatus - input and authorization", () => {
  it("maps invalid Zod input to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(updateOrderStatus({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.customerOrder.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, actor, currentStatus, or permission fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { currentStatus: "READY" },
      { permission: true },
      { note: "x" },
    ]) {
      const error = await expectDomainError(updateOrderStatus(baseInput(foreign)), "INVALID_INPUT");
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and orders.manage", async () => {
    await updateOrderStatus(baseInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "orders.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(updateOrderStatus(baseInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.customerOrder.findFirst).not.toHaveBeenCalled();
  });
});

describe("updateOrderStatus - lookup and tenant isolation", () => {
  it("scopes the order lookup to the input id, the actor tenant, and the authorized outlet", async () => {
    await updateOrderStatus(baseInput());

    expect(tx.customerOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(findFirstArgs().where).toEqual({
      id: "order-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
  });

  it("selects only the id, orderNumber, status, and version fields", async () => {
    await updateOrderStatus(baseInput());

    expect(findFirstArgs().select).toEqual({
      id: true,
      orderNumber: true,
      status: true,
      version: true,
    });
  });

  it("never scopes the lookup with the raw input outletId", async () => {
    await updateOrderStatus(baseInput({ outletId: "  outlet-raw  " }));

    const where = findFirstArgs().where;
    expect(where.outletId).toBe("outlet-ctx");
    expect(where.outletId).not.toBe("outlet-raw");
    expect(where.outletId).not.toBe("  outlet-raw  ");
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "orders.manage");
  });

  it("maps a missing order to ORDER_NOT_FOUND without updating or logging", async () => {
    tx.customerOrder.findFirst.mockResolvedValue(null);

    const error = await expectDomainError(updateOrderStatus(baseInput()), "ORDER_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateOrderStatus - optimistic concurrency", () => {
  it("reports VERSION_CONFLICT when the input version differs from the stored version", async () => {
    const error = await expectDomainError(
      updateOrderStatus(baseInput({ version: 99 })),
      "VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("checks the version before the transition so a stale write never reaches assertTransition", async () => {
    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "RECEIVED", version: 99 })),
      "VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("INVALID_TRANSITION");
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("reports VERSION_CONFLICT when the conditional update matches no row", async () => {
    tx.customerOrder.updateMany.mockResolvedValue({ count: 0 });

    const error = await expectDomainError(updateOrderStatus(baseInput()), "VERSION_CONFLICT");

    expect(error).not.toBeNull();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("never retries a conflict and runs the transaction exactly once", async () => {
    tx.customerOrder.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(updateOrderStatus(baseInput()), "VERSION_CONFLICT");

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.customerOrder.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.customerOrder.updateMany).toHaveBeenCalledTimes(1);
  });

  it("treats a non-one updateMany count as a conflict without logging or succeeding", async () => {
    tx.customerOrder.updateMany.mockResolvedValue({ count: 2 });

    const error = await expectDomainError(updateOrderStatus(baseInput()), "VERSION_CONFLICT");

    expect(error).not.toBeNull();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateOrderStatus - transition rules", () => {
  it("rejects a self transition", async () => {
    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "RECEIVED" })),
      "INVALID_TRANSITION"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("rejects a backward transition", async () => {
    tx.customerOrder.findFirst.mockResolvedValue({ ...orderRow, status: "READY" });

    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "PREPARING" })),
      "INVALID_TRANSITION"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a skip-forward transition", async () => {
    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "READY" })),
      "INVALID_TRANSITION"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
  });

  it("rejects any transition out of COMPLETED", async () => {
    tx.customerOrder.findFirst.mockResolvedValue({ ...orderRow, status: "COMPLETED" });

    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "CANCELLED" })),
      "INVALID_TRANSITION"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("rejects any transition out of CANCELLED", async () => {
    tx.customerOrder.findFirst.mockResolvedValue({ ...orderRow, status: "CANCELLED" });

    const error = await expectDomainError(
      updateOrderStatus(baseInput({ status: "PREPARING" })),
      "INVALID_TRANSITION"
    );

    expect(error).not.toBeNull();
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  const validTransitions: ReadonlyArray<readonly [string, string]> = [
    ["RECEIVED", "PREPARING"],
    ["RECEIVED", "CANCELLED"],
    ["PREPARING", "READY"],
    ["PREPARING", "CANCELLED"],
    ["READY", "COMPLETED"],
    ["READY", "CANCELLED"],
  ];

  it.each(validTransitions)("allows %s -> %s", async (from, to) => {
    tx.customerOrder.findFirst.mockResolvedValue({ ...orderRow, status: from });

    const summary = await updateOrderStatus(baseInput({ status: to }));

    expect(summary.status).toBe(to);
    expect(summary.version).toBe(2);
    expect(updateArgs().where.status).toBe(from);
    expect(updateArgs().data).toEqual({ status: to, version: { increment: 1 } });
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });
});

describe("updateOrderStatus - update, activity log, and output", () => {
  it("writes the conditional update with id, tenant, outlet, current status, and current version", async () => {
    await updateOrderStatus(baseInput());

    expect(tx.customerOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(updateArgs().where).toEqual({
      id: "order-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      status: "RECEIVED",
      version: 1,
    });
  });

  it("writes the target status and increments the version by one", async () => {
    await updateOrderStatus(baseInput());

    expect(updateArgs().data).toEqual({
      status: "PREPARING",
      version: { increment: 1 },
    });
  });

  it("logs only after the conditional update succeeds", async () => {
    const callOrder: string[] = [];
    tx.customerOrder.findFirst.mockImplementation(async () => {
      callOrder.push("findFirst");
      return orderRow;
    });
    tx.customerOrder.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await updateOrderStatus(baseInput());

    expect(callOrder).toEqual(["findFirst", "updateMany", "activityLog"]);
  });

  it("writes the trusted tenant, outlet, user, action, entity, and entityId", async () => {
    await updateOrderStatus(baseInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toMatchObject({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "order.status.changed",
      entity: "CustomerOrder",
      entityId: "order-1",
    });
  });

  it("records before with the current status and version and after with the target values", async () => {
    await updateOrderStatus(baseInput());

    expect(logArgs().data.before).toEqual({ status: "RECEIVED", version: 1 });
    expect(logArgs().data.after).toEqual({ status: "PREPARING", version: 2 });
    expect(Object.keys(logArgs().data)).toEqual([
      "tenantId",
      "outletId",
      "userId",
      "action",
      "entity",
      "entityId",
      "before",
      "after",
    ]);
  });

  it("returns the new status and version without refetching the order", async () => {
    const summary = await updateOrderStatus(baseInput());

    expect(summary).toEqual({
      id: "order-1",
      orderNumber: "OUT-JKT-20260310-0001",
      status: "PREPARING",
      version: 2,
    });
    expect(Object.keys(summary).sort()).toEqual(["id", "orderNumber", "status", "version"]);
    expect(tx.customerOrder.findFirst).toHaveBeenCalledTimes(1);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await updateOrderStatus(baseInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("updateOrderStatus - error mapping", () => {
  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(updateOrderStatus(baseInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an unknown database error to INTERNAL_ERROR without leaking details", async () => {
    tx.customerOrder.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(updateOrderStatus(baseInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.customerOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps P2003 through toOrderError without retrying the transaction", async () => {
    tx.customerOrder.updateMany.mockImplementation(async () => {
      throw prismaError("P2003", { field_name: ["outletId"] });
    });

    const error = await expectDomainError(updateOrderStatus(baseInput()), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INVALID_INPUT"));
    expect(error?.message).not.toContain("simulated prisma");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});
