import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import { listMenuCategoriesPaginated } from "@/lib/services/menu-category-query.service";

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    menuCategory: { findMany: mockFindMany },
    $transaction: vi.fn(),
  },
}));

const FROZEN_NOW = new Date("2026-03-10T08:30:00.000Z");

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const categoryRows = [
  { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW, tenantId: "tenant-ctx", outletId: "outlet-ctx" },
  { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW, tenantId: "tenant-ctx", outletId: "outlet-ctx" },
  { id: "cat-3", name: "Snack", sortOrder: 2, isActive: false, deletedAt: null, createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW, tenantId: "tenant-ctx", outletId: "outlet-ctx" },
  { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: new Date("2026-01-01"), createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW, tenantId: "tenant-ctx", outletId: "outlet-ctx" },
] as const satisfies Array<{
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  outletId: string;
}>;

function baseOptions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outlet: "outlet-1",
    limit: 10,
    filter: "all",
    search: undefined,
    cursor: undefined,
    ...overrides,
  };
}

async function captureError(promise: Promise<unknown>): Promise<Error | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as Error;
  }
}

async function expectDomainError(
  promise: Promise<unknown>,
  code: Parameters<typeof getOrderErrorMessage>[0]
): Promise<Error | null> {
  const error = await captureError(promise);
  expect(error).toBeInstanceOf(OrderDomainError);
  expect((error as OrderDomainError).code).toBe(code);
  expect((error as OrderDomainError).message).toBe(getOrderErrorMessage(code));
  return error;
}

const mockedRequireOrderContextFn = vi.mocked(requireOrderContext);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FROZEN_NOW);

  mockedRequireOrderContextFn.mockResolvedValue({
    actor: { userId: "user-1", tenantId: "tenant-ctx" },
    outletId: "outlet-ctx",
  });

  mockFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("listMenuCategoriesPaginated - preflight", () => {
  it("maps invalid Zod input to INVALID_INPUT without touching context or database", async () => {
    const error = await captureError(
      listMenuCategoriesPaginated({
        outlet: "",
        limit: 10,
        filter: "all",
        search: undefined,
        cursor: null,
      })
    );

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("INVALID_INPUT");
    expect(mockedRequireOrderContextFn).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("requires outlet", async () => {
    const error = await captureError(
      listMenuCategoriesPaginated({
        outlet: "   ",
        limit: 10,
        filter: "all",
        search: undefined,
        cursor: null,
      })
    );

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("INVALID_INPUT");
    expect(mockedRequireOrderContextFn).not.toHaveBeenCalled();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("authorizes with the normalized outlet and menu.view", async () => {
    await listMenuCategoriesPaginated(baseOptions({ outlet: "  outlet-raw  " }));

    expect(mockedRequireOrderContextFn).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContextFn).toHaveBeenCalledWith("outlet-raw", "menu.view");
  });

  it("keeps the context error and never reaches the database", async () => {
    const domainError = new OrderDomainError("UNAUTHENTICATED");
    mockedRequireOrderContextFn.mockRejectedValue(domainError);

    const error = await captureError(listMenuCategoriesPaginated(baseOptions()));

    expect(error).toBe(domainError);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("listMenuCategoriesPaginated - outlet scope", () => {
  it("scopes the query to the actor tenant and authorized outlet", async () => {
    await listMenuCategoriesPaginated(baseOptions());

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe("tenant-ctx");
    expect(where.outletId).toBe("outlet-ctx");
  });

  it("maps context error and never reaches database", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContextFn.mockRejectedValue(domainError);

    const error = await captureError(listMenuCategoriesPaginated(baseOptions()));

    expect(error).toBe(domainError);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});

describe("listMenuCategoriesPaginated - filter logic", () => {
  it("applies no lifecycle filter for 'all'", async () => {
    await listMenuCategoriesPaginated(baseOptions({ filter: "all" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBeUndefined();
    expect(where.deletedAt).toBeUndefined();
  });

  it("filters active: isActive true and deletedAt null", async () => {
    await listMenuCategoriesPaginated(baseOptions({ filter: "active" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
  });

  it("filters inactive: isActive false and deletedAt null", async () => {
    await listMenuCategoriesPaginated(baseOptions({ filter: "inactive" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(false);
    expect(where.deletedAt).toBeNull();
  });

  it("filters archived: deletedAt not null", async () => {
    await listMenuCategoriesPaginated(baseOptions({ filter: "archived" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.deletedAt).toEqual({ not: null });
    expect(where.isActive).toBeUndefined();
  });
});

describe("listMenuCategoriesPaginated - search", () => {
  it("applies ILIKE contains search on name", async () => {
    await listMenuCategoriesPaginated(baseOptions({ search: "nasi" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: "nasi", mode: "insensitive" });
  });

  it("search is trimmed and scoped to tenant/outlet", async () => {
    await listMenuCategoriesPaginated(baseOptions({ search: "  nasi  " }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: "nasi", mode: "insensitive" });
    expect(where.tenantId).toBe("tenant-ctx");
    expect(where.outletId).toBe("outlet-ctx");
  });

  it("combines search with filter and cursor", async () => {
    const cursor = Buffer.from(JSON.stringify({
      v: 1 as const,
      sortOrder: 0,
      name: "Makanan",
      id: "cat-1",
      outletId: "outlet-ctx",
      filter: "active",
      search: "nasi",
    })).toString("base64url");

    await listMenuCategoriesPaginated(baseOptions({ cursor, filter: "active", search: "nasi" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(where.name).toEqual({ contains: "nasi", mode: "insensitive" });
    expect(where.OR).toBeDefined();
  });
});

describe("listMenuCategoriesPaginated - cursor pagination", () => {
  it("applies cursor predicate with OR on sortOrder, name, id", async () => {
    const cursor = Buffer.from(JSON.stringify({
      v: 1 as const,
      sortOrder: 1,
      name: "Minuman",
      id: "cat-2",
      outletId: "outlet-ctx",
      filter: "all",
      search: undefined,
    })).toString("base64url");

    await listMenuCategoriesPaginated(baseOptions({ cursor }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { sortOrder: { gt: 1 } },
      { sortOrder: 1, name: { gt: "Minuman" } },
      { sortOrder: 1, name: "Minuman", id: { gt: "cat-2" } },
    ]);
  });

  it("combines cursor with filter and search", async () => {
    const cursor = Buffer.from(JSON.stringify({
      v: 1 as const,
      sortOrder: 0,
      name: "Makanan",
      id: "cat-1",
      outletId: "outlet-ctx",
      filter: "active",
      search: "nasi",
    })).toString("base64url");

    await listMenuCategoriesPaginated(baseOptions({ cursor, filter: "active", search: "nasi" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(where.name).toEqual({ contains: "nasi", mode: "insensitive" });
    expect(where.OR).toBeDefined();
  });
});

describe("listMenuCategoriesPaginated - limit and pagination", () => {
  it("uses limit+1 for hasMore detection", async () => {
    await listMenuCategoriesPaginated(baseOptions({ limit: 10 }));

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany.mock.calls[0][0].take).toBe(11);
  });

  it("returns hasMore=false and nextCursor=null when results <= limit", async () => {
    mockFindMany.mockResolvedValue(categoryRows.slice(0, 2));

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 10 }));

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it("returns hasMore=true and nextCursor from last returned item", async () => {
    mockFindMany.mockResolvedValue(categoryRows);

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 2 }));

    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();

    const decoded = JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString("utf-8"));
    expect(decoded.id).toBe("cat-2");
    expect(decoded.name).toBe("Minuman");
    expect(decoded.sortOrder).toBe(1);
    expect(decoded.outletId).toBe("outlet-ctx");
    expect(decoded.filter).toBe("all");
    expect(decoded.search).toBeUndefined();
  });

  it("cursor binding includes outletId, filter, search", async () => {
    mockFindMany.mockResolvedValue(categoryRows);

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 2, filter: "active", search: "nasi" }));

    const decoded = JSON.parse(Buffer.from(result.nextCursor!, "base64url").toString("utf-8"));
    expect(decoded.outletId).toBe("outlet-ctx");
    expect(decoded.filter).toBe("active");
    expect(decoded.search).toBe("nasi");
  });

  it("returns empty data and hasMore=false for empty result", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 10 }));

    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("serializes dates to ISO strings", async () => {
    mockFindMany.mockResolvedValue([categoryRows[0]]);

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 10 }));

    expect(result.data[0].deletedAt === null || typeof result.data[0].deletedAt === "string").toBe(true);
    expect(typeof result.data[0].updatedAt).toBe("string");
    expect(result.data[0].deletedAt).toBeNull();
    expect(new Date(result.data[0].updatedAt)).toBeInstanceOf(Date);
  });
  });

  it("limits results to limit even when limit+1 fetched", async () => {
    mockFindMany.mockResolvedValue(categoryRows.slice(0, 3));

    const result = await listMenuCategoriesPaginated(baseOptions({ limit: 2 }));

    expect(result.data).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

describe("listMenuCategoriesPaginated - error mapping", () => {
  it("maps unknown database error to INTERNAL_ERROR", async () => {
    mockFindMany.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const error = await captureError(listMenuCategoriesPaginated(baseOptions()));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("INTERNAL_ERROR");
  });

  it("maps context UNAUTHENTICATED to OrderDomainError", async () => {
    mockedRequireOrderContextFn.mockRejectedValue(new OrderDomainError("UNAUTHENTICATED"));

    const error = await captureError(listMenuCategoriesPaginated(baseOptions()));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("UNAUTHENTICATED");
    expect((error as OrderDomainError).message).toBe(getOrderErrorMessage("UNAUTHENTICATED"));
  });

  it("maps context OUTLET_ACCESS_DENIED to OrderDomainError", async () => {
    mockedRequireOrderContextFn.mockRejectedValue(new OrderDomainError("OUTLET_ACCESS_DENIED"));

    const error = await captureError(listMenuCategoriesPaginated(baseOptions()));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("OUTLET_ACCESS_DENIED");
    expect((error as OrderDomainError).message).toBe(getOrderErrorMessage("OUTLET_ACCESS_DENIED"));
  });
});