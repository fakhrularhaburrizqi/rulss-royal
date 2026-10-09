import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import {
  decodeMenuItemCursor,
  encodeMenuItemCursor,
} from "@/lib/menu-item-cursor";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import { listMenuItemsPaginated } from "@/lib/services/menu-item-query.service";

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    menuItem: { findMany: mockFindMany },
    $transaction: vi.fn(),
  },
}));

const FROZEN_NOW = new Date("2026-03-10T08:30:00.000Z");
const ARCHIVED_AT = new Date("2026-01-01T00:00:00.000Z");

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

type RawItemRow = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    isActive: boolean;
    deletedAt: Date | null;
  };
};

const itemRows = [
  {
    id: "item-1",
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
    updatedAt: FROZEN_NOW,
    category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
  },
  {
    id: "item-2",
    categoryId: "cat-1",
    name: "Es Teh",
    description: "Manis",
    price: 5000,
    imageUrl: "https://cdn.example.com/esteh.png",
    imageAlt: "Es teh manis",
    sortOrder: 1,
    isActive: true,
    isSoldOut: true,
    deletedAt: null,
    updatedAt: FROZEN_NOW,
    category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
  },
  {
    id: "item-3",
    categoryId: "cat-2",
    name: "Ayam Goreng",
    description: null,
    price: 30000,
    imageUrl: null,
    imageAlt: null,
    sortOrder: 0,
    isActive: true,
    isSoldOut: false,
    deletedAt: ARCHIVED_AT,
    updatedAt: FROZEN_NOW,
    category: { id: "cat-2", name: "Minuman", isActive: true, deletedAt: null },
  },
  {
    id: "item-4",
    categoryId: "cat-2",
    name: "Kopi Susu",
    description: null,
    price: 15000,
    imageUrl: null,
    imageAlt: null,
    sortOrder: 1,
    isActive: false,
    isSoldOut: false,
    deletedAt: null,
    updatedAt: FROZEN_NOW,
    category: { id: "cat-2", name: "Minuman Lama", isActive: false, deletedAt: null },
  },
] as const satisfies Array<RawItemRow>;

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, unknown>;
  orderBy: Array<Record<string, string>>;
  take: number;
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedFindMany = mockFindMany as unknown as Mock;

function firstFindManyArgs(): FindManyArgs {
  expect(mockedFindMany).toHaveBeenCalledTimes(1);
  return mockedFindMany.mock.calls[0]?.[0] as FindManyArgs;
}

function baseOptions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-ctx",
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

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedFindMany.mockResolvedValue([]);
});

describe("listMenuItemsPaginated - preflight", () => {
  it("maps invalid Zod input to INVALID_INPUT without touching context or database", async () => {
    await expectDomainError(
      listMenuItemsPaginated({ outletId: "", limit: 10, filter: "all" }),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("rejects unknown params before authorization", async () => {
    await expectDomainError(
      listMenuItemsPaginated({ outletId: "outlet-ctx", bogus: 1 }),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("maps a malformed cursor to INVALID_INPUT before authorization", async () => {
    await expectDomainError(
      listMenuItemsPaginated(baseOptions({ cursor: "not-base64!" })),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("rejects a cursor bound to a different outlet before authorization", async () => {
    const cursor = encodeMenuItemCursor({
      v: 1,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "other-outlet",
      filter: "all",
      search: undefined,
    });

    await expectDomainError(
      listMenuItemsPaginated(baseOptions({ cursor })),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("rejects a cursor bound to a different filter before authorization", async () => {
    const cursor = encodeMenuItemCursor({
      v: 1,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "outlet-ctx",
      filter: "active",
      search: undefined,
    });

    await expectDomainError(
      listMenuItemsPaginated(baseOptions({ cursor })),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("rejects a cursor bound to a different search before authorization", async () => {
    const cursor = encodeMenuItemCursor({
      v: 1,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "outlet-ctx",
      filter: "all",
      search: "nasi",
    });

    await expectDomainError(
      listMenuItemsPaginated(baseOptions({ cursor, search: "ayam" })),
      "INVALID_INPUT"
    );
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });
});

describe("listMenuItemsPaginated - authorization", () => {
  it("authorizes with the trimmed outlet and menu.view before any query", async () => {
    await listMenuItemsPaginated(baseOptions({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "menu.view");
    expect(mockedFindMany).toHaveBeenCalledTimes(1);
  });

  it("keeps the context error and never reaches the database", async () => {
    mockedRequireOrderContext.mockRejectedValue(new OrderDomainError("UNAUTHENTICATED"));

    const error = await captureError(listMenuItemsPaginated(baseOptions()));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("UNAUTHENTICATED");
    expect((error as OrderDomainError).message).toBe(getOrderErrorMessage("UNAUTHENTICATED"));
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("propagates OUTLET_ACCESS_DENIED without reaching the database", async () => {
    mockedRequireOrderContext.mockRejectedValue(new OrderDomainError("OUTLET_ACCESS_DENIED"));

    const error = await captureError(listMenuItemsPaginated(baseOptions()));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect((error as OrderDomainError).code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedFindMany).not.toHaveBeenCalled();
  });
});

describe("listMenuItemsPaginated - trusted scoping", () => {
  it("scopes the query to the actor tenant and authorized outlet from context", async () => {
    await listMenuItemsPaginated(baseOptions({ outletId: "outlet-raw" }));

    const args = firstFindManyArgs();
    expect(args.where.tenantId).toBe("tenant-ctx");
    expect(args.where.outletId).toBe("outlet-ctx");
  });
});

describe("listMenuItemsPaginated - filter logic", () => {
  it("applies no lifecycle filter for 'all'", async () => {
    await listMenuItemsPaginated(baseOptions({ filter: "all" }));

    const args = firstFindManyArgs();
    expect(args.where).toEqual({ tenantId: "tenant-ctx", outletId: "outlet-ctx" });
  });

  it("filters active: isActive true and deletedAt null", async () => {
    await listMenuItemsPaginated(baseOptions({ filter: "active" }));

    const args = firstFindManyArgs();
    expect(args.where.isActive).toBe(true);
    expect(args.where.deletedAt).toBeNull();
  });

  it("filters inactive: isActive false and deletedAt null", async () => {
    await listMenuItemsPaginated(baseOptions({ filter: "inactive" }));

    const args = firstFindManyArgs();
    expect(args.where.isActive).toBe(false);
    expect(args.where.deletedAt).toBeNull();
  });

  it("filters archived: deletedAt not null", async () => {
    await listMenuItemsPaginated(baseOptions({ filter: "archived" }));

    const args = firstFindManyArgs();
    expect(args.where.deletedAt).toEqual({ not: null });
    expect(args.where.isActive).toBeUndefined();
  });
});

describe("listMenuItemsPaginated - search", () => {
  it("applies ILIKE contains search on name", async () => {
    await listMenuItemsPaginated(baseOptions({ search: "nasi" }));

    const args = firstFindManyArgs();
    expect(args.where.name).toEqual({ contains: "nasi", mode: "insensitive" });
  });

  it("trims search and keeps tenant/outlet scope", async () => {
    await listMenuItemsPaginated(baseOptions({ search: "  nasi  " }));

    const args = firstFindManyArgs();
    expect(args.where.name).toEqual({ contains: "nasi", mode: "insensitive" });
    expect(args.where.tenantId).toBe("tenant-ctx");
    expect(args.where.outletId).toBe("outlet-ctx");
  });

  it("combines search with filter", async () => {
    await listMenuItemsPaginated(baseOptions({ filter: "active", search: "nasi" }));

    const args = firstFindManyArgs();
    expect(args.where.isActive).toBe(true);
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.name).toEqual({ contains: "nasi", mode: "insensitive" });
  });
});

describe("listMenuItemsPaginated - keyset cursor", () => {
  it("applies the full ordering-tuple predicate including ties", async () => {
    const cursor = encodeMenuItemCursor({
      v: 1,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "outlet-ctx",
      filter: "all",
      search: undefined,
    });

    await listMenuItemsPaginated(baseOptions({ cursor }));

    const args = firstFindManyArgs();
    expect(args.where.OR).toEqual([
      { categoryId: { gt: "cat-1" } },
      { categoryId: "cat-1", sortOrder: { gt: 0 } },
      { categoryId: "cat-1", sortOrder: 0, name: { gt: "Nasi Goreng" } },
      { categoryId: "cat-1", sortOrder: 0, name: "Nasi Goreng", id: { gt: "item-1" } },
    ]);
  });

  it("combines the cursor predicate with filter and search", async () => {
    const cursor = encodeMenuItemCursor({
      v: 1,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "outlet-ctx",
      filter: "active",
      search: "nasi",
    });

    await listMenuItemsPaginated(baseOptions({ cursor, filter: "active", search: "nasi" }));

    const args = firstFindManyArgs();
    expect(args.where.isActive).toBe(true);
    expect(args.where.deletedAt).toBeNull();
    expect(args.where.name).toEqual({ contains: "nasi", mode: "insensitive" });
    expect(args.where.OR).toBeDefined();
  });
});

describe("listMenuItemsPaginated - query shape", () => {
  it("uses the exact deterministic ascending ordering", async () => {
    await listMenuItemsPaginated(baseOptions());

    const args = firstFindManyArgs();
    expect(args.orderBy).toEqual([
      { categoryId: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
      { id: "asc" },
    ]);
  });

  it("fetches limit + 1 rows", async () => {
    await listMenuItemsPaginated(baseOptions({ limit: 10 }));

    const args = firstFindManyArgs();
    expect(args.take).toBe(11);
  });

  it("selects the 12 management fields plus the nested category projection", async () => {
    await listMenuItemsPaginated(baseOptions());

    const args = firstFindManyArgs();
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
      category: { select: { id: true, name: true, isActive: true, deletedAt: true } },
    });
  });
});

describe("listMenuItemsPaginated - pagination envelope", () => {
  it("returns hasMore=false and nextCursor=null when rows fit the limit", async () => {
    mockedFindMany.mockResolvedValue(itemRows.slice(0, 2));

    const result = await listMenuItemsPaginated(baseOptions({ limit: 10 }));

    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.data).toHaveLength(2);
  });

  it("returns hasMore=true and nextCursor from the last returned row, not the extra row", async () => {
    mockedFindMany.mockResolvedValue(itemRows);

    const result = await listMenuItemsPaginated(baseOptions({ limit: 2 }));

    expect(result.hasMore).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.nextCursor).not.toBeNull();

    const decoded = decodeMenuItemCursor(result.nextCursor as string);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe("item-2");
    expect(decoded?.categoryId).toBe("cat-1");
    expect(decoded?.name).toBe("Es Teh");
    expect(decoded?.sortOrder).toBe(1);
    expect(decoded?.outletId).toBe("outlet-ctx");
    expect(decoded?.filter).toBe("all");
    expect(decoded?.search).toBeUndefined();
  });

  it("embeds filter and search in the next cursor", async () => {
    mockedFindMany.mockResolvedValue(itemRows);

    const result = await listMenuItemsPaginated(
      baseOptions({ limit: 2, filter: "active", search: "nasi" })
    );

    const decoded = decodeMenuItemCursor(result.nextCursor as string);
    expect(decoded?.outletId).toBe("outlet-ctx");
    expect(decoded?.filter).toBe("active");
    expect(decoded?.search).toBe("nasi");
  });

  it("returns empty data and hasMore=false for an empty result", async () => {
    mockedFindMany.mockResolvedValue([]);

    const result = await listMenuItemsPaginated(baseOptions());

    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("trims data to the limit while fetching limit + 1", async () => {
    mockedFindMany.mockResolvedValue(itemRows);

    const result = await listMenuItemsPaginated(baseOptions({ limit: 3 }));

    expect(result.data).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });
});

describe("listMenuItemsPaginated - DTO mapping", () => {
  it("maps all 12 fields plus nested category with ISO dates", async () => {
    mockedFindMany.mockResolvedValue([itemRows[0]]);

    const result = await listMenuItemsPaginated(baseOptions());

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: "item-1",
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
      updatedAt: "2026-03-10T08:30:00.000Z",
      category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
    });
  });

  it("keeps image URL metadata without exposing storage fields", async () => {
    mockedFindMany.mockResolvedValue([itemRows[1]]);

    const result = await listMenuItemsPaginated(baseOptions());

    expect(result.data[0].imageUrl).toBe("https://cdn.example.com/esteh.png");
    expect(result.data[0].imageAlt).toBe("Es teh manis");
    expect(result.data[0].isSoldOut).toBe(true);
  });

  it("serializes archived deletedAt to an ISO string", async () => {
    mockedFindMany.mockResolvedValue([itemRows[2]]);

    const result = await listMenuItemsPaginated(baseOptions());

    expect(result.data[0].deletedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.data[0].updatedAt).toBe("2026-03-10T08:30:00.000Z");
  });

  it("keeps sold-out, archived, inactive, and unavailable-category rows in the management list", async () => {
    mockedFindMany.mockResolvedValue(itemRows);

    const result = await listMenuItemsPaginated(baseOptions({ limit: 10 }));

    expect(result.data).toHaveLength(4);
    const soldOut = result.data.find((row) => row.id === "item-2");
    expect(soldOut?.isSoldOut).toBe(true);
    const archived = result.data.find((row) => row.id === "item-3");
    expect(archived?.deletedAt).toBe("2026-01-01T00:00:00.000Z");
    const inactive = result.data.find((row) => row.id === "item-4");
    expect(inactive?.isActive).toBe(false);
    expect(inactive?.category.isActive).toBe(false);
    expect(inactive?.category.name).toBe("Minuman Lama");
  });

  it("fails safely with INTERNAL_ERROR when the category relation is missing", async () => {
    mockedFindMany.mockResolvedValue([{ ...itemRows[1], category: null }]);

    await expectDomainError(listMenuItemsPaginated(baseOptions()), "INTERNAL_ERROR");
  });
});

describe("listMenuItemsPaginated - error mapping", () => {
  it("maps unknown database error to INTERNAL_ERROR", async () => {
    mockedFindMany.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expectDomainError(listMenuItemsPaginated(baseOptions()), "INTERNAL_ERROR");
  });

  it("rethrows OrderDomainError from the query path", async () => {
    mockedFindMany.mockRejectedValue(new OrderDomainError("INTERNAL_ERROR"));

    await expectDomainError(listMenuItemsPaginated(baseOptions()), "INTERNAL_ERROR");
  });
});
