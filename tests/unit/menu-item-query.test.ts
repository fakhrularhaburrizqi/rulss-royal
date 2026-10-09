import { describe, expect, it } from "vitest";

import { MAX_MENU_NAME } from "@/lib/order/constants";
import { menuItemListQuerySchema } from "@/lib/validators/menu-item-query";

describe("menuItemListQuerySchema", () => {
  it("accepts valid minimal input and applies defaults", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1" });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.outletId).toBe("outlet-1");
    expect(result.data.limit).toBe(50);
    expect(result.data.filter).toBe("all");
    expect(result.data.search).toBeUndefined();
    expect(result.data.cursor).toBeUndefined();
  });

  it("rejects missing outletId", () => {
    const result = menuItemListQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty outletId", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects non-string outletId", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: 42 });
    expect(result.success).toBe(false);
  });

  it("trims outletId", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "  outlet-1  " });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.outletId).toBe("outlet-1");
  });

  it("accepts valid limit bounds", () => {
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "1" }).success).toBe(true);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "100" }).success).toBe(true);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "0" }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "101" }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "abc" }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: "10.5" }).success).toBe(false);
  });

  it("accepts valid filter values", () => {
    for (const filter of ["all", "active", "inactive", "archived"]) {
      const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", filter });
      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected valid query");
      expect(result.data.filter).toBe(filter);
    }
  });

  it("rejects invalid filter", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", filter: "invalid" });
    expect(result.success).toBe(false);
  });

  it("trims search", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", search: "  nasi  " });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.search).toBe("nasi");
  });

  it("accepts search at the 120 character maximum", () => {
    const result = menuItemListQuerySchema.safeParse({
      outletId: "outlet-1",
      search: "a".repeat(MAX_MENU_NAME),
    });
    expect(result.success).toBe(true);
  });

  it("rejects search beyond the 120 character maximum", () => {
    const result = menuItemListQuerySchema.safeParse({
      outletId: "outlet-1",
      search: "a".repeat(MAX_MENU_NAME + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts blank search as undefined", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", search: "   " });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid query");
    expect(result.data.search).toBeUndefined();
  });

  it("accepts valid encoded cursor", () => {
    const payload = {
      v: 1 as const,
      categoryId: "cat-1",
      sortOrder: 0,
      name: "Nasi Goreng",
      id: "item-1",
      outletId: "outlet-1",
      filter: "all",
      search: undefined,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", cursor: encoded });
    expect(result.success).toBe(true);
  });

  it("rejects empty cursor", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", cursor: "" });
    expect(result.success).toBe(false);
  });

  it("rejects cursor beyond the encoded length bound", () => {
    const result = menuItemListQuerySchema.safeParse({
      outletId: "outlet-1",
      cursor: "a".repeat(513),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown params via strict object", () => {
    const result = menuItemListQuerySchema.safeParse({ outletId: "outlet-1", unknown: "x" });
    expect(result.success).toBe(false);
  });

  // Duplicate query params arrive from the route as arrays; the schema rejects
  // array values for string/enum fields (multi-element limit arrays coerce to NaN).
  // Single-element arrays are caught by route-level searchParams.getAll() checks.
  it("rejects duplicate params as array values", () => {
    expect(menuItemListQuerySchema.safeParse({ outletId: ["a", "b"] }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", filter: ["all", "active"] }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", search: ["a", "b"] }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", cursor: ["a", "b"] }).success).toBe(false);
    expect(menuItemListQuerySchema.safeParse({ outletId: "outlet-1", limit: [10, 20] }).success).toBe(false);
  });
});
