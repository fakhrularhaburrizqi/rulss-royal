import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  archiveMenuCategory,
  createMenuCategory,
  restoreMenuCategory,
  updateMenuCategory,
} from "@/lib/services/menu-category.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

const tx = {
  menuCategory: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  menuItem: { count: vi.fn() },
  activityLog: { create: vi.fn() },
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedTransaction = db.$transaction as unknown as Mock;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const CURRENT_UPDATED_AT = "2026-10-01T10:00:00.000Z";
const CURRENT_UPDATED_AT_MS = Date.parse(CURRENT_UPDATED_AT);

const ARCHIVED_DELETED_AT = "2026-09-01T08:30:00.000Z";

const createdRow = {
  id: "cat-9",
  name: "Makanan",
  sortOrder: 0,
  isActive: true,
  deletedAt: null,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const currentRow = {
  id: "cat-1",
  name: "Makanan Lama",
  sortOrder: 3,
  isActive: true,
  deletedAt: null,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const alreadyArchivedRow = {
  id: "cat-1",
  name: "Makanan Lama",
  sortOrder: 3,
  isActive: false,
  deletedAt: new Date(ARCHIVED_DELETED_AT),
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

function createInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", name: "Makanan", ...overrides };
}

function updateBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    categoryId: "cat-1",
    expectedUpdatedAt: CURRENT_UPDATED_AT,
    ...overrides,
  };
}

function archiveInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return updateBase(overrides);
}

function restoreInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return updateBase(overrides);
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

type FindFirstArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
};

function findFirstArgsAt(index: number): FindFirstArgs {
  return tx.menuCategory.findFirst.mock.calls[index]?.[0] as FindFirstArgs;
}

function createArgs(): { data: Record<string, unknown> } {
  return tx.menuCategory.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
}

function updateArgs(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  return tx.menuCategory.updateMany.mock.calls[0]?.[0] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };
}

function logArgs(): { data: Record<string, unknown> } {
  return tx.activityLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
}

function countArgs(): { where: Record<string, unknown> } {
  return tx.menuItem.count.mock.calls[0]?.[0] as { where: Record<string, unknown> };
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

const CATALOG_NAME_META = { target: ["tenantId", "outletId", "name"] };

function mockCurrentThen(current: unknown, duplicate: unknown = null): void {
  tx.menuCategory.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    typeof args.where.name === "object" && args.where.name !== null ? duplicate : current
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedTransaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)
  );
  tx.menuCategory.findFirst.mockResolvedValue(null);
  tx.menuCategory.create.mockResolvedValue(createdRow);
  tx.menuCategory.updateMany.mockResolvedValue({ count: 1 });
  tx.menuItem.count.mockResolvedValue(0);
  tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMenuCategory - input and authorization", () => {
  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(createMenuCategory({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user, permission or deletedAt fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
      { deletedAt: new Date().toISOString() },
      { updatedAt: new Date().toISOString() },
    ]) {
      const error = await expectDomainError(
        createMenuCategory(createInput(foreign)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await createMenuCategory(createInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(createMenuCategory(createInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });
});

describe("createMenuCategory - duplicate protection", () => {
  it("queries duplicates case-insensitively scoped to tenant and outlet without a deletedAt filter", async () => {
    await createMenuCategory(createInput({ name: "  Makanan  " }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(findFirstArgsAt(0).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Makanan", mode: "insensitive" },
    });
    expect(findFirstArgsAt(0).where).not.toHaveProperty("deletedAt");
    expect(findFirstArgsAt(0).where).not.toHaveProperty("id");
    expect(findFirstArgsAt(0).select).toEqual({ id: true });
  });

  it("maps an active duplicate row to CATEGORY_NAME_CONFLICT without creating anything", async () => {
    tx.menuCategory.findFirst.mockResolvedValue({ id: "cat-other" });

    const error = await expectDomainError(
      createMenuCategory(createInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an archived duplicate row to CATEGORY_NAME_CONFLICT because the query never filters deletedAt", async () => {
    tx.menuCategory.findFirst.mockResolvedValue({ id: "cat-archived" });

    const error = await expectDomainError(
      createMenuCategory(createInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NAME_CONFLICT"));
    expect(findFirstArgsAt(0).where).not.toHaveProperty("deletedAt");
    expect(tx.menuCategory.create).not.toHaveBeenCalled();
  });
});

describe("createMenuCategory - persistence and output", () => {
  it("creates with the explicit defaults sortOrder 0 and isActive true", async () => {
    await createMenuCategory(createInput());

    expect(createArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: "Makanan",
      sortOrder: 0,
      isActive: true,
    });
  });

  it("keeps explicit sortOrder 0 and isActive false without truthiness loss", async () => {
    await createMenuCategory(createInput({ sortOrder: 0, isActive: false }));

    expect(createArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: "Makanan",
      sortOrder: 0,
      isActive: false,
    });
  });

  it("takes tenantId, outletId and the log userId only from the trusted context", async () => {
    await createMenuCategory(createInput({ outletId: "  outlet-raw  " }));

    const data = createArgs().data;
    expect(data.tenantId).toBe(contextResult.actor.tenantId);
    expect(data.outletId).toBe(contextResult.outletId);
    expect(data.outletId).not.toBe("outlet-raw");
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
  });

  it("maps Date fields to ISO strings and returns deletedAt as null", async () => {
    const summary = await createMenuCategory(createInput());

    expect(summary).toEqual({
      id: "cat-9",
      name: "Makanan",
      sortOrder: 0,
      isActive: true,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.deletedAt).toBeNull();
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("writes the activity log with the exact action, entity and primitive after snapshot", async () => {
    await createMenuCategory(createInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "menu.category.created",
      entity: "MenuCategory",
      entityId: "cat-9",
      before: Prisma.DbNull,
      after: {
        name: "Makanan",
        sortOrder: 0,
        isActive: true,
        deletedAt: null,
        updatedAt: CURRENT_UPDATED_AT,
      },
    });
  });

  it("creates the category before writing the activity log", async () => {
    const callOrder: string[] = [];
    tx.menuCategory.findFirst.mockImplementation(async () => {
      callOrder.push("duplicate");
      return null;
    });
    tx.menuCategory.create.mockImplementation(async () => {
      callOrder.push("create");
      return createdRow;
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await createMenuCategory(createInput());

    expect(callOrder).toEqual(["duplicate", "create", "activityLog"]);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await createMenuCategory(createInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("createMenuCategory - error mapping", () => {
  it("maps a catalog P2002 race to CATEGORY_NAME_CONFLICT with the precheck message", async () => {
    tx.menuCategory.create.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(
      createMenuCategory(createInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps a non-catalog P2002 to INTERNAL_ERROR without leaking the constraint", async () => {
    tx.menuCategory.create.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "id"] });
    });

    const error = await expectDomainError(createMenuCategory(createInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("P2002");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(createMenuCategory(createInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuCategory - input and lookup", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(updateMenuCategory({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await updateMenuCategory(updateBase({ outletId: "  outlet-raw  ", name: "Baru" }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(updateMenuCategory(updateBase({ name: "Baru" })));

    expect(error).toBe(domainError);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("scopes the current row lookup to id, trusted tenant and authorized outlet", async () => {
    await updateMenuCategory(updateBase({ outletId: "  outlet-raw  ", sortOrder: 5 }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(findFirstArgsAt(0).where).toEqual({
      id: "cat-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(findFirstArgsAt(0).where.outletId).not.toBe("outlet-raw");
    expect(findFirstArgsAt(0).select).toEqual({
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      deletedAt: true,
      updatedAt: true,
    });
  });

  it("maps a missing category to CATEGORY_NOT_FOUND without updating or logging", async () => {
    mockCurrentThen(null);

    const error = await expectDomainError(
      updateMenuCategory(updateBase({ name: "Baru" })),
      "CATEGORY_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuCategory - optimistic concurrency", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("reports CATALOG_VERSION_CONFLICT for a stale expectedUpdatedAt without duplicate, update or log", async () => {
    const error = await expectDomainError(
      updateMenuCategory(
        updateBase({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z", name: "Baru" })
      ),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("accepts the exact expectedUpdatedAt token", async () => {
    const summary = await updateMenuCategory(
      updateBase({ expectedUpdatedAt: CURRENT_UPDATED_AT, name: "Makanan Baru" })
    );

    expect(summary.id).toBe("cat-1");
    expect(summary.name).toBe("Makanan Baru");
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is 0 or greater than 1", async () => {
    for (const count of [0, 2]) {
      tx.menuCategory.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        updateMenuCategory(updateBase({ name: "Baru" })),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("runs the transaction exactly once without retry", async () => {
    tx.menuCategory.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(
      updateMenuCategory(updateBase({ sortOrder: 5 })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuCategory - duplicate protection", () => {
  it("excludes the current id and matches the new name case-insensitively", async () => {
    mockCurrentThen(currentRow);

    await updateMenuCategory(updateBase({ name: "  Makanan Baru  " }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(2);
    expect(findFirstArgsAt(1).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Makanan Baru", mode: "insensitive" },
      id: { not: "cat-1" },
    });
    expect(findFirstArgsAt(1).where).not.toHaveProperty("deletedAt");
  });

  it("maps an archived duplicate row to CATEGORY_NAME_CONFLICT without updating", async () => {
    mockCurrentThen(currentRow, { id: "cat-archived" });

    const error = await expectDomainError(
      updateMenuCategory(updateBase({ name: "Makanan Baru" })),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("skips the duplicate query entirely when the update has no name", async () => {
    mockCurrentThen(currentRow);

    await updateMenuCategory(updateBase({ sortOrder: 5 }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(findFirstArgsAt(0).where.id).toBe("cat-1");
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuCategory - mutation and timestamps", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("updates an archived row without touching deletedAt", async () => {
    mockCurrentThen({
      ...currentRow,
      isActive: false,
      deletedAt: new Date("2026-09-01T08:30:00.000Z"),
    });

    const summary = await updateMenuCategory(updateBase({ isActive: true }));

    expect(summary.deletedAt).toBe("2026-09-01T08:30:00.000Z");
    expect(updateArgs().data).not.toHaveProperty("deletedAt");
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps isActive false and sortOrder 0 in the update data", async () => {
    await updateMenuCategory(updateBase({ isActive: false, sortOrder: 0 }));

    expect(updateArgs().data.isActive).toBe(false);
    expect(updateArgs().data.sortOrder).toBe(0);
    expect(updateArgs().data).toHaveProperty("isActive", false);
    expect(updateArgs().data).toHaveProperty("sortOrder", 0);
  });

  it("mutates only the supplied fields plus updatedAt", async () => {
    await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect(updateArgs().data).toEqual({
      name: "Makanan Baru",
      updatedAt: expect.any(Date),
    });
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect(updateArgs().where).toEqual({
      id: "cat-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: currentRow.updatedAt,
    });
    expect(updateArgs().where.updatedAt).toBeInstanceOf(Date);
    expect((updateArgs().where.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS);
  });

  it("writes an explicit monotonic updatedAt into the update data", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect(updateArgs().data.updatedAt).toBeInstanceOf(Date);
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("uses Date.now when it is already beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const summary = await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 5000);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:05.000Z");
  });
});

describe("updateMenuCategory - activity log and output", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("writes primitive before and after snapshots with ISO timestamps", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await updateMenuCategory(updateBase({ name: "Makanan Baru", isActive: false }));

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
    expect(logArgs().data.action).toBe("menu.category.updated");
    expect(logArgs().data.entity).toBe("MenuCategory");
    expect(logArgs().data.entityId).toBe("cat-1");
    expect(logArgs().data.before).toEqual({
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: true,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      name: "Makanan Baru",
      sortOrder: 3,
      isActive: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    for (const value of Object.values(logArgs().data.after as Record<string, unknown>)) {
      expect(value).not.toBeInstanceOf(Date);
    }
  });

  it("combines the current row with the supplied changes without refetching", async () => {
    const summary = await updateMenuCategory(updateBase({ isActive: false }));

    expect(summary).toEqual({
      id: "cat-1",
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: false,
      deletedAt: null,
      updatedAt: expect.any(String),
    });
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns CategorySummary with ISO strings and a null deletedAt", async () => {
    const summary = await updateMenuCategory(updateBase({ sortOrder: 7 }));

    expect(Object.keys(summary).sort()).toEqual([
      "deletedAt",
      "id",
      "isActive",
      "name",
      "sortOrder",
      "updatedAt",
    ]);
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.deletedAt).toBeNull();
    expect(summary.sortOrder).toBe(7);
  });

  it("runs find, duplicate check, update and log in that order", async () => {
    const callOrder: string[] = [];
    let findFirstCall = 0;
    tx.menuCategory.findFirst.mockImplementation(async () => {
      findFirstCall += 1;
      callOrder.push(findFirstCall === 1 ? "current" : "duplicate");
      return findFirstCall === 1 ? currentRow : null;
    });
    tx.menuCategory.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect(callOrder).toEqual(["current", "duplicate", "updateMany", "activityLog"]);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await updateMenuCategory(updateBase({ name: "Makanan Baru" }));

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("updateMenuCategory - error mapping", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("maps a catalog P2002 race to CATEGORY_NAME_CONFLICT with the precheck message", async () => {
    tx.menuCategory.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(
      updateMenuCategory(updateBase({ name: "Makanan Baru" })),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an unknown database error to INTERNAL_ERROR without leaking details", async () => {
    tx.menuCategory.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(
      updateMenuCategory(updateBase({ name: "Makanan Baru" })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(
      updateMenuCategory(updateBase({ name: "Makanan Baru" })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("archiveMenuCategory - input, state and version checks", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(archiveMenuCategory({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await archiveMenuCategory(archiveInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("maps a missing category to CATEGORY_NOT_FOUND without counting, updating or logging", async () => {
    mockCurrentThen(null);

    const error = await expectDomainError(
      archiveMenuCategory(archiveInput()),
      "CATEGORY_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(tx.menuItem.count).not.toHaveBeenCalled();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("reports CATALOG_VERSION_CONFLICT for a stale token on an active category", async () => {
    const error = await expectDomainError(
      archiveMenuCategory(archiveInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuItem.count).not.toHaveBeenCalled();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("lets the version check win over the state check for a stale token on an archived row", async () => {
    mockCurrentThen(alreadyArchivedRow);

    const error = await expectDomainError(
      archiveMenuCategory(archiveInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("CATALOG_STATE_CONFLICT");
  });

  it("reports CATALOG_STATE_CONFLICT for an already archived row with a matching token", async () => {
    mockCurrentThen(alreadyArchivedRow);

    const error = await expectDomainError(
      archiveMenuCategory(archiveInput()),
      "CATALOG_STATE_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATALOG_STATE_CONFLICT"));
  });

  it("runs no count, update or log when the state check fails", async () => {
    mockCurrentThen(alreadyArchivedRow);

    await expectDomainError(archiveMenuCategory(archiveInput()), "CATALOG_STATE_CONFLICT");

    expect(tx.menuItem.count).not.toHaveBeenCalled();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("archiveMenuCategory - child count and persistence", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("counts child items scoped to tenant, outlet, category and non-deleted rows", async () => {
    await archiveMenuCategory(archiveInput());

    expect(tx.menuItem.count).toHaveBeenCalledTimes(1);
    expect(countArgs().where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      categoryId: "cat-1",
      deletedAt: null,
    });
  });

  it("archives even when the child count is 0", async () => {
    tx.menuItem.count.mockResolvedValue(0);

    const summary = await archiveMenuCategory(archiveInput());

    expect(summary.deletedAt).toEqual(expect.any(String));
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });

  it("archives even when children exist and records the audit count", async () => {
    tx.menuItem.count.mockResolvedValue(3);

    const summary = await archiveMenuCategory(archiveInput());

    expect(summary.deletedAt).toEqual(expect.any(String));
    expect(logArgs().data.after).toMatchObject({ menuItemCount: 3 });
    expect(logArgs().data.before).toMatchObject({ menuItemCount: 3 });
  });

  it("only touches the category row and never mutates child menu items", async () => {
    await archiveMenuCategory(archiveInput());

    expect(Object.keys(tx.menuItem)).toEqual(["count"]);
    expect(tx.menuItem.count).toHaveBeenCalledTimes(1);
    expect(updateArgs().where.id).toBe("cat-1");
  });

  it("writes only deletedAt and updatedAt into the update data", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await archiveMenuCategory(archiveInput());

    expect(Object.keys(updateArgs().data).sort()).toEqual(["deletedAt", "updatedAt"]);
    expect((updateArgs().data.deletedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect(updateArgs().data).not.toHaveProperty("isActive");
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await archiveMenuCategory(archiveInput());

    expect(updateArgs().where).toEqual({
      id: "cat-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: currentRow.updatedAt,
    });
  });

  it("keeps isActive unchanged in the output", async () => {
    mockCurrentThen({ ...currentRow, isActive: false });

    const summary = await archiveMenuCategory(archiveInput());

    expect(summary.isActive).toBe(false);
    expect(updateArgs().data).not.toHaveProperty("isActive");
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await archiveMenuCategory(archiveInput());

    expect((updateArgs().data.deletedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.deletedAt).toBe("2026-10-01T10:00:00.001Z");
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is not 1 without logging", async () => {
    for (const count of [0, 2]) {
      tx.menuCategory.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        archiveMenuCategory(archiveInput()),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await archiveMenuCategory(archiveInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("archiveMenuCategory - activity log and output", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("writes the archived action with the trusted actor and entity", async () => {
    await archiveMenuCategory(archiveInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toMatchObject({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "menu.category.archived",
      entity: "MenuCategory",
      entityId: "cat-1",
    });
  });

  it("writes ISO before and after snapshots with the audit child count", async () => {
    tx.menuItem.count.mockResolvedValue(2);

    await archiveMenuCategory(archiveInput());

    expect(logArgs().data.before).toEqual({
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: true,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
      menuItemCount: 2,
    });
    expect(logArgs().data.after).toEqual({
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: true,
      deletedAt: "2026-10-01T10:00:01.000Z",
      updatedAt: "2026-10-01T10:00:01.000Z",
      menuItemCount: 2,
    });
    for (const value of Object.values(logArgs().data.after as Record<string, unknown>)) {
      expect(value).not.toBeInstanceOf(Date);
    }
  });

  it("returns a CategorySummary with the mutation timestamps and the current row values", async () => {
    const summary = await archiveMenuCategory(archiveInput());

    expect(summary).toEqual({
      id: "cat-1",
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: true,
      deletedAt: "2026-10-01T10:00:01.000Z",
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    expect(Object.keys(summary).sort()).toEqual([
      "deletedAt",
      "id",
      "isActive",
      "name",
      "sortOrder",
      "updatedAt",
    ]);
    expect(summary.deletedAt).not.toBeInstanceOf(Date);
  });

  it("runs find, count, update and log in that order", async () => {
    const callOrder: string[] = [];
    tx.menuCategory.findFirst.mockImplementation(async () => {
      callOrder.push("find");
      return currentRow;
    });
    tx.menuItem.count.mockImplementation(async () => {
      callOrder.push("count");
      return 0;
    });
    tx.menuCategory.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await archiveMenuCategory(archiveInput());

    expect(callOrder).toEqual(["find", "count", "updateMany", "activityLog"]);
  });
});

describe("archiveMenuCategory - error mapping", () => {
  beforeEach(() => {
    mockCurrentThen(currentRow);
  });

  it("maps an unknown lookup failure to INTERNAL_ERROR without leaking details", async () => {
    tx.menuCategory.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(archiveMenuCategory(archiveInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a child count failure to INTERNAL_ERROR without leaking details", async () => {
    tx.menuItem.count.mockRejectedValue(new Error("count query timeout"));

    const error = await expectDomainError(archiveMenuCategory(archiveInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("count query timeout");
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(archiveMenuCategory(archiveInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("restoreMenuCategory - input, state and version checks", () => {
  beforeEach(() => {
    mockCurrentThen(alreadyArchivedRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(restoreMenuCategory({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await restoreMenuCategory(restoreInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("maps a missing category to CATEGORY_NOT_FOUND without restoring", async () => {
    mockCurrentThen(null);

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput()),
      "CATEGORY_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.menuItem.count).not.toHaveBeenCalled();
  });

  it("reports CATALOG_VERSION_CONFLICT for a stale token on an archived row", async () => {
    const error = await expectDomainError(
      restoreMenuCategory(restoreInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("lets the version check win over the state check for a stale token on an active row", async () => {
    mockCurrentThen(currentRow);

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("CATALOG_STATE_CONFLICT");
  });

  it("reports CATALOG_STATE_CONFLICT for an active row with a matching token", async () => {
    mockCurrentThen(currentRow);

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput()),
      "CATALOG_STATE_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATALOG_STATE_CONFLICT"));
  });

  it("runs no duplicate, update or log when the state check fails", async () => {
    mockCurrentThen(currentRow);

    await expectDomainError(restoreMenuCategory(restoreInput()), "CATALOG_STATE_CONFLICT");

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("restoreMenuCategory - duplicate protection", () => {
  beforeEach(() => {
    mockCurrentThen(alreadyArchivedRow);
  });

  it("queries the duplicate case-insensitively scoped to tenant and outlet", async () => {
    await restoreMenuCategory(restoreInput());

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(2);
    expect(findFirstArgsAt(1).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Makanan Lama", mode: "insensitive" },
      id: { not: "cat-1" },
    });
  });

  it("excludes the current category id from the duplicate query", async () => {
    await restoreMenuCategory(restoreInput());

    expect(findFirstArgsAt(1).where.id).toEqual({ not: "cat-1" });
  });

  it("never filters deletedAt in the duplicate query", async () => {
    await restoreMenuCategory(restoreInput());

    expect(findFirstArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(findFirstArgsAt(1).select).toEqual({ id: true });
  });

  it("maps a duplicate active row to CATEGORY_NAME_CONFLICT without restoring", async () => {
    mockCurrentThen(alreadyArchivedRow, { id: "cat-active-dup" });

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NAME_CONFLICT"));
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate archived row to CATEGORY_NAME_CONFLICT without restoring", async () => {
    mockCurrentThen(alreadyArchivedRow, { id: "cat-other-archived" });

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(findFirstArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(tx.menuCategory.updateMany).not.toHaveBeenCalled();
  });

  it("restores when no duplicate exists", async () => {
    const summary = await restoreMenuCategory(restoreInput());

    expect(summary.deletedAt).toBeNull();
    expect(tx.menuCategory.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("restoreMenuCategory - persistence, log and output", () => {
  beforeEach(() => {
    mockCurrentThen(alreadyArchivedRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("writes deletedAt null with the mutation timestamp into the update data", async () => {
    await restoreMenuCategory(restoreInput());

    expect(Object.keys(updateArgs().data).sort()).toEqual(["deletedAt", "updatedAt"]);
    expect(updateArgs().data.deletedAt).toBeNull();
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect(updateArgs().data).not.toHaveProperty("isActive");
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await restoreMenuCategory(restoreInput());

    expect(updateArgs().where).toEqual({
      id: "cat-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: alreadyArchivedRow.updatedAt,
    });
  });

  it("keeps the old isActive value, including false, unchanged", async () => {
    const summary = await restoreMenuCategory(restoreInput());

    expect(summary.isActive).toBe(false);
    expect(updateArgs().data).not.toHaveProperty("isActive");
  });

  it("writes the restored action with the trusted actor and entity", async () => {
    await restoreMenuCategory(restoreInput());

    expect(logArgs().data).toMatchObject({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "menu.category.restored",
      entity: "MenuCategory",
      entityId: "cat-1",
    });
  });

  it("writes ISO before and after snapshots with the old and null deletedAt", async () => {
    await restoreMenuCategory(restoreInput());

    expect(logArgs().data.before).toEqual({
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: false,
      deletedAt: ARCHIVED_DELETED_AT,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
  });

  it("returns a CategorySummary with a null deletedAt and the new ISO timestamp", async () => {
    const summary = await restoreMenuCategory(restoreInput());

    expect(summary).toEqual({
      id: "cat-1",
      name: "Makanan Lama",
      sortOrder: 3,
      isActive: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("never counts child menu items during restore", async () => {
    await restoreMenuCategory(restoreInput());

    expect(tx.menuItem.count).not.toHaveBeenCalled();
  });

  it("runs find, duplicate check, update and log in that order", async () => {
    const callOrder: string[] = [];
    tx.menuCategory.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        const isDuplicate = typeof args.where.name === "object" && args.where.name !== null;
        callOrder.push(isDuplicate ? "duplicate" : "find");
        return isDuplicate ? null : alreadyArchivedRow;
      }
    );
    tx.menuCategory.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await restoreMenuCategory(restoreInput());

    expect(callOrder).toEqual(["find", "duplicate", "updateMany", "activityLog"]);
  });
});

describe("restoreMenuCategory - error mapping and concurrency", () => {
  beforeEach(() => {
    mockCurrentThen(alreadyArchivedRow);
  });

  it("maps a catalog P2002 race to CATEGORY_NAME_CONFLICT with the precheck message", async () => {
    tx.menuCategory.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(
      restoreMenuCategory(restoreInput()),
      "CATEGORY_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps a non-catalog P2002 to INTERNAL_ERROR without leaking the constraint", async () => {
    tx.menuCategory.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "id"] });
    });

    const error = await expectDomainError(restoreMenuCategory(restoreInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("P2002");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is not 1 without logging", async () => {
    for (const count of [0, 2]) {
      tx.menuCategory.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        restoreMenuCategory(restoreInput()),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("runs the transaction exactly once without retry", async () => {
    tx.menuCategory.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(restoreMenuCategory(restoreInput()), "CATALOG_VERSION_CONFLICT");

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await restoreMenuCategory(restoreInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});
