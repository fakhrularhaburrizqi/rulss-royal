import { describe, it, expect } from "vitest";
import {
  INITIAL_CATEGORY_LIMIT,
  canReuseCategoryPlaceholder,
  categoryKeys,
  initialCategoryListKey,
  isInitialCategoryScope,
  type CategoryAuthScope,
  type CategoryQueryParams,
} from "@/lib/dashboard/category-query-keys";

describe("category-query-keys", () => {
  const authScope: CategoryAuthScope = { tenantId: "tenant-1", userId: "user-1" };
  const outletId = "outlet-1";

  describe("categoryKeys factory", () => {
    it("returns stable base keys", () => {
      expect(categoryKeys().all).toEqual(["categories"]);
      expect(categoryKeys().lists()).toEqual(["categories", "list"]);
    });

    it("generates list key with all params", () => {
      const key = categoryKeys().list(authScope, {
        outletId,
        filter: "active",
        search: "nasi",
        limit: 50,
        cursor: "cursor-123",
      });

      expect(key).toEqual([
        "categories",
        "list",
        { authScope, outletId, filter: "active", search: "nasi", limit: 50, cursor: "cursor-123" },
      ]);
    });

    it("normalizes empty search to undefined", () => {
      const key = categoryKeys().list(authScope, {
        outletId,
        filter: "all",
        search: "  ",
        limit: 50,
        cursor: undefined,
      });

      expect(key[2].search).toBeUndefined();
    });

    it("includes auth scope in key for cache isolation", () => {
      const key1 = categoryKeys().list({ tenantId: "t1", userId: "u1" }, { outletId, filter: "all", search: undefined, limit: 50, cursor: undefined });
      const key2 = categoryKeys().list({ tenantId: "t2", userId: "u2" }, { outletId, filter: "all", search: undefined, limit: 50, cursor: undefined });

      expect(key1).not.toEqual(key2);
    });
  });

  describe("initialCategoryListKey", () => {
    it("matches factory list key with defaults", () => {
      const key = initialCategoryListKey(authScope, outletId);

      expect(key).toEqual([
        "categories",
        "list",
        { authScope, outletId, filter: "all", search: undefined, limit: 50, cursor: undefined },
      ]);
    });

    it("accepts custom filter, search, limit, cursor", () => {
      const key = initialCategoryListKey(authScope, outletId, "active", "nasi", 25, "cursor-abc");

      expect(key[2].filter).toBe("active");
      expect(key[2].search).toBe("nasi");
      expect(key[2].limit).toBe(25);
      expect(key[2].cursor).toBe("cursor-abc");
    });

    it("trims search in initial key", () => {
      const key = initialCategoryListKey(authScope, outletId, "all", "  nasi  ");

      expect(key[2].search).toBe("nasi");
    });
  });

  describe("isInitialCategoryScope", () => {
    it("matches the server-provided initial scope", () => {
      expect(INITIAL_CATEGORY_LIMIT).toBe(50);
      expect(isInitialCategoryScope("all", undefined, 50, undefined)).toBe(true);
    });

    it("treats whitespace-only search as the initial scope", () => {
      expect(isInitialCategoryScope("all", "   ", INITIAL_CATEGORY_LIMIT, undefined)).toBe(true);
    });

    it("rejects any other filter", () => {
      for (const filter of ["active", "inactive", "archived"] as const) {
        expect(isInitialCategoryScope(filter, undefined, INITIAL_CATEGORY_LIMIT, undefined)).toBe(false);
      }
    });

    it("rejects a committed search", () => {
      expect(isInitialCategoryScope("all", "nasi", INITIAL_CATEGORY_LIMIT, undefined)).toBe(false);
    });

    it("rejects a non-default limit", () => {
      expect(isInitialCategoryScope("all", undefined, 25, undefined)).toBe(false);
    });

    it("rejects a cursor", () => {
      expect(isInitialCategoryScope("all", undefined, INITIAL_CATEGORY_LIMIT, "cursor-1")).toBe(false);
    });
  });

  describe("canReuseCategoryPlaceholder", () => {
    const params = (overrides: Partial<CategoryQueryParams> = {}): CategoryQueryParams => ({
      outletId,
      filter: "all",
      search: undefined,
      limit: INITIAL_CATEGORY_LIMIT,
      cursor: undefined,
      ...overrides,
    });
    const keyFor = (scope: CategoryAuthScope, p: CategoryQueryParams) =>
      categoryKeys().list(scope, p) as ReadonlyArray<unknown>;

    it("reuses when only the cursor differs", () => {
      const previousKey = keyFor(authScope, params());
      const next = params({ cursor: "cursor-2" });

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: next })).toBe(true);
    });

    it("rejects a different filter", () => {
      const previousKey = keyFor(authScope, params({ filter: "active" }));

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different search", () => {
      const previousKey = keyFor(authScope, params({ search: "nasi" }));

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different auth scope", () => {
      const previousKey = keyFor({ tenantId: "other-tenant", userId: "user-1" }, params());

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different outlet", () => {
      const previousKey = keyFor(authScope, params({ outletId: "outlet-2" }));

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different limit", () => {
      const previousKey = keyFor(authScope, params({ limit: 25 }));

      expect(canReuseCategoryPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a non category list key", () => {
      expect(canReuseCategoryPlaceholder(["categories"], { authScope, params: params() })).toBe(false);
      expect(canReuseCategoryPlaceholder(["posts", "list", {}], { authScope, params: params() })).toBe(false);
      expect(canReuseCategoryPlaceholder(["categories", "detail", {}], { authScope, params: params() })).toBe(false);
    });

    it("rejects a malformed params object", () => {
      expect(
        canReuseCategoryPlaceholder(["categories", "list", { authScope: null }], { authScope, params: params() })
      ).toBe(false);
      expect(
        canReuseCategoryPlaceholder(["categories", "list", { authScope, limit: "50" }], {
          authScope,
          params: params(),
        })
      ).toBe(false);
    });
  });
});