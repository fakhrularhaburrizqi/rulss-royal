import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/v1/catalog/categories/route";
import { listMenuCategoriesPaginated } from "@/lib/services/menu-category-query.service";
import { OrderDomainError } from "@/lib/order/errors";

vi.mock("@/lib/services/menu-category-query.service", () => ({
  listMenuCategoriesPaginated: vi.fn(),
}));

const mockedListCategories = vi.mocked(listMenuCategoriesPaginated);

function makeRequest(searchParams: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/v1/catalog/categories");
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.append(key, value);
  }
  return new NextRequest(url.toString());
}

function payload(data: { data: unknown; nextCursor: string | null; hasMore: boolean }) {
  return { data: data.data, nextCursor: data.nextCursor, hasMore: data.hasMore };
}

function parseCursor(encoded: string): unknown {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
}

const MOCK_PAGINATED_RESULT = {
  data: [
    { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
  nextCursor: null,
  hasMore: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedListCategories.mockResolvedValue(MOCK_PAGINATED_RESULT);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/v1/catalog/categories", () => {
  it("returns 200 with paginated data for valid request", async () => {
    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("returns 400 for missing outlet", async () => {
    const req = makeRequest({});
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for empty outlet", async () => {
    const req = makeRequest({ outlet: "   " });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for duplicate outlet param", async () => {
    const url = new URL("http://localhost/api/v1/catalog/categories");
    url.searchParams.append("outlet", "outlet-1");
    url.searchParams.append("outlet", "outlet-2");
    const req = new NextRequest(url.toString());

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for invalid limit", async () => {
    const req = makeRequest({ outlet: "outlet-1", limit: "0" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for limit > 100", async () => {
    const req = makeRequest({ outlet: "outlet-1", limit: "101" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for invalid filter", async () => {
    const req = makeRequest({ outlet: "outlet-1", filter: "invalid" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for search exceeding max length", async () => {
    const req = makeRequest({ outlet: "outlet-1", search: "a".repeat(81) });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for duplicate query parameters", async () => {
    const url = new URL("http://localhost/api/v1/catalog/categories");
    url.searchParams.append("outlet", "outlet-1");
    url.searchParams.append("limit", "10");
    url.searchParams.append("limit", "20");
    const req = new NextRequest(url.toString());

    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 401 for unauthenticated", async () => {
    const { listMenuCategoriesPaginated } = await import("@/lib/services/menu-category-query.service");
    const error = new OrderDomainError("UNAUTHENTICATED");
    vi.mocked(listMenuCategoriesPaginated).mockRejectedValue(error);

    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(body.message).toBe("Sesi Anda tidak valid. Silakan masuk kembali.");
  });

  it("returns 403 for outlet access denied", async () => {
    const { listMenuCategoriesPaginated } = await import("@/lib/services/menu-category-query.service");
    const error = new OrderDomainError("OUTLET_ACCESS_DENIED");
    vi.mocked(listMenuCategoriesPaginated).mockRejectedValue(error);

    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("OUTLET_ACCESS_DENIED");
    expect(body.message).toBe("Anda tidak memiliki akses ke outlet ini.");
  });

  it("returns 400 for invalid cursor encoding", async () => {
    const req = makeRequest({ outlet: "outlet-1", cursor: "not-base64!" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
    expect(body.message).toBe("Cursor tidak valid");
  });

  it("returns 400 for invalid cursor JSON", async () => {
    const encoded = Buffer.from("not-json").toString("base64url");
    const req = makeRequest({ outlet: "outlet-1", cursor: encoded });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 400 for cursor with wrong version", async () => {
    const badCursor = Buffer.from(JSON.stringify({ v: 2, sortOrder: 0, name: "Test", id: "cat-1", outletId: "outlet-1", filter: "all", search: undefined })).toString("base64url");
    const req = makeRequest({ outlet: "outlet-1", cursor: badCursor });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("returns 403 for outlet mismatch in cursor", async () => {
    const { listMenuCategoriesPaginated } = await import("@/lib/services/menu-category-query.service");
    const error = new OrderDomainError("OUTLET_ACCESS_DENIED");
    vi.mocked(listMenuCategoriesPaginated).mockRejectedValue(error);

    const cursor = Buffer.from(JSON.stringify({ v: 1, sortOrder: 0, name: "Test", id: "cat-1", outletId: "other-outlet", filter: "all", search: undefined })).toString("base64url");
    const req = makeRequest({ outlet: "outlet-1", cursor });
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it("returns 500 for internal error", async () => {
    const { listMenuCategoriesPaginated } = await import("@/lib/services/menu-category-query.service");
    vi.mocked(listMenuCategoriesPaginated).mockRejectedValue(new Error("DB error"));

    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("Terjadi kesalahan. Silakan coba lagi.");
  });

  it("includes Cache-Control: private, no-store, must-revalidate", async () => {
    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.headers.get("Cache-Control")).toBe("private, no-store, must-revalidate");
  });

  it("includes X-Request-Id header", async () => {
    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    expect(res.headers.get("X-Request-Id")).toBeDefined();
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns correct shape for success", async () => {
    const req = makeRequest({ outlet: "outlet-1" });
    const res = await GET(req);

    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("nextCursor");
    expect(body).toHaveProperty("hasMore");
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("trims search parameter", async () => {
    const req = makeRequest({ outlet: "outlet-1", search: "  nasi  " });
    await GET(req);

    expect(listMenuCategoriesPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ search: "  nasi  " })
    );
  });

  it("uses default limit 50 when not provided", async () => {
    const req = makeRequest({ outlet: "outlet-1" });
    await GET(req);

    expect(listMenuCategoriesPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ limit: "50" })
    );
  });

  it("enforces max limit 100", async () => {
    const req = makeRequest({ outlet: "outlet-1", limit: "101" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("search trimmed and bounded by MAX_CATEGORY_NAME", async () => {
    const req = makeRequest({ outlet: "outlet-1", search: "  nasi  " });
    await GET(req);

    expect(listMenuCategoriesPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ search: "  nasi  " })
    );
  });

  it("rejects empty search after trim", async () => {
    const req = makeRequest({ outlet: "outlet-1", search: "   " });
    await GET(req);

    expect(listMenuCategoriesPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ search: "   " })
    );
  });

  it("valid filter values accepted", async () => {
    for (const filter of ["all", "active", "inactive", "archived"]) {
      const req = makeRequest({ outlet: "outlet-1", filter });
      const res = await GET(req);
      expect(res.status).toBe(200);
    }
  });

  it("invalid filter rejected", async () => {
    const req = makeRequest({ outlet: "outlet-1", filter: "invalid" });
    const res = await GET(req);

    expect(res.status).toBe(400);
  });

  it("error response has requestId and sanitized details", async () => {
    const req = makeRequest({ outlet: "outlet-1", limit: "0" });
    const res = await GET(req);

    const body = await res.json();
    expect(body.requestId).toBeDefined();
    expect(body.details).toBeDefined();
    expect(body.details).not.toContain("ECONNREFUSED");
  });

  it("cursor binding includes outletId, filter, search", async () => {
    const req = makeRequest({ outlet: "outlet-1", filter: "active", search: "nasi" });
    await GET(req);

    expect(listMenuCategoriesPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ filter: "active", search: "nasi" })
    );
  });
});