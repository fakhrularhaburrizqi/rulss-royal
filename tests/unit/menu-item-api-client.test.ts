import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fetchMenuItems } from "@/lib/api/menu-items";

const VALID_ITEM = {
  id: "item-2",
  categoryId: "cat-2",
  name: "Es Teh",
  description: null,
  price: 5000,
  imageUrl: null,
  imageAlt: null,
  sortOrder: 1,
  isActive: true,
  isSoldOut: true,
  deletedAt: null,
  updatedAt: "2026-03-10T08:30:00.000Z",
  category: {
    id: "cat-2",
    name: "Minuman Lama",
    isActive: false,
    deletedAt: null,
  },
};

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

function errorResponse(overrides: {
  status: number;
  contentType: string;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: false,
    status: overrides.status,
    headers: { get: () => overrides.contentType },
    json:
      overrides.json ??
      (async () => {
        throw new SyntaxError("Unexpected token");
      }),
  } as unknown as Response;
}

describe("menu-item-api-client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("builds the URL with the required outletId param", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [], nextCursor: null, hasMore: false })
    );

    await fetchMenuItems({ outletId: "outlet-1" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/catalog/menu-items?outletId=outlet-1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("includes optional params in contract order", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [], nextCursor: null, hasMore: false })
    );

    await fetchMenuItems({
      outletId: "outlet-1",
      limit: 25,
      filter: "active",
      search: "nasi",
      cursor: "cursor-123",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/catalog/menu-items?outletId=outlet-1&limit=25&filter=active&search=nasi&cursor=cursor-123",
      expect.any(Object)
    );
  });

  it("omits blank search and cursor instead of serializing them", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [], nextCursor: null, hasMore: false })
    );

    await fetchMenuItems({ outletId: "outlet-1", search: "", cursor: "" });

    const url = (global.fetch as Mock).mock.calls[0][0] as string;
    expect(url).toBe("/api/v1/catalog/menu-items?outletId=outlet-1");
    expect(url).not.toContain("undefined");
  });

  it("omits undefined optional params without literal 'undefined' in the URL", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [], nextCursor: null, hasMore: false })
    );

    await fetchMenuItems({ outletId: "outlet-1", search: undefined, cursor: undefined });

    const url = (global.fetch as Mock).mock.calls[0][0] as string;
    expect(url).toBe("/api/v1/catalog/menu-items?outletId=outlet-1");
    expect(url).not.toContain("undefined");
  });

  it("passes the AbortSignal through to fetch", async () => {
    let capturedSignal: AbortSignal | null = null;
    (global.fetch as Mock).mockImplementation((_, opts) => {
      capturedSignal = opts?.signal ?? null;
      return Promise.resolve(okResponse({ data: [], nextCursor: null, hasMore: false }));
    });

    const controller = new AbortController();
    await fetchMenuItems({ outletId: "outlet-1" }, controller.signal);

    expect(capturedSignal).toBe(controller.signal);
  });

  it("accepts a valid DTO including sold-out items and unavailable categories", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [VALID_ITEM], nextCursor: "next-1", hasMore: true })
    );

    const result = await fetchMenuItems({ outletId: "outlet-1" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].isSoldOut).toBe(true);
    expect(result.data[0].category.isActive).toBe(false);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("next-1");
  });

  it("rejects a payload missing envelope fields", async () => {
    (global.fetch as Mock).mockResolvedValue(okResponse({ data: [], nextCursor: null }));

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 500,
    });
  });

  it("rejects non-object 200 payloads", async () => {
    (global.fetch as Mock).mockResolvedValue(okResponse("not an object"));

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 500,
    });
  });

  it("rejects non-JSON 200 bodies", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 500,
    });
  });

  it("rejects non-integer price and sortOrder", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, price: 10.5 }], nextCursor: null, hasMore: false })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, sortOrder: 1.5 }], nextCursor: null, hasMore: false })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects non-boolean status flags", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, isActive: "true" }], nextCursor: null, hasMore: false })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects invalid date strings", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, updatedAt: "2026-03-10" }], nextCursor: null, hasMore: false })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, deletedAt: "not-a-date" }], nextCursor: null, hasMore: false })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects a missing or null nested category", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [{ ...VALID_ITEM, category: null }], nextCursor: null, hasMore: false })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    (global.fetch as Mock).mockResolvedValue(
      okResponse({
        data: [{ ...VALID_ITEM, category: { id: "cat-2", isActive: true, deletedAt: null } }],
        nextCursor: null,
        hasMore: false,
      })
    );
    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects categoryId and category.id mismatches", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({
        data: [{ ...VALID_ITEM, categoryId: "cat-1" }],
        nextCursor: null,
        hasMore: false,
      })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects hasMore true with a null nextCursor", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [VALID_ITEM], nextCursor: null, hasMore: true })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects hasMore false with a non-null nextCursor", async () => {
    (global.fetch as Mock).mockResolvedValue(
      okResponse({ data: [], nextCursor: "next-1", hasMore: false })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("throws typed code and status from a JSON HTTP error body", async () => {
    (global.fetch as Mock).mockResolvedValue(
      errorResponse({
        status: 403,
        contentType: "application/json",
        json: async () => ({ code: "OUTLET_ACCESS_DENIED", message: "Akses ditolak" }),
      })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "OUTLET_ACCESS_DENIED",
      status: 403,
      message: "Akses ditolak",
    });
  });

  it("falls back to safe defaults on a non-JSON HTTP error body", async () => {
    (global.fetch as Mock).mockResolvedValue(
      errorResponse({ status: 500, contentType: "text/html" })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      message: "Terjadi kesalahan. Silakan coba lagi.",
    });
  });

  it("falls back to safe defaults when the JSON HTTP error body is malformed", async () => {
    (global.fetch as Mock).mockResolvedValue(
      errorResponse({ status: 502, contentType: "application/json" })
    );

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("propagates AbortError unchanged instead of converting it", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    (global.fetch as Mock).mockRejectedValue(abortError);

    await expect(fetchMenuItems({ outletId: "outlet-1" })).rejects.toBe(abortError);
  });
});
