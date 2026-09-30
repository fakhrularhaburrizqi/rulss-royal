import { OrderSource } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createOrderAction, updateOrderStatusAction } from "@/app/dashboard/order-actions";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import { createCustomerOrder } from "@/lib/services/order-create.service";
import { updateOrderStatus } from "@/lib/services/order-status.service";

vi.mock("@/lib/services/order-create.service", () => ({
  createCustomerOrder: vi.fn(),
}));
vi.mock("@/lib/services/order-status.service", () => ({
  updateOrderStatus: vi.fn(),
}));

const mockedCreateCustomerOrder = vi.mocked(createCustomerOrder);
const mockedUpdateOrderStatus = vi.mocked(updateOrderStatus);

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    items: [{ menuItemId: "menu-1", quantity: 1 }],
    ...overrides,
  };
}

function updatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    orderId: "order-1",
    status: "PREPARING",
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedCreateCustomerOrder.mockResolvedValue({
    id: "order-1",
    orderNumber: "OUT-JKT-20260310-0001",
    source: "CASHIER",
    status: "RECEIVED",
    subtotal: 25_000,
    total: 25_000,
    version: 1,
  });
  mockedUpdateOrderStatus.mockResolvedValue({
    id: "order-1",
    orderNumber: "OUT-JKT-20260310-0001",
    status: "PREPARING",
    version: 2,
  });
});

describe("createOrderAction", () => {
  it("calls the create service exactly once for a valid payload", async () => {
    const result = await createOrderAction(createPayload());

    expect(result.ok).toBe(true);
    expect(mockedCreateCustomerOrder).toHaveBeenCalledTimes(1);
  });

  it("injects the server-side CASHIER source into the service call", async () => {
    await createOrderAction(createPayload());

    const argument = mockedCreateCustomerOrder.mock.calls[0][0] as Record<string, unknown>;

    expect(argument.source).toBe(OrderSource.CASHIER);
    expect(argument.source).toBe("CASHIER");
    expect(mockedCreateCustomerOrder).toHaveBeenCalledWith(
      expect.objectContaining({ source: "CASHIER" })
    );
  });

  it("rejects a payload carrying a client-supplied source", async () => {
    for (const source of ["CASHIER", "QR_TABLE"]) {
      const result = await createOrderAction(createPayload({ source }));

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
  });

  it("rejects a tenantId field", async () => {
    const result = await createOrderAction(createPayload({ tenantId: "tenant-1" }));

    expect(result.ok).toBe(false);
    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
  });

  it("rejects a createdByUserId field", async () => {
    const result = await createOrderAction(createPayload({ createdByUserId: "user-1" }));

    expect(result.ok).toBe(false);
    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
  });

  it("rejects price, subtotal and total fields", async () => {
    const payloads = [
      createPayload({ price: 1000 }),
      createPayload({ subtotal: 1000 }),
      createPayload({ total: 1000 }),
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, price: 1000 }] }),
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, subtotal: 1000 }] }),
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, total: 1000 }] }),
    ];

    for (const payload of payloads) {
      const result = await createOrderAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
  });

  it("rejects foreign nested item fields", async () => {
    const payloads = [
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, unitPrice: 5 }] }),
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, tenantId: "tenant-1" }] }),
      createPayload({ items: [{ menuItemId: "menu-1", quantity: 1, subtotal: 999 }] }),
    ];

    for (const payload of payloads) {
      const result = await createOrderAction(payload);

      expect(result.ok).toBe(false);
    }

    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
  });

  it("forwards trimmed and emptied normalization from the staff schema", async () => {
    const result = await createOrderAction({
      outletId: "  outlet-1  ",
      diningTableId: "  table-1  ",
      customerName: "  Budi  ",
      note: "   ",
      items: [{ menuItemId: "  menu-1  ", quantity: 2, note: "   " }],
    });

    expect(result.ok).toBe(true);
    expect(mockedCreateCustomerOrder).toHaveBeenCalledTimes(1);

    const argument = mockedCreateCustomerOrder.mock.calls[0][0] as Record<string, unknown>;

    expect(argument.outletId).toBe("outlet-1");
    expect(argument.diningTableId).toBe("table-1");
    expect(argument.customerName).toBe("Budi");
    expect(argument.note).toBeUndefined();
    expect(argument.items).toEqual([{ menuItemId: "menu-1", quantity: 2, note: undefined }]);
    expect(argument.source).toBe("CASHIER");
  });

  it("returns only orderId and orderNumber on success", async () => {
    const result = await createOrderAction(createPayload());

    expect(result).toEqual({
      ok: true,
      data: { orderId: "order-1", orderNumber: "OUT-JKT-20260310-0001" },
    });
    expect(Object.keys(result)).toEqual(["ok", "data"]);
    expect(Object.keys((result as { data: object }).data)).toEqual(["orderId", "orderNumber"]);
  });

  it("maps an OrderDomainError from the service to a safe failure", async () => {
    mockedCreateCustomerOrder.mockRejectedValue(new OrderDomainError("MENU_ITEM_UNAVAILABLE"));

    const result = await createOrderAction(createPayload());

    expect(result).toEqual({
      ok: false,
      code: "MENU_ITEM_UNAVAILABLE",
      message: getOrderErrorMessage("MENU_ITEM_UNAVAILABLE"),
    });
  });

  it("maps an unknown error to INTERNAL_ERROR without leaking details", async () => {
    mockedCreateCustomerOrder.mockRejectedValue(
      new Error("connect ECONNREFUSED 127.0.0.1:5432 password=hunter2")
    );

    const result = await createOrderAction(createPayload());

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: getOrderErrorMessage("INTERNAL_ERROR"),
    });
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(result)).not.toContain("5432");
    expect(Object.keys(result)).toEqual(["ok", "code", "message"]);
  });
});

describe("updateOrderStatusAction", () => {
  it("calls the status service with the parsed normalized data", async () => {
    const result = await updateOrderStatusAction({
      outletId: "  outlet-1  ",
      orderId: " order-1 ",
      status: "PREPARING",
      version: 1,
    });

    expect(result.ok).toBe(true);
    expect(mockedUpdateOrderStatus).toHaveBeenCalledTimes(1);
    expect(mockedUpdateOrderStatus).toHaveBeenCalledWith({
      outletId: "outlet-1",
      orderId: "order-1",
      status: "PREPARING",
      version: 1,
    });
  });

  it("returns only orderId, status and version on success", async () => {
    const result = await updateOrderStatusAction(updatePayload());

    expect(result).toEqual({
      ok: true,
      data: { orderId: "order-1", status: "PREPARING", version: 2 },
    });
    expect(Object.keys(result)).toEqual(["ok", "data"]);
    expect(Object.keys((result as { data: object }).data)).toEqual([
      "orderId",
      "status",
      "version",
    ]);
  });

  it("rejects a currentStatus field", async () => {
    const result = await updateOrderStatusAction(updatePayload({ currentStatus: "RECEIVED" }));

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: getOrderErrorMessage("INVALID_INPUT"),
    });
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("rejects tenantId, userId and permission fields", async () => {
    const payloads = [
      updatePayload({ tenantId: "tenant-1" }),
      updatePayload({ userId: "user-1" }),
      updatePayload({ actor: "user-1" }),
      updatePayload({ permission: "orders.manage" }),
    ];

    for (const payload of payloads) {
      const result = await updateOrderStatusAction(payload);

      expect(result).toEqual({
        ok: false,
        code: "INVALID_INPUT",
        message: getOrderErrorMessage("INVALID_INPUT"),
      });
    }

    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid status", async () => {
    const result = await updateOrderStatusAction(updatePayload({ status: "DELIVERED" }));

    expect(result.ok).toBe(false);
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("rejects a zero or fractional version", async () => {
    for (const version of [0, -1, 1.5]) {
      const result = await updateOrderStatusAction(updatePayload({ version }));

      expect(result.ok).toBe(false);
    }

    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("maps a VERSION_CONFLICT domain error", async () => {
    mockedUpdateOrderStatus.mockRejectedValue(new OrderDomainError("VERSION_CONFLICT"));

    const result = await updateOrderStatusAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "VERSION_CONFLICT",
      message: getOrderErrorMessage("VERSION_CONFLICT"),
    });
  });

  it("maps an INVALID_TRANSITION domain error", async () => {
    mockedUpdateOrderStatus.mockRejectedValue(new OrderDomainError("INVALID_TRANSITION"));

    const result = await updateOrderStatusAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
      message: getOrderErrorMessage("INVALID_TRANSITION"),
    });
  });

  it("maps an unknown error to INTERNAL_ERROR without leaking details", async () => {
    mockedUpdateOrderStatus.mockRejectedValue(
      new Error('query failed: SELECT * FROM "Order" token=SECRET')
    );

    const result = await updateOrderStatusAction(updatePayload());

    expect(result).toEqual({
      ok: false,
      code: "INTERNAL_ERROR",
      message: getOrderErrorMessage("INTERNAL_ERROR"),
    });
    expect(JSON.stringify(result)).not.toContain("SELECT");
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});

describe("order action results", () => {
  it("serializes every success and failure result with JSON.stringify", async () => {
    const createOk = await createOrderAction(createPayload());
    const updateOk = await updateOrderStatusAction(updatePayload());

    mockedCreateCustomerOrder.mockRejectedValue(new Error("boom"));
    mockedUpdateOrderStatus.mockRejectedValue(new OrderDomainError("VERSION_CONFLICT"));

    const createFail = await createOrderAction(createPayload());
    const updateFail = await updateOrderStatusAction(updatePayload());

    const invalidCreate = await createOrderAction({ bad: true });
    const invalidUpdate = await updateOrderStatusAction({ bad: true });

    for (const result of [
      createOk,
      updateOk,
      createFail,
      updateFail,
      invalidCreate,
      invalidUpdate,
    ]) {
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }

    expect(JSON.parse(JSON.stringify(createOk))).toEqual({
      ok: true,
      data: { orderId: "order-1", orderNumber: "OUT-JKT-20260310-0001" },
    });
  });

  it("never calls a service when validation fails", async () => {
    const createResult = await createOrderAction({});
    const updateResult = await updateOrderStatusAction({});

    expect(createResult.ok).toBe(false);
    expect(updateResult.ok).toBe(false);
    expect(mockedCreateCustomerOrder).not.toHaveBeenCalled();
    expect(mockedUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("keeps actor, tenant, user and error internals out of every result", async () => {
    mockedCreateCustomerOrder.mockRejectedValue(new Error("connect ECONNREFUSED password=hunter2"));
    mockedUpdateOrderStatus.mockRejectedValue(new OrderDomainError("ORDER_NOT_FOUND"));

    const results = [
      await createOrderAction(createPayload()),
      await createOrderAction(createPayload({ tenantId: "tenant-1" })),
      await updateOrderStatusAction(updatePayload()),
      await updateOrderStatusAction(updatePayload({ userId: "user-1" })),
    ];

    const serialized = JSON.stringify(results);

    for (const leak of ["tenantId", "userId", "stack", "hunter2", "ECONNREFUSED", "actor"]) {
      expect(serialized).not.toContain(leak);
    }

    for (const result of results) {
      const keys = Object.keys(result);

      if (result.ok) {
        expect(keys).toEqual(["ok", "data"]);
        continue;
      }

      expect(keys).toEqual(["ok", "code", "message"]);
      expect(typeof result.code).toBe("string");
      expect(typeof result.message).toBe("string");
    }
  });
});
