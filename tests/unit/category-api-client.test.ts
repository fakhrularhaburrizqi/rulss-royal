import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { fetchCategories } from "@/lib/api/categories";

describe("category-api-client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("builds URL with required outlet param", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [], nextCursor: null, hasMore: false }),
    });

    await fetchCategories({ outlet: "outlet-1" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/catalog/categories?outlet=outlet-1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("includes optional params when provided", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [], nextCursor: null, hasMore: false }),
    });

    await fetchCategories({ outlet: "outlet-1", limit: 25, filter: "active", search: "nasi", cursor: "cursor-123" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/catalog/categories?outlet=outlet-1&limit=25&filter=active&search=nasi&cursor=cursor-123",
      expect.any(Object)
    );
  });

  it("omits empty search from URL", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [], nextCursor: null, hasMore: false }),
    });

    await fetchCategories({ outlet: "outlet-1", search: "" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/catalog/categories?outlet=outlet-1",
      expect.any(Object)
    );
  });

  it("passes AbortSignal to fetch", async () => {
    let capturedSignal: AbortSignal | null = null;
    (global.fetch as Mock).mockImplementation((_, opts) => {
      capturedSignal = opts?.signal ?? null;
      return Promise.resolve({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ data: [], nextCursor: null, hasMore: false }),
      });
    });

    const controller = new AbortController();
    await fetchCategories({ outlet: "outlet-1" }, controller.signal);

    expect(capturedSignal).toBe(controller.signal);
  });

  it("parses successful response with correct shape", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        data: [
          { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        nextCursor: "cursor-123",
        hasMore: true,
      }),
    });

    const result = await fetchCategories({ outlet: "outlet-1" });

    expect(result).toEqual({
      data: [
        { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      nextCursor: "cursor-123",
      hasMore: true,
    });
  });

  it("throws with code and status on HTTP error", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "OUTLET_ACCESS_DENIED", message: "Akses ditolak" }),
    });

    await expect(fetchCategories({ outlet: "outlet-1" })).rejects.toMatchObject({
      code: "OUTLET_ACCESS_DENIED",
      status: 403,
    });
  });

  it("throws on non-JSON error response", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "text/html" },
      text: async () => "<html>Server Error</html>",
    });

    await expect(fetchCategories({ outlet: "outlet-1" })).rejects.toMatchObject({
      status: 500,
    });
  });

  it("throws on malformed JSON response", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => "not an object",
    });

    await expect(fetchCategories({ outlet: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 500,
    });
  });

  it("throws on missing required fields in response", async () => {
    (global.fetch as Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [], nextCursor: null }), // missing hasMore
    });

    await expect(fetchCategories({ outlet: "outlet-1" })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 500,
    });
  });

  it("handles network abort gracefully", async () => {
    const controller = new AbortController();
    (global.fetch as Mock).mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });

    await expect(fetchCategories({ outlet: "outlet-1" }, controller.signal)).rejects.toThrow("Aborted");
  });
});