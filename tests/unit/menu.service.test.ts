import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  listActiveCategories,
  listMenuCategoriesForManagement,
  listMenuItemsForManagement,
  listOrderableMenuItems,
} from "@/lib/services/menu.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    menuCategory: { findMany: vi.fn() },
    menuItem: { findMany: vi.fn() },
  },
}));

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
  orderBy: Array<Record<string, string>>;
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedCategoryFindMany = db.menuCategory.findMany as unknown as Mock;
const mockedItemFindMany = db.menuItem.findMany as unknown as Mock;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

function firstFindManyArgs(mock: Mock): FindManyArgs {
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0]?.[0] as FindManyArgs;
}

async function captureError(promise: Promise<unknown>): Promise<OrderDomainError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as OrderDomainError;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedCategoryFindMany.mockResolvedValue([]);
  mockedItemFindMany.mockResolvedValue([]);
});

describe("listActiveCategories", () => {
  it("calls requireOrderContext with the raw input outletId and menu.view before any query", async () => {
    const callOrder: string[] = [];
    mockedRequireOrderContext.mockImplementation(async (outletId: string) => {
      callOrder.push(`context:${outletId}`);
      return contextResult;
    });
    mockedCategoryFindMany.mockImplementation(async () => {
      callOrder.push("query");
      return [];
    });

    await listActiveCategories("  outlet-raw  ");

    expect(mockedRequireOrderContext).toHaveBeenCalledWith("  outlet-raw  ", "menu.view");
    expect(callOrder).toEqual(["context:  outlet-raw  ", "query"]);
  });

  it("scopes the query by trusted context tenantId and normalized context outletId", async () => {
    await listActiveCategories("  outlet-raw  ");

    const args = firstFindManyArgs(mockedCategoryFindMany);
    expect(args.where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      isActive: true,
      deletedAt: null,
    });
    expect(args.where.tenantId).toBe(contextResult.actor.tenantId);
    expect(args.where.outletId).toBe(contextResult.outletId);
    expect(args.where.outletId).not.toBe("outlet-raw");
  });

  it("selects only DTO fields with deterministic ordering", async () => {
    await listActiveCategories("outlet-1");

    const args = firstFindManyArgs(mockedCategoryFindMany);
    expect(args.select).toEqual({ id: true, name: true, sortOrder: true });
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]);
  });

  it("forwards returned rows as the DTO result", async () => {
    const rows = [
      { id: "cat-1", name: "Makanan", sortOrder: 1 },
      { id: "cat-2", name: "Minuman", sortOrder: 2 },
    ];
    mockedCategoryFindMany.mockResolvedValue(rows);

    const result = await listActiveCategories("outlet-1");

    expect(result).toEqual(rows);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for an empty result instead of an error", async () => {
    mockedCategoryFindMany.mockResolvedValue([]);

    const result = await listActiveCategories("outlet-1");

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("keeps the domain error from requireOrderContext and never queries the database", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(listActiveCategories("outlet-1"));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedCategoryFindMany).not.toHaveBeenCalled();
    expect(mockedItemFindMany).not.toHaveBeenCalled();
  });

  it("maps a query failure to INTERNAL_ERROR without leaking database details", async () => {
    mockedCategoryFindMany.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await captureError(listActiveCategories("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
  });
});

describe("listOrderableMenuItems", () => {
  it("calls requireOrderContext with the raw input outletId and menu.view before any query", async () => {
    const callOrder: string[] = [];
    mockedRequireOrderContext.mockImplementation(async (outletId: string) => {
      callOrder.push(`context:${outletId}`);
      return contextResult;
    });
    mockedItemFindMany.mockImplementation(async () => {
      callOrder.push("query");
      return [];
    });

    await listOrderableMenuItems("  outlet-raw  ");

    expect(mockedRequireOrderContext).toHaveBeenCalledWith("  outlet-raw  ", "menu.view");
    expect(callOrder).toEqual(["context:  outlet-raw  ", "query"]);
  });

  it("scopes the query by trusted context tenantId and normalized context outletId", async () => {
    await listOrderableMenuItems("  outlet-raw  ");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      isActive: true,
      deletedAt: null,
      isSoldOut: false,
      category: { isActive: true, deletedAt: null },
    });
    expect(args.where.tenantId).toBe(contextResult.actor.tenantId);
    expect(args.where.outletId).toBe(contextResult.outletId);
    expect(args.where.outletId).not.toBe("outlet-raw");
  });

  it("requires an active, non-deleted category relation", async () => {
    await listOrderableMenuItems("outlet-1");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.where.category).toEqual({ isActive: true, deletedAt: null });
    expect(args.where.isSoldOut).toBe(false);
  });

  it("selects only DTO fields with deterministic ordering", async () => {
    await listOrderableMenuItems("outlet-1");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.select).toEqual({
      id: true,
      categoryId: true,
      name: true,
      price: true,
      sortOrder: true,
    });
    expect(args.orderBy).toEqual([
      { categoryId: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ]);
  });

  it("forwards returned rows as the DTO result", async () => {
    const rows = [
      { id: "item-1", categoryId: "cat-1", name: "Nasi Goreng", price: 25_000, sortOrder: 1 },
      { id: "item-2", categoryId: "cat-1", name: "Es Teh", price: 5_000, sortOrder: 2 },
    ];
    mockedItemFindMany.mockResolvedValue(rows);

    const result = await listOrderableMenuItems("outlet-1");

    expect(result).toEqual(rows);
    expect(result).toHaveLength(2);
    expect(result[0]?.categoryId).toBe("cat-1");
    expect(result[0]?.price).toBe(25_000);
  });

  it("returns an empty array for an empty result instead of an error", async () => {
    mockedItemFindMany.mockResolvedValue([]);

    const result = await listOrderableMenuItems("outlet-1");

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("keeps the domain error from requireOrderContext and never queries the database", async () => {
    const domainError = new OrderDomainError("UNAUTHENTICATED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(listOrderableMenuItems("outlet-1"));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("UNAUTHENTICATED");
    expect(mockedItemFindMany).not.toHaveBeenCalled();
    expect(mockedCategoryFindMany).not.toHaveBeenCalled();
  });

  it("maps a query failure to INTERNAL_ERROR without leaking database details", async () => {
    mockedItemFindMany.mockRejectedValue(
      new Error("Unique constraint failed on the fields: (`tenantId`)")
    );

    const error = await captureError(listOrderableMenuItems("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("Unique constraint");
    expect(error?.message).not.toContain("tenantId");
  });
});

describe("listMenuCategoriesForManagement", () => {
  it("calls requireOrderContext with the raw input outletId and menu.view before any query", async () => {
    const callOrder: string[] = [];
    mockedRequireOrderContext.mockImplementation(async (outletId: string) => {
      callOrder.push(`context:${outletId}`);
      return contextResult;
    });
    mockedCategoryFindMany.mockImplementation(async () => {
      callOrder.push("query");
      return [];
    });

    await listMenuCategoriesForManagement("  outlet-raw  ");

    expect(mockedRequireOrderContext).toHaveBeenCalledWith("  outlet-raw  ", "menu.view");
    expect(callOrder).toEqual(["context:  outlet-raw  ", "query"]);
  });

  it("scopes the query by trusted context tenantId and normalized context outletId only", async () => {
    await listMenuCategoriesForManagement("  outlet-raw  ");

    const args = firstFindManyArgs(mockedCategoryFindMany);
    expect(args.where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(args.where.tenantId).toBe(contextResult.actor.tenantId);
    expect(args.where.outletId).toBe(contextResult.outletId);
    expect(args.where.outletId).not.toBe("outlet-raw");
  });

  it("never filters isActive or deletedAt so inactive and archived rows stay visible", async () => {
    await listMenuCategoriesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedCategoryFindMany);
    expect(args.where).not.toHaveProperty("isActive");
    expect(args.where).not.toHaveProperty("deletedAt");
  });

  it("selects exactly the management DTO fields with deterministic ordering", async () => {
    await listMenuCategoriesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedCategoryFindMany);
    expect(args.select).toEqual({
      id: true,
      name: true,
      sortOrder: true,
      isActive: true,
      deletedAt: true,
      updatedAt: true,
    });
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]);
  });

  it("maps an active row to null deletedAt and an ISO updatedAt", async () => {
    mockedCategoryFindMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Makanan",
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ]);

    const result = await listMenuCategoriesForManagement("outlet-1");

    expect(result).toEqual([
      {
        id: "cat-1",
        name: "Makanan",
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        updatedAt: "2026-10-01T10:00:00.000Z",
      },
    ]);
    expect(result[0]?.updatedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(result[0]?.deletedAt).toBeNull();
  });

  it("maps an archived row to an ISO deletedAt", async () => {
    mockedCategoryFindMany.mockResolvedValue([
      {
        id: "cat-2",
        name: "Minuman",
        sortOrder: 2,
        isActive: false,
        deletedAt: new Date("2026-09-01T08:30:00.000Z"),
        updatedAt: new Date("2026-09-15T12:00:00.000Z"),
      },
    ]);

    const result = await listMenuCategoriesForManagement("outlet-1");

    expect(result[0]?.deletedAt).toBe("2026-09-01T08:30:00.000Z");
    expect(result[0]?.updatedAt).toBe("2026-09-15T12:00:00.000Z");
    expect(result[0]?.isActive).toBe(false);
  });

  it("returns no Date object and no internal fields in the DTO", async () => {
    mockedCategoryFindMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Makanan",
        sortOrder: 1,
        isActive: true,
        deletedAt: new Date("2026-09-01T08:30:00.000Z"),
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ]);

    const result = await listMenuCategoriesForManagement("outlet-1");
    const dto = result[0];

    expect(dto).toBeDefined();
    for (const value of Object.values(dto ?? {})) {
      expect(value).not.toBeInstanceOf(Date);
    }
    expect(dto).not.toHaveProperty("tenantId");
    expect(dto).not.toHaveProperty("outletId");
    expect(dto).not.toHaveProperty("createdAt");
  });

  it("returns an empty array for an empty result instead of an error", async () => {
    mockedCategoryFindMany.mockResolvedValue([]);

    const result = await listMenuCategoriesForManagement("outlet-1");

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("keeps the domain error from requireOrderContext and never queries the database", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(listMenuCategoriesForManagement("outlet-1"));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedCategoryFindMany).not.toHaveBeenCalled();
    expect(mockedItemFindMany).not.toHaveBeenCalled();
  });

  it("maps a query failure to INTERNAL_ERROR without leaking database details", async () => {
    mockedCategoryFindMany.mockRejectedValue(new Error("password authentication failed"));

    const error = await captureError(listMenuCategoriesForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("authentication");
  });

  it("maps an invalid Date row to INTERNAL_ERROR without leaking the mapping error", async () => {
    mockedCategoryFindMany.mockResolvedValue([
      {
        id: "cat-1",
        name: "Makanan",
        sortOrder: 1,
        isActive: true,
        deletedAt: null,
        updatedAt: new Date("not-a-date"),
      },
    ]);

    const error = await captureError(listMenuCategoriesForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("Invalid time value");
  });
});

describe("listMenuItemsForManagement", () => {
  it("calls requireOrderContext with the raw input outletId and menu.view before any query", async () => {
    const callOrder: string[] = [];
    mockedRequireOrderContext.mockImplementation(async (outletId: string) => {
      callOrder.push(`context:${outletId}`);
      return contextResult;
    });
    mockedItemFindMany.mockImplementation(async () => {
      callOrder.push("query");
      return [];
    });

    await listMenuItemsForManagement("  outlet-raw  ");

    expect(mockedRequireOrderContext).toHaveBeenCalledWith("  outlet-raw  ", "menu.view");
    expect(callOrder).toEqual(["context:  outlet-raw  ", "query"]);
  });

  it("scopes the query by trusted context tenantId and normalized context outletId only", async () => {
    await listMenuItemsForManagement("  outlet-raw  ");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.where).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
    });
    expect(args.where.tenantId).toBe(contextResult.actor.tenantId);
    expect(args.where.outletId).toBe(contextResult.outletId);
    expect(args.where.outletId).not.toBe("outlet-raw");
  });

  it("never filters isActive, isSoldOut, deletedAt or category state", async () => {
    await listMenuItemsForManagement("outlet-1");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.where).not.toHaveProperty("isActive");
    expect(args.where).not.toHaveProperty("isSoldOut");
    expect(args.where).not.toHaveProperty("deletedAt");
    expect(args.where).not.toHaveProperty("category");
  });

  it("selects exactly the management DTO fields with deterministic ordering", async () => {
    await listMenuItemsForManagement("outlet-1");

    const args = firstFindManyArgs(mockedItemFindMany);
    expect(args.select).toEqual({
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
    expect(args.orderBy).toEqual([
      { categoryId: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ]);
  });

  it("forwards active, inactive, sold-out and archived rows unchanged", async () => {
    mockedItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: null,
        price: 25_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 1,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
      {
        id: "item-2",
        categoryId: "cat-1",
        name: "Es Teh",
        description: null,
        price: 5_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 2,
        isActive: false,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
      {
        id: "item-3",
        categoryId: "cat-2",
        name: "Kopi",
        description: null,
        price: 10_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 3,
        isActive: true,
        isSoldOut: true,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
      {
        id: "item-4",
        categoryId: "cat-2",
        name: "Teh Tarik",
        description: null,
        price: 8_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 4,
        isActive: true,
        isSoldOut: false,
        deletedAt: new Date("2026-09-01T08:30:00.000Z"),
        updatedAt: new Date("2026-09-01T08:30:00.000Z"),
      },
    ]);

    const result = await listMenuItemsForManagement("outlet-1");

    expect(result).toHaveLength(4);
    expect(result.map((row) => row.id)).toEqual(["item-1", "item-2", "item-3", "item-4"]);
    expect(result[1]?.isActive).toBe(false);
    expect(result[2]?.isSoldOut).toBe(true);
    expect(result[3]?.deletedAt).toBe("2026-09-01T08:30:00.000Z");
  });

  it("keeps optional description, imageUrl and imageAlt as string or null", async () => {
    mockedItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: "  Pedas manis  ",
        price: 25_000,
        imageUrl: "https://cdn.example.com/nasi.png",
        imageAlt: "Piring nasi goreng",
        sortOrder: 1,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
      {
        id: "item-2",
        categoryId: "cat-1",
        name: "Es Teh",
        description: null,
        price: 5_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 2,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ]);

    const result = await listMenuItemsForManagement("outlet-1");

    expect(result[0]?.description).toBe("  Pedas manis  ");
    expect(result[0]?.imageUrl).toBe("https://cdn.example.com/nasi.png");
    expect(result[0]?.imageAlt).toBe("Piring nasi goreng");
    expect(result[1]?.description).toBeNull();
    expect(result[1]?.imageUrl).toBeNull();
    expect(result[1]?.imageAlt).toBeNull();
  });

  it("maps deletedAt and updatedAt to ISO strings without Date objects or internal fields", async () => {
    mockedItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: null,
        price: 25_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 1,
        isActive: true,
        isSoldOut: false,
        deletedAt: new Date("2026-09-01T08:30:00.000Z"),
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ]);

    const result = await listMenuItemsForManagement("outlet-1");
    const dto = result[0];

    expect(dto?.deletedAt).toBe("2026-09-01T08:30:00.000Z");
    expect(dto?.updatedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(dto).toBeDefined();
    for (const value of Object.values(dto ?? {})) {
      expect(value).not.toBeInstanceOf(Date);
    }
    expect(dto).not.toHaveProperty("tenantId");
    expect(dto).not.toHaveProperty("outletId");
    expect(dto).not.toHaveProperty("createdAt");
  });

  it("returns an empty array for an empty result instead of an error", async () => {
    mockedItemFindMany.mockResolvedValue([]);

    const result = await listMenuItemsForManagement("outlet-1");

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("keeps the domain error from requireOrderContext and never queries the database", async () => {
    const domainError = new OrderDomainError("UNAUTHENTICATED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(listMenuItemsForManagement("outlet-1"));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("UNAUTHENTICATED");
    expect(mockedItemFindMany).not.toHaveBeenCalled();
    expect(mockedCategoryFindMany).not.toHaveBeenCalled();
  });

  it("maps a query failure to INTERNAL_ERROR without leaking database details", async () => {
    mockedItemFindMany.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const error = await captureError(listMenuItemsForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("ECONNREFUSED");
    expect(error?.message).not.toContain("connect");
  });

  it("maps an invalid updatedAt to INTERNAL_ERROR without leaking the mapping error", async () => {
    mockedItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: null,
        price: 25_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 1,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: new Date("not-a-date"),
      },
    ]);

    const error = await captureError(listMenuItemsForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("Invalid time value");
  });

  it("maps an invalid deletedAt to INTERNAL_ERROR without leaking the mapping error", async () => {
    mockedItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: null,
        price: 25_000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 1,
        isActive: true,
        isSoldOut: false,
        deletedAt: new Date("not-a-date"),
        updatedAt: new Date("2026-10-01T10:00:00.000Z"),
      },
    ]);

    const error = await captureError(listMenuItemsForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("Invalid time value");
  });
});
