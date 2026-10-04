import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireActiveUser } from "@/lib/auth/authorization";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { OrderDomainError, getOrderErrorMessage, type OrderErrorCode } from "@/lib/order/errors";

vi.mock("@/lib/auth/authorization", () => ({
  requireActiveUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    userOutlet: { findMany: vi.fn() },
    userRole: { findMany: vi.fn() },
  },
}));

const mockedRequireActiveUser = vi.mocked(requireActiveUser);
const { db } = await import("@/lib/db");
const mockedUserOutletFindMany = vi.mocked(db.userOutlet.findMany);
const mockedUserRoleFindMany = vi.mocked(db.userRole.findMany);

type ActiveUserResult = Awaited<ReturnType<typeof requireActiveUser>>;

function makeActiveUser(userId = "user-1", tenantId = "tenant-1"): ActiveUserResult {
  return {
    user: { id: userId, tenantId },
    tenant: { id: tenantId },
  } as unknown as ActiveUserResult;
}

function makeOutlet(id: string, name: string, code: string) {
  return { id, name, code };
}

function makeOutletWithRelation(id: string, name: string, code: string) {
  return { outlet: makeOutlet(id, name, code) };
}

function makeUserOutletRecord(outlet: ReturnType<typeof makeOutlet>) {
  return {
    id: `uo-${outlet.id}`,
    tenantId: "tenant-1",
    userId: "user-1",
    outletId: outlet.id,
    createdAt: new Date(),
    outlet,
  };
}

function makeRoleWithPermissions(permissionKeys: string[]) {
  return {
    id: "role-1",
    tenantId: "tenant-1",
    userId: "user-1",
    roleId: "role-1",
    createdAt: new Date(),
    role: {
      id: "role-1",
      tenantId: "tenant-1",
      name: "Test Role",
      description: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      rolePermissions: permissionKeys.map((key) => ({
        id: `rp-${key}`,
        roleId: "role-1",
        permissionId: `perm-${key}`,
        createdAt: new Date(),
        role: {} as never,
        permission: { id: `perm-${key}`, key, module: "menu", description: null, createdAt: new Date(), updatedAt: new Date() },
      })),
    },
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
  mockedRequireActiveUser.mockResolvedValue(makeActiveUser());
  mockedUserOutletFindMany.mockResolvedValue([]);
  mockedUserRoleFindMany.mockResolvedValue([]);
});

describe("resolveDashboardContext - auth failure", () => {
  it("maps requireActiveUser failure to UNAUTHENTICATED", async () => {
    mockedRequireActiveUser.mockRejectedValue(new Error("Unauthorized"));

    await expectDomainError(
      resolveDashboardContext(Promise.resolve({})),
      "UNAUTHENTICATED"
    );

    expect(mockedUserOutletFindMany).not.toHaveBeenCalled();
  });

  it("maps searchParams rejection to INTERNAL_ERROR", async () => {
    const searchParams = Promise.reject(new Error("search params failed"));

    await expectDomainError(resolveDashboardContext(searchParams), "INTERNAL_ERROR");

    expect(mockedRequireActiveUser).not.toHaveBeenCalled();
  });
});

describe("resolveDashboardContext - outlet query", () => {
  it("calls requireActiveUser before outlet query", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Outlet Satu", "OUT1")),
    ]);

    await resolveDashboardContext(Promise.resolve({}));

    expect(mockedRequireActiveUser).toHaveBeenCalledTimes(1);
    expect(mockedUserOutletFindMany).toHaveBeenCalledTimes(1);
  });

  it("queries userOutlet with tenantId, userId, and outlet relation filter", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Outlet Satu", "OUT1")),
    ]);

    await resolveDashboardContext(Promise.resolve({}));

    expect(mockedUserOutletFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          userId: "user-1",
          outlet: expect.objectContaining({
            tenantId: "tenant-1",
            isActive: true,
            deletedAt: null,
          }),
        }),
        select: expect.objectContaining({
          outlet: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              name: true,
              code: true,
            }),
          }),
        }),
      })
    );
  });

  it("orders by outlet name asc then code asc then id asc", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-3", "Zeta", "Z")),
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-2", "Alpha", "B")),
    ]);

    const result = await resolveDashboardContext(Promise.resolve({}));

    expect(result.kind).toBe("selection-required");
    expect(result.outlets.map((o) => o.id)).toEqual(["outlet-1", "outlet-2", "outlet-3"]);
  });

  it("sorts by ID as final tiebreaker when name and code are identical", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-c", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-a", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-b", "Alpha", "A")),
    ]);

    const result = await resolveDashboardContext(Promise.resolve({}));

    expect(result.kind).toBe("selection-required");
    expect(result.outlets.map((o) => o.id)).toEqual(["outlet-a", "outlet-b", "outlet-c"]);
  });
});

describe("resolveDashboardContext - resolution precedence", () => {
  const threeOutlets = [
    makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
    makeUserOutletRecord(makeOutlet("outlet-2", "Beta", "B")),
    makeUserOutletRecord(makeOutlet("outlet-3", "Gamma", "C")),
  ];

  it("no outlet + missing param -> no-accessible-outlet", async () => {
    mockedUserOutletFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(Promise.resolve({}));

    expect(result).toEqual({ kind: "no-accessible-outlet", outlets: [] });
  });

  it("single outlet + missing param -> selected", async () => {
    mockedUserOutletFindMany.mockResolvedValue([threeOutlets[0]]);

    const result = await resolveDashboardContext(Promise.resolve({}));

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.outlet.id).toBe("outlet-1");
      expect(result.outlets).toHaveLength(1);
      expect(result.capabilities).toBeDefined();
    }
  });

  it("multiple outlets + missing param -> selection-required", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(Promise.resolve({}));

    expect(result.kind).toBe("selection-required");
    expect(result.outlets).toHaveLength(3);
  });

  it("explicit valid outlet ID -> selected", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-2" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.outlet.id).toBe("outlet-2");
      expect(result.outlets).toHaveLength(3);
      expect(result.capabilities).toBeDefined();
    }
  });

  it("explicit outlet ID trims whitespace", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "  outlet-2  " })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.outlet.id).toBe("outlet-2");
    }
  });

  it("explicit unknown outlet ID -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-unknown" })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(3);
  });

  it("empty string outlet -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "" })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(3);
  });

  it("whitespace-only string outlet -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "   " })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(3);
  });

  it("array outlet param -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: ["outlet-1", "outlet-2"] })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(3);
  });

  it("single-element array outlet param -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue(threeOutlets);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: ["outlet-1"] })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(3);
  });

  it("explicit unknown + zero outlets -> invalid-or-denied (no fallback)", async () => {
    mockedUserOutletFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-unknown" })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(0);
  });

  it("explicit empty + zero outlets -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "" })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(0);
  });

  it("explicit array + zero outlets -> invalid-or-denied", async () => {
    mockedUserOutletFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: ["outlet-1"] })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(result.outlets).toHaveLength(0);
  });
});

describe("resolveDashboardContext - selected result structure", () => {
  it("selected carries full authorized outlets list for selector", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-2", "Beta", "B")),
    ]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.outlets).toHaveLength(2);
      expect(result.outlets.map((o) => o.id)).toEqual(["outlet-1", "outlet-2"]);
    }
  });

  it("invalid-or-denied does not include raw invalid ID", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
    ]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "evil-id" })
    );

    expect(result.kind).toBe("invalid-or-denied");
    expect(JSON.stringify(result)).not.toContain("evil-id");
  });
});

describe("resolveDashboardContext - capabilities", () => {
  const outlets = [makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A"))];

  beforeEach(() => {
    mockedUserOutletFindMany.mockResolvedValue(outlets);
  });

  it("computes capabilities only for selected kind", async () => {
    mockedUserRoleFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    expect(mockedUserRoleFindMany).toHaveBeenCalledTimes(1);
  });

  it("does not compute capabilities for selection-required", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-2", "Beta", "B")),
    ]);

    await resolveDashboardContext(Promise.resolve({}));

    expect(mockedUserRoleFindMany).not.toHaveBeenCalled();
  });

  it("does not compute capabilities for no-accessible-outlet", async () => {
    mockedUserOutletFindMany.mockResolvedValue([]);

    await resolveDashboardContext(Promise.resolve({}));

    expect(mockedUserRoleFindMany).not.toHaveBeenCalled();
  });

  it("does not compute capabilities for invalid-or-denied", async () => {
    await resolveDashboardContext(Promise.resolve({ outlet: "unknown" }));

    expect(mockedUserRoleFindMany).not.toHaveBeenCalled();
  });

  it("queries userRole with tenantId and userId from active user", async () => {
    mockedUserRoleFindMany.mockResolvedValue([]);

    await resolveDashboardContext(Promise.resolve({ outlet: "outlet-1" }));

    expect(mockedUserRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          userId: "user-1",
        }),
        include: expect.objectContaining({
          role: expect.objectContaining({
            include: expect.objectContaining({
              rolePermissions: expect.objectContaining({
                include: expect.objectContaining({
                  permission: true,
                }),
              }),
            }),
          }),
        }),
      })
    );
  });

  it("menu.view only -> canViewCatalog true", async () => {
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions(["menu.view"])]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities).toEqual({
        canViewCatalog: true,
        canManageCatalog: false,
        canViewTables: false,
        canManageTables: false,
      });
    }
  });

  it("menu.manage only -> canManageCatalog true, view false", async () => {
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions(["menu.manage"])]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities).toEqual({
        canViewCatalog: false,
        canManageCatalog: true,
        canViewTables: false,
        canManageTables: false,
      });
    }
  });

  it("tables.view -> canViewTables true", async () => {
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions(["tables.view"])]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities.canViewTables).toBe(true);
      expect(result.capabilities.canManageTables).toBe(false);
    }
  });

  it("tables.manage -> canManageTables true", async () => {
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions(["tables.manage"])]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities.canManageTables).toBe(true);
      expect(result.capabilities.canViewTables).toBe(false);
    }
  });

  it("multiple roles combined permissions", async () => {
    mockedUserRoleFindMany.mockResolvedValue([
      makeRoleWithPermissions(["menu.view"]),
      makeRoleWithPermissions(["tables.manage"]),
    ]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities).toEqual({
        canViewCatalog: true,
        canManageCatalog: false,
        canViewTables: false,
        canManageTables: true,
      });
    }
  });

  it("no roles -> all capabilities false", async () => {
    mockedUserRoleFindMany.mockResolvedValue([]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities).toEqual({
        canViewCatalog: false,
        canManageCatalog: false,
        canViewTables: false,
        canManageTables: false,
      });
    }
  });

  it("roles with no permissions -> all capabilities false", async () => {
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions([])]);

    const result = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );

    expect(result.kind).toBe("selected");
    if (result.kind === "selected") {
      expect(result.capabilities).toEqual({
        canViewCatalog: false,
        canManageCatalog: false,
        canViewTables: false,
        canManageTables: false,
      });
    }
  });
});

describe("resolveDashboardContext - error handling", () => {
  const outlets = [makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A"))];

  beforeEach(() => {
    mockedUserOutletFindMany.mockResolvedValue(outlets);
  });

  it("outlet query error -> INTERNAL_ERROR", async () => {
    mockedUserOutletFindMany.mockRejectedValue(new Error("DB connection failed"));

    await expectDomainError(
      resolveDashboardContext(Promise.resolve({})),
      "INTERNAL_ERROR"
    );
  });

  it("permission query error -> INTERNAL_ERROR, not false capabilities", async () => {
    mockedUserRoleFindMany.mockRejectedValue(new Error("Permission query failed"));

    await expectDomainError(
      resolveDashboardContext(Promise.resolve({ outlet: "outlet-1" })),
      "INTERNAL_ERROR"
    );
  });

  it("error messages do not leak internal details", async () => {
    mockedUserOutletFindMany.mockRejectedValue(
      new Error("password=secret host=db.internal")
    );

    const error = await captureError(resolveDashboardContext(Promise.resolve({})));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("secret");
    expect(error?.message).not.toContain("host");
    expect(error?.message).not.toContain("db.internal");
  });
});

describe("resolveDashboardContext - serialization", () => {
  it("all result kinds are JSON serializable", async () => {
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
    ]);
    mockedUserRoleFindMany.mockResolvedValue([makeRoleWithPermissions(["menu.view"])]);

    const selected = await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1" })
    );
    expect(() => JSON.stringify(selected)).not.toThrow();

    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
      makeUserOutletRecord(makeOutlet("outlet-2", "Beta", "B")),
    ]);

    const required = await resolveDashboardContext(Promise.resolve({}));
    expect(() => JSON.stringify(required)).not.toThrow();

    mockedUserOutletFindMany.mockResolvedValue([]);

    const noAccess = await resolveDashboardContext(Promise.resolve({}));
    expect(() => JSON.stringify(noAccess)).not.toThrow();

    const denied = await resolveDashboardContext(
      Promise.resolve({ outlet: "unknown" })
    );
    expect(() => JSON.stringify(denied)).not.toThrow();
  });
});

describe("resolveDashboardContext - no caller-supplied actor", () => {
  it("identity comes only from requireActiveUser, not from params", async () => {
    mockedRequireActiveUser.mockResolvedValue(makeActiveUser("user-real", "tenant-real"));
    mockedUserOutletFindMany.mockResolvedValue([
      makeUserOutletRecord(makeOutlet("outlet-1", "Alpha", "A")),
    ]);
    mockedUserRoleFindMany.mockResolvedValue([]);

    await resolveDashboardContext(
      Promise.resolve({ outlet: "outlet-1", userId: "evil", tenantId: "evil-tenant" })
    );

    expect(mockedRequireActiveUser).toHaveBeenCalledWith();
    expect(mockedUserOutletFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-real",
          userId: "user-real",
        }),
      })
    );
  });
});