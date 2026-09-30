import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requireActiveUser,
  requireOutletAccess,
  requirePermission,
} from "@/lib/auth/authorization";
import { requireOrderContext, type OrderPermissionKey } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage, type OrderErrorCode } from "@/lib/order/errors";

vi.mock("@/lib/auth/authorization", () => ({
  requireActiveUser: vi.fn(),
  requireOutletAccess: vi.fn(),
  requirePermission: vi.fn(),
}));

type ActiveUserResult = Awaited<ReturnType<typeof requireActiveUser>>;
type OutletResult = Awaited<ReturnType<typeof requireOutletAccess>>;

const mockedActiveUser = vi.mocked(requireActiveUser);
const mockedOutletAccess = vi.mocked(requireOutletAccess);
const mockedPermission = vi.mocked(requirePermission);

function makeActiveUser(userId = "user-1", tenantId = "tenant-1"): ActiveUserResult {
  return {
    user: { id: userId, tenantId },
    tenant: { id: tenantId },
  } as unknown as ActiveUserResult;
}

function makeOutlet(outletId: string): OutletResult {
  return { id: outletId } as unknown as OutletResult;
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
  code: OrderErrorCode
): Promise<OrderDomainError | null> {
  const error = await captureError(promise);
  expect(error).toBeInstanceOf(OrderDomainError);
  expect(error?.code).toBe(code);
  expect(error?.message).toBe(getOrderErrorMessage(code));
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedActiveUser.mockResolvedValue(makeActiveUser());
  mockedOutletAccess.mockResolvedValue(makeOutlet("outlet-1"));
  mockedPermission.mockResolvedValue(true);
});

describe("requireOrderContext - input validation", () => {
  it("rejects empty or whitespace-only outletId before any auth helper runs", async () => {
    for (const badOutletId of ["", "   "]) {
      const error = await expectDomainError(
        requireOrderContext(badOutletId, "orders.manage"),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }
    expect(mockedActiveUser).not.toHaveBeenCalled();
    expect(mockedOutletAccess).not.toHaveBeenCalled();
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it("rejects non-string outletId via runtime cast before any auth helper runs", async () => {
    const error = await expectDomainError(
      requireOrderContext(42 as unknown as string, "orders.manage"),
      "INVALID_INPUT"
    );
    expect(error).not.toBeNull();
    expect(mockedActiveUser).not.toHaveBeenCalled();
    expect(mockedOutletAccess).not.toHaveBeenCalled();
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it("rejects foreign or non-exact permission keys via runtime cast before any auth helper runs", async () => {
    const foreignPermissions = [
      "orders.view",
      "reports.view",
      " Orders.manage",
      "orders.manage ",
      "",
      7,
    ];
    for (const foreignPermission of foreignPermissions) {
      const error = await expectDomainError(
        requireOrderContext("outlet-1", foreignPermission as OrderPermissionKey),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }
    expect(mockedActiveUser).not.toHaveBeenCalled();
    expect(mockedOutletAccess).not.toHaveBeenCalled();
    expect(mockedPermission).not.toHaveBeenCalled();
  });
});

describe("requireOrderContext - success", () => {
  it("returns a trusted context for orders.manage", async () => {
    const context = await requireOrderContext("outlet-1", "orders.manage");

    expect(context).toEqual({
      actor: { userId: "user-1", tenantId: "tenant-1" },
      outletId: "outlet-1",
    });
    expect(mockedActiveUser).toHaveBeenCalledTimes(1);
    expect(mockedOutletAccess).toHaveBeenCalledWith("outlet-1");
    expect(mockedPermission).toHaveBeenCalledWith("orders.manage");
  });

  it("returns a trusted context for menu.view", async () => {
    const context = await requireOrderContext("outlet-1", "menu.view");

    expect(context.actor).toEqual({ userId: "user-1", tenantId: "tenant-1" });
    expect(context.outletId).toBe("outlet-1");
    expect(mockedOutletAccess).toHaveBeenCalledWith("outlet-1");
    expect(mockedPermission).toHaveBeenCalledWith("menu.view");
  });

  it("takes actor identity only from the active-user helper result", async () => {
    mockedActiveUser.mockResolvedValue(makeActiveUser("user-from-session", "tenant-from-session"));

    const context = await requireOrderContext("outlet-1", "orders.manage");

    expect(context.actor).toEqual({
      userId: "user-from-session",
      tenantId: "tenant-from-session",
    });
  });

  it("trims outletId and uses the normalized value for helper calls and the returned context", async () => {
    const context = await requireOrderContext("  outlet-1  ", "orders.manage");

    expect(context.outletId).toBe("outlet-1");
    expect(mockedOutletAccess).toHaveBeenCalledWith("outlet-1");
    expect(mockedActiveUser).toHaveBeenCalledTimes(1);
  });

  it("checks active user, outlet access, then permission before returning the context", async () => {
    const callOrder: string[] = [];
    mockedActiveUser.mockImplementation(async () => {
      callOrder.push("active-user");
      return makeActiveUser();
    });
    mockedOutletAccess.mockImplementation(async (outletId: string) => {
      callOrder.push(`outlet-access:${outletId}`);
      return makeOutlet(outletId);
    });
    mockedPermission.mockImplementation(async (permissionKey: string) => {
      callOrder.push(`permission:${permissionKey}`);
      return true;
    });

    const context = await requireOrderContext("outlet-1", "orders.manage");

    expect(callOrder).toEqual([
      "active-user",
      "outlet-access:outlet-1",
      "permission:orders.manage",
    ]);
    expect(context.outletId).toBe("outlet-1");
  });
});

describe("requireOrderContext - error mapping", () => {
  it("maps active-user failure to UNAUTHENTICATED without leaking the generic message", async () => {
    mockedActiveUser.mockRejectedValue(new Error("Unauthorized"));

    const error = await expectDomainError(
      requireOrderContext("outlet-1", "orders.manage"),
      "UNAUTHENTICATED"
    );
    expect(error?.message).not.toContain("Unauthorized");
    expect(mockedOutletAccess).not.toHaveBeenCalled();
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it("maps outlet-access failure to OUTLET_ACCESS_DENIED without leaking the generic message", async () => {
    mockedOutletAccess.mockRejectedValue(new Error("Outlet not found or access denied"));

    const error = await expectDomainError(
      requireOrderContext("outlet-1", "orders.manage"),
      "OUTLET_ACCESS_DENIED"
    );
    expect(error?.message).not.toContain("Outlet not found");
    expect(error?.message).not.toContain("access denied");
    expect(mockedActiveUser).toHaveBeenCalledTimes(1);
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it("maps permission failure to OUTLET_ACCESS_DENIED without leaking the generic message", async () => {
    mockedPermission.mockRejectedValue(new Error("Permission denied"));

    const error = await expectDomainError(
      requireOrderContext("outlet-1", "orders.manage"),
      "OUTLET_ACCESS_DENIED"
    );
    expect(error?.message).toBe(getOrderErrorMessage("OUTLET_ACCESS_DENIED"));
    expect(error?.message).not.toContain("Permission denied");
    expect(mockedActiveUser).toHaveBeenCalledTimes(1);
    expect(mockedOutletAccess).toHaveBeenCalledTimes(1);
  });

  it("maps an unexpected error outside the auth failures to INTERNAL_ERROR", async () => {
    mockedActiveUser.mockResolvedValue({
      get user(): never {
        throw new Error("boom outside authorization");
      },
    } as unknown as ActiveUserResult);

    const error = await expectDomainError(
      requireOrderContext("outlet-1", "orders.manage"),
      "INTERNAL_ERROR"
    );
    expect(error?.message).not.toContain("boom");
  });
});

describe("requireOrderContext - API surface", () => {
  it("accepts only outletId and permission; caller-supplied identity is ignored", async () => {
    expect(requireOrderContext).toHaveLength(2);

    const callWithExtraArgs = requireOrderContext as unknown as (
      outletId: string,
      permission: OrderPermissionKey,
      extra?: unknown
    ) => Promise<Awaited<ReturnType<typeof requireOrderContext>>>;
    const context = await callWithExtraArgs("outlet-1", "orders.manage", {
      userId: "evil-user",
      tenantId: "evil-tenant",
      actor: { userId: "evil-user", tenantId: "evil-tenant" },
    });

    expect(context.actor).toEqual({ userId: "user-1", tenantId: "tenant-1" });
    expect(context.outletId).toBe("outlet-1");
    expect(mockedActiveUser).toHaveBeenCalledWith();
    expect(mockedOutletAccess).toHaveBeenCalledWith("outlet-1");
    expect(mockedPermission).toHaveBeenCalledWith("orders.manage");
  });
});
