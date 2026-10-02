import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  archiveMenuItem,
  createMenuItem,
  restoreMenuItem,
  setMenuItemSoldOut,
  updateMenuItem,
} from "@/lib/services/menu-item.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

const tx = {
  menuItem: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  menuCategory: { findFirst: vi.fn() },
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

const ACTIVE_CATEGORY = { id: "cat-1", isActive: true, deletedAt: null };

const createdRow = {
  id: "menu-9",
  categoryId: "cat-1",
  name: "Nasi Goreng",
  description: null,
  price: 25000,
  imageUrl: null,
  imageAlt: null,
  sortOrder: 0,
  isActive: true,
  isSoldOut: false,
  deletedAt: null,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const currentRow = {
  id: "menu-1",
  categoryId: "cat-1",
  name: "Nasi Goreng Lama",
  description: "Deskripsi lama",
  price: 20000,
  imageUrl: "https://example.test/old.png",
  imageAlt: "Gambar lama",
  sortOrder: 4,
  isActive: true,
  isSoldOut: false,
  deletedAt: null,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const archivedRow = {
  ...currentRow,
  deletedAt: new Date(ARCHIVED_DELETED_AT),
};

function createInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", categoryId: "cat-1", name: "Nasi Goreng", price: 25000, ...overrides };
}

function updateBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    menuItemId: "menu-1",
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

function soldOutInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...updateBase(), isSoldOut: true, ...overrides };
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

function categoryFindArgsAt(index: number): FindFirstArgs {
  return tx.menuCategory.findFirst.mock.calls[index]?.[0] as FindFirstArgs;
}

function itemFindArgsAt(index: number): FindFirstArgs {
  return tx.menuItem.findFirst.mock.calls[index]?.[0] as FindFirstArgs;
}

function createArgs(): { data: Record<string, unknown> } {
  return tx.menuItem.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
}

function updateArgs(): { where: Record<string, unknown>; data: Record<string, unknown> } {
  return tx.menuItem.updateMany.mock.calls[0]?.[0] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };
}

function logArgs(): { data: Record<string, unknown> } {
  return tx.activityLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
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

function mockUpdateLookups(current: unknown, duplicate: unknown = null): void {
  tx.menuItem.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    typeof args.where.name === "object" && args.where.name !== null ? duplicate : current
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedTransaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)
  );
  tx.menuCategory.findFirst.mockResolvedValue(ACTIVE_CATEGORY);
  tx.menuItem.findFirst.mockResolvedValue(null);
  tx.menuItem.create.mockResolvedValue(createdRow);
  tx.menuItem.updateMany.mockResolvedValue({ count: 1 });
  tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMenuItem - input and authorization", () => {
  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(createMenuItem({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user, permission, deletedAt or updatedAt fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
      { deletedAt: new Date().toISOString() },
      { updatedAt: new Date().toISOString() },
    ]) {
      const error = await expectDomainError(
        createMenuItem(createInput(foreign)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await createMenuItem(createInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(createMenuItem(createInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });
});

describe("createMenuItem - category validation", () => {
  it("queries the category scoped to trusted tenant, authorized outlet and the parsed id", async () => {
    await createMenuItem(createInput({ outletId: "  outlet-raw  " }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(categoryFindArgsAt(0).where).toEqual({
      id: "cat-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(categoryFindArgsAt(0).where.outletId).not.toBe("outlet-raw");
    expect(categoryFindArgsAt(0).select).toEqual({
      id: true,
      isActive: true,
      deletedAt: true,
    });
  });

  it("maps a missing category to CATEGORY_NOT_FOUND without duplicate, create or log", async () => {
    tx.menuCategory.findFirst.mockResolvedValue(null);

    const error = await expectDomainError(createMenuItem(createInput()), "CATEGORY_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an inactive category to CATEGORY_NOT_AVAILABLE", async () => {
    tx.menuCategory.findFirst.mockResolvedValue({
      id: "cat-1",
      isActive: false,
      deletedAt: null,
    });

    const error = await expectDomainError(
      createMenuItem(createInput()),
      "CATEGORY_NOT_AVAILABLE"
    );

    expect(error).not.toBeNull();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an archived category to CATEGORY_NOT_AVAILABLE", async () => {
    tx.menuCategory.findFirst.mockResolvedValue({
      id: "cat-1",
      isActive: true,
      deletedAt: new Date(ARCHIVED_DELETED_AT),
    });

    const error = await expectDomainError(
      createMenuItem(createInput()),
      "CATEGORY_NOT_AVAILABLE"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATEGORY_NOT_AVAILABLE"));
    expect(tx.menuItem.create).not.toHaveBeenCalled();
  });

  it("continues when the category is active and not archived", async () => {
    const summary = await createMenuItem(createInput());

    expect(summary.id).toBe("menu-9");
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.create).toHaveBeenCalledTimes(1);
  });
});

describe("createMenuItem - duplicate protection", () => {
  it("queries duplicates case-insensitively scoped to tenant and outlet without a deletedAt filter", async () => {
    await createMenuItem(createInput({ name: "  Nasi Goreng  " }));

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(itemFindArgsAt(0).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Nasi Goreng", mode: "insensitive" },
    });
    expect(itemFindArgsAt(0).where).not.toHaveProperty("deletedAt");
    expect(itemFindArgsAt(0).where).not.toHaveProperty("id");
    expect(itemFindArgsAt(0).select).toEqual({ id: true });
  });

  it("maps an active duplicate row to MENU_NAME_CONFLICT without creating anything", async () => {
    tx.menuItem.findFirst.mockResolvedValue({ id: "menu-active" });

    const error = await expectDomainError(createMenuItem(createInput()), "MENU_NAME_CONFLICT");

    expect(error).not.toBeNull();
    expect(tx.menuItem.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an archived duplicate row to MENU_NAME_CONFLICT because the query never filters deletedAt", async () => {
    tx.menuItem.findFirst.mockResolvedValue({ id: "menu-archived" });

    const error = await expectDomainError(createMenuItem(createInput()), "MENU_NAME_CONFLICT");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_NAME_CONFLICT"));
    expect(itemFindArgsAt(0).where).not.toHaveProperty("deletedAt");
    expect(tx.menuItem.create).not.toHaveBeenCalled();
  });
});

describe("createMenuItem - persistence and output", () => {
  it("creates with the explicit defaults sortOrder 0, isActive true, isSoldOut false and null texts", async () => {
    await createMenuItem(createInput());

    expect(createArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      categoryId: "cat-1",
      name: "Nasi Goreng",
      description: null,
      price: 25000,
      imageUrl: null,
      imageAlt: null,
      sortOrder: 0,
      isActive: true,
      isSoldOut: false,
    });
  });

  it("keeps explicit false, 0 and empty-turned-null values without truthiness loss", async () => {
    await createMenuItem(
      createInput({
        price: 0,
        sortOrder: 0,
        isActive: false,
        isSoldOut: false,
        description: "",
        imageUrl: "",
        imageAlt: "",
      })
    );

    const data = createArgs().data;
    expect(data.price).toBe(0);
    expect(data.sortOrder).toBe(0);
    expect(data.isActive).toBe(false);
    expect(data.isSoldOut).toBe(false);
    expect(data.description).toBeNull();
    expect(data.imageUrl).toBeNull();
    expect(data.imageAlt).toBeNull();
  });

  it("takes tenantId, outletId and the log userId only from the trusted context", async () => {
    await createMenuItem(createInput({ outletId: "  outlet-raw  " }));

    const data = createArgs().data;
    expect(data.tenantId).toBe(contextResult.actor.tenantId);
    expect(data.outletId).toBe(contextResult.outletId);
    expect(data.outletId).not.toBe("outlet-raw");
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
  });

  it("writes the activity log with the exact action, entity, actor and entityId", async () => {
    await createMenuItem(createInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "menu.menuitem.created",
      entity: "MenuItem",
      entityId: "menu-9",
      before: Prisma.DbNull,
      after: {
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: null,
        price: 25000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 0,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: CURRENT_UPDATED_AT,
      },
    });
  });

  it("writes only primitive, string or null values into the after snapshot", async () => {
    await createMenuItem(createInput());

    const after = logArgs().data.after as Record<string, unknown>;
    expect(Object.keys(after).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "description",
      "imageAlt",
      "imageUrl",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "sortOrder",
      "updatedAt",
    ]);
    for (const [key, value] of Object.entries(after)) {
      expect(["string", "number", "boolean"].includes(typeof value) || value === null).toBe(true);
      expect(value).not.toBeInstanceOf(Date);
      expect(key).not.toBe("createdAt");
    }
  });

  it("returns a MenuItemSummary with ISO timestamps and a null deletedAt", async () => {
    const summary = await createMenuItem(createInput());

    expect(summary).toEqual({
      id: "menu-9",
      categoryId: "cat-1",
      name: "Nasi Goreng",
      price: 25000,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.deletedAt).toBeNull();
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("maps a non-null deletedAt on the created row to an ISO string", async () => {
    tx.menuItem.create.mockResolvedValue({
      ...createdRow,
      deletedAt: new Date(ARCHIVED_DELETED_AT),
    });

    const summary = await createMenuItem(createInput());

    expect(summary.deletedAt).toBe(ARCHIVED_DELETED_AT);
    expect(summary.deletedAt).not.toBeInstanceOf(Date);
  });

  it("runs category validation, duplicate check, create and log in that order", async () => {
    const callOrder: string[] = [];
    tx.menuCategory.findFirst.mockImplementation(async () => {
      callOrder.push("category");
      return ACTIVE_CATEGORY;
    });
    tx.menuItem.findFirst.mockImplementation(async () => {
      callOrder.push("duplicate");
      return null;
    });
    tx.menuItem.create.mockImplementation(async () => {
      callOrder.push("create");
      return createdRow;
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await createMenuItem(createInput());

    expect(callOrder).toEqual(["category", "duplicate", "create", "activityLog"]);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await createMenuItem(createInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("createMenuItem - error mapping", () => {
  it("maps a catalog P2002 race to MENU_NAME_CONFLICT with the precheck message", async () => {
    tx.menuItem.create.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(createMenuItem(createInput()), "MENU_NAME_CONFLICT");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps a non-catalog P2002 to INTERNAL_ERROR without leaking the constraint", async () => {
    tx.menuItem.create.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "id"] });
    });

    const error = await expectDomainError(createMenuItem(createInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("P2002");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(createMenuItem(createInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuItem - input, authorization and lookup", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(updateMenuItem({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user, permission or deletedAt fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
      { deletedAt: new Date().toISOString() },
    ]) {
      const error = await expectDomainError(
        updateMenuItem(updateBase(foreign)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await updateMenuItem(updateBase({ outletId: "  outlet-raw  ", sortOrder: 5 }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(updateMenuItem(updateBase({ sortOrder: 5 })));

    expect(error).toBe(domainError);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("scopes the current row lookup to id, trusted tenant and authorized outlet", async () => {
    await updateMenuItem(updateBase({ outletId: "  outlet-raw  ", sortOrder: 5 }));

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(itemFindArgsAt(0).where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(itemFindArgsAt(0).where.outletId).not.toBe("outlet-raw");
    expect(itemFindArgsAt(0).select).toEqual({
      id: true,
      categoryId: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      imageAlt: true,
      sortOrder: true,
      isActive: true,
      isSoldOut: true,
      deletedAt: true,
      updatedAt: true,
    });
  });

  it("maps a missing menu item to MENU_ITEM_NOT_FOUND without category, duplicate, update or log", async () => {
    mockUpdateLookups(null);

    const error = await expectDomainError(
      updateMenuItem(updateBase({ categoryId: "cat-2", name: "Baru" })),
      "MENU_ITEM_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuItem - optimistic concurrency", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("reports CATALOG_VERSION_CONFLICT for a stale token before category, duplicate, update or log", async () => {
    const error = await expectDomainError(
      updateMenuItem(
        updateBase({
          expectedUpdatedAt: "2026-09-30T00:00:00.000Z",
          categoryId: "cat-2",
          name: "Baru",
        })
      ),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("guards the conditional write with id, trusted tenant, authorized outlet and the current updatedAt", async () => {
    await updateMenuItem(updateBase({ name: "Nasi Goreng Baru" }));

    expect(updateArgs().where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: currentRow.updatedAt,
    });
    expect(updateArgs().where.updatedAt).toBeInstanceOf(Date);
    expect((updateArgs().where.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS);
  });

  it("writes an explicit mutationTime Date into the update data", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await updateMenuItem(updateBase({ name: "Nasi Goreng Baru" }));

    expect(updateArgs().data.updatedAt).toBeInstanceOf(Date);
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect(updateArgs().data.updatedAt).not.toBe(updateArgs().where.updatedAt);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await updateMenuItem(updateBase({ name: "Nasi Goreng Baru" }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("uses Date.now when it is already beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const summary = await updateMenuItem(updateBase({ name: "Nasi Goreng Baru" }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 5000);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:05.000Z");
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is 0 or greater than 1", async () => {
    for (const count of [0, 2]) {
      tx.menuItem.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        updateMenuItem(updateBase({ name: "Nasi Goreng Baru" })),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("runs the transaction exactly once without retry", async () => {
    tx.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(updateMenuItem(updateBase({ sortOrder: 5 })), "CATALOG_VERSION_CONFLICT");

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuItem - category validation", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("skips the target category query when categoryId is absent", async () => {
    await updateMenuItem(updateBase({ isActive: false }));

    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("skips the target category query when categoryId equals the current categoryId", async () => {
    await updateMenuItem(updateBase({ categoryId: "cat-1" }));

    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(updateArgs().data.categoryId).toBe("cat-1");
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("queries the target category scoped to tenant and outlet when categoryId changes", async () => {
    const summary = await updateMenuItem(updateBase({ categoryId: "cat-2" }));

    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(categoryFindArgsAt(0).where).toEqual({
      id: "cat-2",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(categoryFindArgsAt(0).select).toEqual({
      id: true,
      isActive: true,
      deletedAt: true,
    });
    expect(updateArgs().data.categoryId).toBe("cat-2");
    expect(summary.categoryId).toBe("cat-2");
  });

  it("maps a missing target category to CATEGORY_NOT_FOUND without duplicate, update or log", async () => {
    tx.menuCategory.findFirst.mockResolvedValue(null);

    const error = await expectDomainError(
      updateMenuItem(updateBase({ categoryId: "cat-2", name: "Baru" })),
      "CATEGORY_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an inactive or archived target category to CATEGORY_NOT_AVAILABLE", async () => {
    for (const target of [
      { id: "cat-2", isActive: false, deletedAt: null },
      { id: "cat-2", isActive: true, deletedAt: new Date(ARCHIVED_DELETED_AT) },
    ]) {
      tx.menuCategory.findFirst.mockResolvedValue(target);
      tx.menuItem.updateMany.mockClear();
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        updateMenuItem(updateBase({ categoryId: "cat-2" })),
        "CATEGORY_NOT_AVAILABLE"
      );

      expect(error).not.toBeNull();
      expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("allows other field updates while the current category is archived", async () => {
    mockUpdateLookups({ ...currentRow, categoryId: "cat-archived" });
    tx.menuCategory.findFirst.mockResolvedValue(null);

    const summary = await updateMenuItem(updateBase({ price: 30000 }));

    expect(summary.price).toBe(30000);
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuItem - duplicate protection", () => {
  it("excludes the current id and matches the new name case-insensitively", async () => {
    mockUpdateLookups(currentRow);

    await updateMenuItem(updateBase({ name: "  Nasi Goreng Baru  " }));

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(2);
    expect(itemFindArgsAt(1).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Nasi Goreng Baru", mode: "insensitive" },
      id: { not: "menu-1" },
    });
    expect(itemFindArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(itemFindArgsAt(1).select).toEqual({ id: true });
  });

  it("maps an archived duplicate row to MENU_NAME_CONFLICT without updating", async () => {
    mockUpdateLookups(currentRow, { id: "menu-archived" });

    const error = await expectDomainError(
      updateMenuItem(updateBase({ name: "Nasi Goreng Baru" })),
      "MENU_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(itemFindArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("skips the duplicate query entirely when the update has no name", async () => {
    mockUpdateLookups(currentRow);

    await updateMenuItem(updateBase({ sortOrder: 5 }));

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(itemFindArgsAt(0).where.id).toBe("menu-1");
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("updateMenuItem - mutation data", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("updates an archived menu item without touching deletedAt", async () => {
    mockUpdateLookups({
      ...currentRow,
      isActive: false,
      deletedAt: new Date(ARCHIVED_DELETED_AT),
    });

    const summary = await updateMenuItem(updateBase({ isActive: true }));

    expect(summary.deletedAt).toBe(ARCHIVED_DELETED_AT);
    expect(updateArgs().data).not.toHaveProperty("deletedAt");
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("writes empty optionals that parsed to null as explicit null", async () => {
    await updateMenuItem(
      updateBase({ description: "", imageUrl: "", imageAlt: "" })
    );

    expect(updateArgs().data).toHaveProperty("description", null);
    expect(updateArgs().data).toHaveProperty("imageUrl", null);
    expect(updateArgs().data).toHaveProperty("imageAlt", null);
    expect(updateArgs().data.description).toBeNull();
    expect(updateArgs().data.imageUrl).toBeNull();
    expect(updateArgs().data.imageAlt).toBeNull();
  });

  it("keeps false and 0 in the update data without truthiness loss", async () => {
    await updateMenuItem(
      updateBase({ isActive: false, isSoldOut: false, sortOrder: 0, price: 0 })
    );

    expect(updateArgs().data.isActive).toBe(false);
    expect(updateArgs().data.isSoldOut).toBe(false);
    expect(updateArgs().data.sortOrder).toBe(0);
    expect(updateArgs().data.price).toBe(0);
  });

  it("mutates only the supplied fields plus updatedAt", async () => {
    await updateMenuItem(updateBase({ sortOrder: 0 }));

    expect(Object.keys(updateArgs().data).sort()).toEqual(["sortOrder", "updatedAt"]);
    expect(updateArgs().data).toEqual({
      sortOrder: 0,
      updatedAt: expect.any(Date),
    });
  });
});

describe("updateMenuItem - activity log and output", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("writes full before and after snapshots with ISO, string or null values only", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await updateMenuItem(updateBase({ name: "Nasi Goreng Baru", isActive: false }));

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
    expect(logArgs().data.action).toBe("menu.menuitem.updated");
    expect(logArgs().data.entity).toBe("MenuItem");
    expect(logArgs().data.entityId).toBe("menu-1");
    expect(logArgs().data.before).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Baru",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: false,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    for (const value of Object.values(logArgs().data.after as Record<string, unknown>)) {
      expect(value).not.toBeInstanceOf(Date);
      expect(value === null || typeof value !== "object").toBe(true);
    }
    for (const value of Object.values(logArgs().data.before as Record<string, unknown>)) {
      expect(value).not.toBeInstanceOf(Date);
      expect(value === null || typeof value !== "object").toBe(true);
    }
  });

  it("combines the current row with the supplied changes without refetching", async () => {
    const summary = await updateMenuItem(updateBase({ price: 30000 }));

    expect(summary).toEqual({
      id: "menu-1",
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      price: 30000,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: expect.any(String),
    });
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns a MenuItemSummary with the mutated fields and ISO timestamps", async () => {
    const summary = await updateMenuItem(updateBase({ isActive: false, sortOrder: 0 }));

    expect(Object.keys(summary).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ]);
    expect(summary.id).toBe("menu-1");
    expect(summary.categoryId).toBe("cat-1");
    expect(summary.name).toBe("Nasi Goreng Lama");
    expect(summary.price).toBe(20000);
    expect(summary.isActive).toBe(false);
    expect(summary.isSoldOut).toBe(false);
    expect(summary.deletedAt).toBeNull();
    expect(typeof summary.updatedAt).toBe("string");
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("runs find, category check, duplicate check, update and log in that order", async () => {
    const callOrder: string[] = [];
    let itemFindCall = 0;
    tx.menuItem.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      itemFindCall += 1;
      const isDuplicate = typeof args.where.name === "object" && args.where.name !== null;
      callOrder.push(isDuplicate ? "duplicate" : "find");
      return itemFindCall === 1 ? currentRow : null;
    });
    tx.menuCategory.findFirst.mockImplementation(async () => {
      callOrder.push("category");
      return ACTIVE_CATEGORY;
    });
    tx.menuItem.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await updateMenuItem(updateBase({ categoryId: "cat-2", name: "Nasi Goreng Baru" }));

    expect(callOrder).toEqual(["find", "category", "duplicate", "updateMany", "activityLog"]);
    expect(tx.menuCategory.findFirst).toHaveBeenCalledTimes(1);
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await updateMenuItem(updateBase({ name: "Nasi Goreng Baru" }));

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("updateMenuItem - error mapping", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps a catalog P2002 race to MENU_NAME_CONFLICT with the precheck message", async () => {
    tx.menuItem.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(
      updateMenuItem(updateBase({ name: "Nasi Goreng Baru" })),
      "MENU_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an unknown database error to INTERNAL_ERROR without leaking details", async () => {
    tx.menuItem.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(
      updateMenuItem(updateBase({ name: "Nasi Goreng Baru" })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(
      updateMenuItem(updateBase({ name: "Nasi Goreng Baru" })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("archiveMenuItem - input, authorization and lookup", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(archiveMenuItem({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user or permission fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
    ]) {
      const error = await expectDomainError(archiveMenuItem(archiveInput(foreign)), "INVALID_INPUT");
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await archiveMenuItem(archiveInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(archiveMenuItem(archiveInput()));

    expect(error).toBe(domainError);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("scopes the current row lookup to id, trusted tenant and authorized outlet", async () => {
    await archiveMenuItem(archiveInput({ outletId: "  outlet-raw  " }));

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(itemFindArgsAt(0).where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(itemFindArgsAt(0).where.outletId).not.toBe("outlet-raw");
    expect(itemFindArgsAt(0).select).toEqual({
      id: true,
      categoryId: true,
      name: true,
      description: true,
      price: true,
      imageUrl: true,
      imageAlt: true,
      sortOrder: true,
      isActive: true,
      isSoldOut: true,
      deletedAt: true,
      updatedAt: true,
    });
  });

  it("maps a missing menu item to MENU_ITEM_NOT_FOUND without updating or logging", async () => {
    mockUpdateLookups(null);

    const error = await expectDomainError(archiveMenuItem(archiveInput()), "MENU_ITEM_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_ITEM_NOT_FOUND"));
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("archiveMenuItem - state and version ordering", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("lets the version check win over the state check for a stale token on an archived row", async () => {
    mockUpdateLookups(archivedRow);

    const error = await expectDomainError(
      archiveMenuItem(archiveInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("CATALOG_STATE_CONFLICT");
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("reports CATALOG_STATE_CONFLICT for an already archived row with a matching token", async () => {
    mockUpdateLookups(archivedRow);

    const error = await expectDomainError(archiveMenuItem(archiveInput()), "CATALOG_STATE_CONFLICT");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATALOG_STATE_CONFLICT"));
  });

  it("runs no update, log or category query when the state conflict fires", async () => {
    mockUpdateLookups(archivedRow);

    await expectDomainError(archiveMenuItem(archiveInput()), "CATALOG_STATE_CONFLICT");

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("never validates category availability when archiving", async () => {
    mockUpdateLookups({ ...currentRow, categoryId: "cat-archived" });
    tx.menuCategory.findFirst.mockResolvedValue(null);

    const summary = await archiveMenuItem(archiveInput());

    expect(summary.id).toBe("menu-1");
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("archiveMenuItem - mutation, log and output", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("archives an active row with a monotonic mutation timestamp", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    const summary = await archiveMenuItem(archiveInput());

    expect(summary.deletedAt).toBe("2026-10-01T10:00:01.000Z");
    expect(summary.updatedAt).toBe("2026-10-01T10:00:01.000Z");
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("writes only deletedAt and updatedAt into the update data", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await archiveMenuItem(archiveInput());

    expect(Object.keys(updateArgs().data).sort()).toEqual(["deletedAt", "updatedAt"]);
    expect(updateArgs().data).not.toHaveProperty("categoryId");
    expect(updateArgs().data).not.toHaveProperty("isActive");
    expect(updateArgs().data).not.toHaveProperty("isSoldOut");
    expect((updateArgs().data.deletedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("keeps category, isActive and isSoldOut unchanged in the output", async () => {
    const summary = await archiveMenuItem(archiveInput());

    expect(summary.categoryId).toBe("cat-1");
    expect(summary.isActive).toBe(true);
    expect(summary.isSoldOut).toBe(false);
    expect(summary.name).toBe("Nasi Goreng Lama");
    expect(summary.price).toBe(20000);
    expect(summary.id).toBe("menu-1");
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await archiveMenuItem(archiveInput());

    expect(updateArgs().where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: currentRow.updatedAt,
    });
    expect(updateArgs().where.updatedAt).toBeInstanceOf(Date);
    expect((updateArgs().where.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await archiveMenuItem(archiveInput());

    expect((updateArgs().data.deletedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.deletedAt).toBe("2026-10-01T10:00:00.001Z");
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("uses Date.now when it is already beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const summary = await archiveMenuItem(archiveInput());

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 5000);
    expect(summary.deletedAt).toBe("2026-10-01T10:00:05.000Z");
    expect(summary.updatedAt).toBe("2026-10-01T10:00:05.000Z");
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is 0 or greater than 1", async () => {
    for (const count of [0, 2]) {
      tx.menuItem.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        archiveMenuItem(archiveInput()),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("writes the archived action with the trusted actor and ISO snapshots", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    await archiveMenuItem(archiveInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
    expect(logArgs().data.action).toBe("menu.menuitem.archived");
    expect(logArgs().data.entity).toBe("MenuItem");
    expect(logArgs().data.entityId).toBe("menu-1");
    expect(logArgs().data.before).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: "2026-10-01T10:00:01.000Z",
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    for (const snapshot of [logArgs().data.before, logArgs().data.after]) {
      for (const value of Object.values(snapshot as Record<string, unknown>)) {
        expect(value === null || typeof value !== "object").toBe(true);
        expect(value).not.toBeInstanceOf(Date);
      }
    }
  });

  it("returns a MenuItemSummary with the mutation timestamps and current field values", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);

    const summary = await archiveMenuItem(archiveInput());

    expect(summary).toEqual({
      id: "menu-1",
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      price: 20000,
      isActive: true,
      isSoldOut: false,
      deletedAt: "2026-10-01T10:00:01.000Z",
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    expect(Object.keys(summary).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ]);
    expect(summary.deletedAt).not.toBeInstanceOf(Date);
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("runs find, update and log in that order", async () => {
    const callOrder: string[] = [];
    tx.menuItem.findFirst.mockImplementation(async () => {
      callOrder.push("find");
      return currentRow;
    });
    tx.menuItem.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await archiveMenuItem(archiveInput());

    expect(callOrder).toEqual(["find", "updateMany", "activityLog"]);
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await archiveMenuItem(archiveInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("archiveMenuItem - error mapping", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps an unknown lookup failure to INTERNAL_ERROR without leaking details", async () => {
    tx.menuItem.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(archiveMenuItem(archiveInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(archiveMenuItem(archiveInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("restoreMenuItem - input, state and version checks", () => {
  beforeEach(() => {
    mockUpdateLookups(archivedRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(restoreMenuItem({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user or permission fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
    ]) {
      const error = await expectDomainError(
        restoreMenuItem(restoreInput(foreign)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await restoreMenuItem(restoreInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(restoreMenuItem(restoreInput()));

    expect(error).toBe(domainError);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("maps a missing menu item to MENU_ITEM_NOT_FOUND without duplicate, update or log", async () => {
    mockUpdateLookups(null);

    const error = await expectDomainError(restoreMenuItem(restoreInput()), "MENU_ITEM_NOT_FOUND");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_ITEM_NOT_FOUND"));
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("lets the version check win over the state check for a stale token on a non-archived row", async () => {
    mockUpdateLookups(currentRow);

    const error = await expectDomainError(
      restoreMenuItem(restoreInput({ expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("CATALOG_STATE_CONFLICT");
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("reports CATALOG_STATE_CONFLICT for a non-archived row with a matching token", async () => {
    mockUpdateLookups(currentRow);

    const error = await expectDomainError(
      restoreMenuItem(restoreInput()),
      "CATALOG_STATE_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("CATALOG_STATE_CONFLICT"));
  });

  it("skips the duplicate query entirely when the state conflict fires", async () => {
    mockUpdateLookups(currentRow);

    await expectDomainError(restoreMenuItem(restoreInput()), "CATALOG_STATE_CONFLICT");

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("restoreMenuItem - duplicate protection", () => {
  beforeEach(() => {
    mockUpdateLookups(archivedRow);
  });

  it("queries the duplicate with the current name, scoped, case-insensitive and excluding the current id", async () => {
    await restoreMenuItem(restoreInput());

    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(2);
    expect(itemFindArgsAt(1).where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      name: { equals: "Nasi Goreng Lama", mode: "insensitive" },
      id: { not: "menu-1" },
    });
    expect(itemFindArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(itemFindArgsAt(1).select).toEqual({ id: true });
  });

  it("maps an active duplicate row to MENU_NAME_CONFLICT without restoring", async () => {
    mockUpdateLookups(archivedRow, { id: "menu-active" });

    const error = await expectDomainError(
      restoreMenuItem(restoreInput()),
      "MENU_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_NAME_CONFLICT"));
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps an archived duplicate row to MENU_NAME_CONFLICT because the query never filters deletedAt", async () => {
    mockUpdateLookups(archivedRow, { id: "menu-archived" });

    const error = await expectDomainError(
      restoreMenuItem(restoreInput()),
      "MENU_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(itemFindArgsAt(1).where).not.toHaveProperty("deletedAt");
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("restores dormant when the category is archived or inactive without ever querying it", async () => {
    tx.menuCategory.findFirst.mockResolvedValue(null);

    const summary = await restoreMenuItem(restoreInput());

    expect(summary.deletedAt).toBeNull();
    expect(summary.categoryId).toBe("cat-1");
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("restoreMenuItem - mutation, log and output", () => {
  beforeEach(() => {
    mockUpdateLookups(archivedRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("writes deletedAt null with the mutation timestamp into the update data", async () => {
    await restoreMenuItem(restoreInput());

    expect(Object.keys(updateArgs().data).sort()).toEqual(["deletedAt", "updatedAt"]);
    expect(updateArgs().data.deletedAt).toBeNull();
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect(updateArgs().data).not.toHaveProperty("categoryId");
    expect(updateArgs().data).not.toHaveProperty("isActive");
    expect(updateArgs().data).not.toHaveProperty("isSoldOut");
  });

  it("keeps category, isActive and isSoldOut unchanged in the output", async () => {
    const summary = await restoreMenuItem(restoreInput());

    expect(summary.categoryId).toBe("cat-1");
    expect(summary.isActive).toBe(true);
    expect(summary.isSoldOut).toBe(false);
    expect(summary.name).toBe("Nasi Goreng Lama");
    expect(summary.price).toBe(20000);
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await restoreMenuItem(restoreInput());

    expect(updateArgs().where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: archivedRow.updatedAt,
    });
    expect((updateArgs().where.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await restoreMenuItem(restoreInput());

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("writes the restored action with the trusted actor and ISO snapshots", async () => {
    await restoreMenuItem(restoreInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
    expect(logArgs().data.action).toBe("menu.menuitem.restored");
    expect(logArgs().data.entity).toBe("MenuItem");
    expect(logArgs().data.entityId).toBe("menu-1");
    expect(logArgs().data.before).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: ARCHIVED_DELETED_AT,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    for (const snapshot of [logArgs().data.before, logArgs().data.after]) {
      for (const value of Object.values(snapshot as Record<string, unknown>)) {
        expect(value === null || typeof value !== "object").toBe(true);
        expect(value).not.toBeInstanceOf(Date);
      }
    }
  });

  it("returns a MenuItemSummary with a null deletedAt and the mutation timestamp", async () => {
    const summary = await restoreMenuItem(restoreInput());

    expect(summary).toEqual({
      id: "menu-1",
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      price: 20000,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    expect(Object.keys(summary).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ]);
    expect(summary.deletedAt).toBeNull();
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is 0 or greater than 1", async () => {
    for (const count of [0, 2]) {
      tx.menuItem.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        restoreMenuItem(restoreInput()),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("maps a catalog P2002 race to MENU_NAME_CONFLICT with the precheck message", async () => {
    tx.menuItem.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", CATALOG_NAME_META);
    });

    const error = await expectDomainError(
      restoreMenuItem(restoreInput()),
      "MENU_NAME_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_NAME_CONFLICT"));
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("maps a non-catalog P2002 to INTERNAL_ERROR without leaking the constraint", async () => {
    tx.menuItem.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "id"] });
    });

    const error = await expectDomainError(restoreMenuItem(restoreInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("P2002");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(restoreMenuItem(restoreInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("runs find, duplicate check, update and log in that order", async () => {
    const callOrder: string[] = [];
    let itemFindCall = 0;
    tx.menuItem.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      itemFindCall += 1;
      const isDuplicate = typeof args.where.name === "object" && args.where.name !== null;
      callOrder.push(isDuplicate ? "duplicate" : "find");
      return itemFindCall === 1 ? archivedRow : null;
    });
    tx.menuItem.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await restoreMenuItem(restoreInput());

    expect(callOrder).toEqual(["find", "duplicate", "updateMany", "activityLog"]);
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await restoreMenuItem(restoreInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("setMenuItemSoldOut - input, authorization and lookup", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(setMenuItemSoldOut({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenant, user or permission fields", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "menu.manage" },
    ]) {
      const error = await expectDomainError(
        setMenuItemSoldOut(soldOutInput(foreign)),
        "INVALID_INPUT"
      );
      expect(error).not.toBeNull();
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outletId and menu.manage", async () => {
    await setMenuItemSoldOut(soldOutInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(setMenuItemSoldOut(soldOutInput()));

    expect(error).toBe(domainError);
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("maps a missing menu item to MENU_ITEM_NOT_FOUND without updating or logging", async () => {
    mockUpdateLookups(null);

    const error = await expectDomainError(
      setMenuItemSoldOut(soldOutInput()),
      "MENU_ITEM_NOT_FOUND"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("MENU_ITEM_NOT_FOUND"));
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("setMenuItemSoldOut - version check and no-op", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("lets the version check win over the no-op check for a stale token", async () => {
    const error = await expectDomainError(
      setMenuItemSoldOut(
        soldOutInput({ isSoldOut: false, expectedUpdatedAt: "2026-09-30T00:00:00.000Z" })
      ),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(error).not.toBeNull();
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("treats selling out false -> false as a successful no-op that keeps the old timestamp", async () => {
    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: false }));

    expect(summary.isSoldOut).toBe(false);
    expect(summary.updatedAt).toBe(CURRENT_UPDATED_AT);
    expect(summary.deletedAt).toBeNull();
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("treats true -> true as a successful no-op that keeps the old timestamp", async () => {
    mockUpdateLookups({ ...currentRow, isSoldOut: true });

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(summary.isSoldOut).toBe(true);
    expect(summary.updatedAt).toBe(CURRENT_UPDATED_AT);
    expect(summary.deletedAt).toBeNull();
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("allows a no-op on an archived row while preserving the archived deletedAt", async () => {
    mockUpdateLookups(archivedRow);

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: false }));

    expect(summary.isSoldOut).toBe(false);
    expect(summary.deletedAt).toBe(ARCHIVED_DELETED_AT);
    expect(summary.updatedAt).toBe(CURRENT_UPDATED_AT);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("setMenuItemSoldOut - mutation, log and output", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 1000);
  });

  it("flips false -> true with only isSoldOut and updatedAt in the update data", async () => {
    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(Object.keys(updateArgs().data).sort()).toEqual(["isSoldOut", "updatedAt"]);
    expect(updateArgs().data.isSoldOut).toBe(true);
    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1000);
    expect(summary.isSoldOut).toBe(true);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:01.000Z");
  });

  it("flips true -> false with only isSoldOut and updatedAt in the update data", async () => {
    mockUpdateLookups({ ...currentRow, isSoldOut: true });

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: false }));

    expect(Object.keys(updateArgs().data).sort()).toEqual(["isSoldOut", "updatedAt"]);
    expect(updateArgs().data.isSoldOut).toBe(false);
    expect(summary.isSoldOut).toBe(false);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:01.000Z");
  });

  it("mutates an archived row while keeping its deletedAt", async () => {
    mockUpdateLookups(archivedRow);

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(summary.isSoldOut).toBe(true);
    expect(summary.deletedAt).toBe(ARCHIVED_DELETED_AT);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:01.000Z");
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("never queries the category or a duplicate name", async () => {
    await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(itemFindArgsAt(0).where.id).toBe("menu-1");
    expect(itemFindArgsAt(0).where).not.toHaveProperty("name");
  });

  it("guards the conditional write with id, tenant, outlet and the current updatedAt", async () => {
    await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(updateArgs().where).toEqual({
      id: "menu-1",
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      updatedAt: currentRow.updatedAt,
    });
    expect((updateArgs().where.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS);

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 1);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:00.001Z");
  });

  it("uses Date.now when it is already beyond current + 1", async () => {
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect((updateArgs().data.updatedAt as Date).getTime()).toBe(CURRENT_UPDATED_AT_MS + 5000);
    expect(summary.updatedAt).toBe("2026-10-01T10:00:05.000Z");
  });

  it("reports CATALOG_VERSION_CONFLICT when updateMany count is 0 or greater than 1 without logging", async () => {
    for (const count of [0, 2]) {
      tx.menuItem.updateMany.mockResolvedValue({ count });
      tx.activityLog.create.mockClear();

      const error = await expectDomainError(
        setMenuItemSoldOut(soldOutInput({ isSoldOut: true })),
        "CATALOG_VERSION_CONFLICT"
      );

      expect(error).not.toBeNull();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    }
  });

  it("writes the sold-out action with the trusted actor and full ISO snapshots", async () => {
    await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
    expect(logArgs().data.action).toBe("menu.menuitem.soldout.changed");
    expect(logArgs().data.entity).toBe("MenuItem");
    expect(logArgs().data.entityId).toBe("menu-1");
    expect(logArgs().data.before).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: false,
      deletedAt: null,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(logArgs().data.after).toEqual({
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      description: "Deskripsi lama",
      price: 20000,
      imageUrl: "https://example.test/old.png",
      imageAlt: "Gambar lama",
      sortOrder: 4,
      isActive: true,
      isSoldOut: true,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    for (const snapshot of [logArgs().data.before, logArgs().data.after]) {
      for (const value of Object.values(snapshot as Record<string, unknown>)) {
        expect(value === null || typeof value !== "object").toBe(true);
        expect(value).not.toBeInstanceOf(Date);
      }
    }
  });

  it("returns a MenuItemSummary with the new sold-out flag and mutation timestamp", async () => {
    const summary = await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(summary).toEqual({
      id: "menu-1",
      categoryId: "cat-1",
      name: "Nasi Goreng Lama",
      price: 20000,
      isActive: true,
      isSoldOut: true,
      deletedAt: null,
      updatedAt: "2026-10-01T10:00:01.000Z",
    });
    expect(Object.keys(summary).sort()).toEqual([
      "categoryId",
      "deletedAt",
      "id",
      "isActive",
      "isSoldOut",
      "name",
      "price",
      "updatedAt",
    ]);
    expect(summary.updatedAt).not.toBeInstanceOf(Date);
  });

  it("runs find, update and log in that order", async () => {
    const callOrder: string[] = [];
    tx.menuItem.findFirst.mockImplementation(async () => {
      callOrder.push("find");
      return currentRow;
    });
    tx.menuItem.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(callOrder).toEqual(["find", "updateMany", "activityLog"]);
    expect(tx.menuCategory.findFirst).not.toHaveBeenCalled();
  });

  it("opens the transaction with maxWait 5000 and timeout 15000", async () => {
    await setMenuItemSoldOut(soldOutInput({ isSoldOut: true }));

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("setMenuItemSoldOut - error mapping and concurrency", () => {
  beforeEach(() => {
    mockUpdateLookups(currentRow);
  });

  it("maps an unknown lookup failure to INTERNAL_ERROR without leaking details", async () => {
    tx.menuItem.findFirst.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await expectDomainError(
      setMenuItemSoldOut(soldOutInput({ isSoldOut: true })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a non-catalog P2002 race to INTERNAL_ERROR without leaking the constraint", async () => {
    tx.menuItem.updateMany.mockImplementation(async () => {
      throw prismaError("P2002", { target: ["tenantId", "id"] });
    });

    const error = await expectDomainError(
      setMenuItemSoldOut(soldOutInput({ isSoldOut: true })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("simulated prisma");
    expect(error?.message).not.toContain("P2002");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR instead of returning success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(
      setMenuItemSoldOut(soldOutInput({ isSoldOut: true })),
      "INTERNAL_ERROR"
    );

    expect(error).not.toBeNull();
    expect(error?.message).not.toContain("activity log insert failed");
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });

  it("runs the transaction exactly once without retry on a version conflict", async () => {
    tx.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(
      setMenuItemSoldOut(soldOutInput({ isSoldOut: true })),
      "CATALOG_VERSION_CONFLICT"
    );

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).toHaveBeenCalledTimes(1);
  });

  it("runs the transaction exactly once without retry on the no-op path", async () => {
    await setMenuItemSoldOut(soldOutInput({ isSoldOut: false }));

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(mockedTransaction.mock.calls).toHaveLength(1);
    expect(tx.menuItem.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});
