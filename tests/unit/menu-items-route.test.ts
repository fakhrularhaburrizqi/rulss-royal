import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/v1/catalog/menu-items/route";
import { db } from "@/lib/db";
import { OrderDomainError } from "@/lib/order/errors";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { listMenuItemsPaginated } from "@/lib/services/menu-item-query.service";

vi.mock("@/lib/services/menu-item-query.service", () => ({
  listMenuItemsPaginated: vi.fn(),
}));

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    menuItem: { findMany: vi.fn() },
  },
}));

const mockedService = vi.mocked(listMenuItemsPaginated);
const mockedContext = vi.mocked(requireOrderContext);
const mockedFindMany = db.menuItem.findMany as unknown as Mock;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const MOCK_RESULT = {
  data: [
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
      updatedAt: "2026-03-10T08:30:00.000Z",
      category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
    },
  ],
  nextCursor: null,
  hasMore: false,
};

function makeRequest(searchParams: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/catalog/menu-items");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.append(key, value);
  }
  return new NextRequest(url.toString());
}

function makeRequestFromUrl(url: URL): NextRequest {
  return new NextRequest(url.toString());
}

function expectStandardHeaders(res: Response): void {
  expect(res.headers.get("Cache-Control")).toBe("private, no-store, must-revalidate");
  expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
}

const actualService = await vi.importActual<
  typeof import("@/lib/services/menu-item-query.service")
>("@/lib/services/menu-item-query.service");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/catalog/menu-items - isolated route contract (service mocked)", () => {
  beforeEach(() => {
    mockedService.mockResolvedValue(MOCK_RESULT);
  });

  it("returns 200 with the paginated envelope and consistent requestId/headers", async () => {
    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
    expect(body.hasMore).toBe(false);
    expect(body.requestId).toBeUndefined();
    expectStandardHeaders(res);
  });

  it("applies defaults limit 50 and filter all before the service call", async () => {
    await GET(makeRequest({ outletId: "outlet-1" }));

    expect(mockedService).toHaveBeenCalledWith(
      expect.objectContaining({ outletId: "outlet-1", limit: 50, filter: "all" })
    );
  });

  it("forwards options to the service with parsed values", async () => {
    await GET(
      makeRequest({
        outletId: "outlet-1",
        limit: "25",
        filter: "active",
        search: "  nasi  ",
        cursor: "cursor-abc",
      })
    );

    expect(mockedService).toHaveBeenCalledWith(
      expect.objectContaining({
        outletId: "outlet-1",
        limit: 25,
        filter: "active",
        search: "nasi",
        cursor: "cursor-abc",
      })
    );
  });

  it("rejects duplicate params with identical values for every key without calling the service", async () => {
    for (const key of ["outletId", "limit", "filter", "search", "cursor"]) {
      const url = new URL("http://localhost/api/v1/catalog/menu-items");
      url.searchParams.append(key, "same-value");
      url.searchParams.append(key, "same-value");

      const res = await GET(makeRequestFromUrl(url));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_INPUT");
      expect(body.message).toBe(`Parameter duplikat: ${key}`);
      expectStandardHeaders(res);
    }
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects duplicate params with different values", async () => {
    const url = new URL("http://localhost/api/v1/catalog/menu-items");
    url.searchParams.append("limit", "10");
    url.searchParams.append("limit", "20");

    const res = await GET(makeRequestFromUrl(url));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects unknown keys without calling the service", async () => {
    const res = await GET(makeRequest({ outletId: "outlet-1", bogus: "1" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.message).toContain("bogus");
    expectStandardHeaders(res);
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects missing outletId with field details and no service call", async () => {
    const res = await GET(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.details).toBeDefined();
    expect(body.requestId).toBe(res.headers.get("X-Request-Id"));
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects out-of-bounds limits", async () => {
    for (const limit of ["0", "101", "abc"]) {
      const res = await GET(makeRequest({ outletId: "outlet-1", limit }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_INPUT");
      expect(body.details).toBeDefined();
    }
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects an invalid filter value", async () => {
    const res = await GET(makeRequest({ outletId: "outlet-1", filter: "bogus" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("rejects search beyond 120 characters", async () => {
    const res = await GET(
      makeRequest({ outletId: "outlet-1", search: "a".repeat(121) })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(mockedService).not.toHaveBeenCalled();
  });

  it("maps service UNAUTHENTICATED to 401 with headers and requestId", async () => {
    mockedService.mockRejectedValue(new OrderDomainError("UNAUTHENTICATED"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.message).toBe("Sesi Anda tidak valid. Silakan masuk kembali.");
    expect(body.details).toBeNull();
    expectStandardHeaders(res);
    expect(body.requestId).toBe(res.headers.get("X-Request-Id"));
  });

  it("maps service OUTLET_ACCESS_DENIED to 403 with headers", async () => {
    mockedService.mockRejectedValue(new OrderDomainError("OUTLET_ACCESS_DENIED"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("OUTLET_ACCESS_DENIED");
    expectStandardHeaders(res);
    expect(body.requestId).toBe(res.headers.get("X-Request-Id"));
  });

  it("maps service INVALID_INPUT to 400", async () => {
    mockedService.mockRejectedValue(new OrderDomainError("INVALID_INPUT"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.message).toBe("Data yang dikirim tidak valid.");
    expectStandardHeaders(res);
  });

  it("maps service INTERNAL_ERROR to 500 with a generic message", async () => {
    mockedService.mockRejectedValue(new OrderDomainError("INTERNAL_ERROR"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Terjadi kesalahan. Silakan coba lagi.");
    expectStandardHeaders(res);
  });

  it("sanitizes unexpected exceptions into a generic 500 without leaking details", async () => {
    mockedService.mockRejectedValue(new Error("connect ECONNREFUSED at secret-host"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Terjadi kesalahan. Silakan coba lagi.");
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("secret-host");
    expect(raw).not.toContain("stack");
    expectStandardHeaders(res);
    expect(body.requestId).toBe(res.headers.get("X-Request-Id"));
  });

  it("rejects a malformed cursor with 400 via the service contract", async () => {
    mockedService.mockRejectedValue(new OrderDomainError("INVALID_INPUT"));

    const res = await GET(makeRequest({ outletId: "outlet-1", cursor: "not-base64!" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expectStandardHeaders(res);
  });
});

describe("GET /api/v1/catalog/menu-items - integrated service proof (real service, context/db mocked)", () => {
  beforeEach(() => {
    mockedService.mockImplementation(actualService.listMenuItemsPaginated);
    mockedContext.mockResolvedValue(contextResult);
    mockedFindMany.mockResolvedValue([]);
  });

  it("maps a malformed cursor to 400 before authorization and before any Prisma query", async () => {
    const res = await GET(makeRequest({ outletId: "outlet-1", cursor: "not-base64!" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expectStandardHeaders(res);
    expect(mockedContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("maps a cursor binding mismatch to 400 before authorization and before any Prisma query", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        v: 1,
        categoryId: "cat-1",
        sortOrder: 0,
        name: "Nasi Goreng",
        id: "item-1",
        outletId: "other-outlet",
        filter: "all",
        search: undefined,
      })
    ).toString("base64url");

    const res = await GET(makeRequest({ outletId: "outlet-1", cursor }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expectStandardHeaders(res);
    expect(mockedContext).not.toHaveBeenCalled();
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("maps UNAUTHENTICATED to 401 and never reaches the Prisma query", async () => {
    mockedContext.mockRejectedValue(new OrderDomainError("UNAUTHENTICATED"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("maps OUTLET_ACCESS_DENIED to 403 and never reaches the Prisma query", async () => {
    mockedContext.mockRejectedValue(new OrderDomainError("OUTLET_ACCESS_DENIED"));

    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedFindMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the real service envelope when authorized", async () => {
    const res = await GET(makeRequest({ outletId: "outlet-1" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [], nextCursor: null, hasMore: false });
    expect(mockedContext).toHaveBeenCalledWith("outlet-1", "menu.view");
    expect(mockedFindMany).toHaveBeenCalledTimes(1);
    expectStandardHeaders(res);
  });
});
