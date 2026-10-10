import { describe, it, expect } from "vitest";
import {
  INITIAL_MENU_ITEM_LIMIT,
  canReuseMenuPlaceholder,
  menuItemKeys,
  initialMenuItemListKey,
  isInitialMenuItemScope,
  type MenuItemAuthScope,
  type MenuItemQueryParams,
} from "@/lib/dashboard/menu-item-query-keys";

describe("menu-item-query-keys", () => {
  const authScope: MenuItemAuthScope = { tenantId: "tenant-1", userId: "user-1" };
  const outletId = "outlet-1";

  describe("menuItemKeys factory", () => {
    it("returns stable base keys", () => {
      expect(menuItemKeys().all).toEqual(["menu-items"]);
      expect(menuItemKeys().lists()).toEqual(["menu-items", "list"]);
    });

    it("generates list key with all params", () => {
      const key = menuItemKeys().list(authScope, {
        outletId,
        filter: "active",
        search: "nasi",
        limit: 50,
        cursor: "cursor-123",
      });

      expect(key).toEqual([
        "menu-items",
        "list",
        { authScope, outletId, filter: "active", search: "nasi", limit: 50, cursor: "cursor-123" },
      ]);
    });

    it("normalizes empty search to undefined", () => {
      const key = menuItemKeys().list(authScope, {
        outletId,
        filter: "all",
        search: "  ",
        limit: 50,
        cursor: undefined,
      });

      expect(key[2].search).toBeUndefined();
    });

    it("includes auth scope in key for cache isolation", () => {
      const key1 = menuItemKeys().list({ tenantId: "t1", userId: "u1" }, { outletId, filter: "all", search: undefined, limit: 50, cursor: undefined });
      const key2 = menuItemKeys().list({ tenantId: "t2", userId: "u2" }, { outletId, filter: "all", search: undefined, limit: 50, cursor: undefined });

      expect(key1).not.toEqual(key2);
    });
  });

  describe("initialMenuItemListKey", () => {
    it("matches factory list key with defaults", () => {
      const key = initialMenuItemListKey(authScope, outletId);

      expect(key).toEqual([
        "menu-items",
        "list",
        { authScope, outletId, filter: "all", search: undefined, limit: 50, cursor: undefined },
      ]);
    });

    it("accepts custom filter, search, limit, cursor", () => {
      const key = initialMenuItemListKey(authScope, outletId, "active", "nasi", 25, "cursor-abc");

      expect(key[2].filter).toBe("active");
      expect(key[2].search).toBe("nasi");
      expect(key[2].limit).toBe(25);
      expect(key[2].cursor).toBe("cursor-abc");
    });

    it("trims search in initial key", () => {
      const key = initialMenuItemListKey(authScope, outletId, "all", "  nasi  ");

      expect(key[2].search).toBe("nasi");
    });
  });

  describe("isInitialMenuItemScope", () => {
    it("matches the server-provided initial scope", () => {
      expect(INITIAL_MENU_ITEM_LIMIT).toBe(50);
      expect(isInitialMenuItemScope("all", undefined, 50, undefined)).toBe(true);
    });

    it("treats whitespace-only search as the initial scope", () => {
      expect(isInitialMenuItemScope("all", "   ", INITIAL_MENU_ITEM_LIMIT, undefined)).toBe(true);
    });

    it("rejects any other filter", () => {
      for (const filter of ["active", "inactive", "archived"] as const) {
        expect(isInitialMenuItemScope(filter, undefined, INITIAL_MENU_ITEM_LIMIT, undefined)).toBe(false);
      }
    });

    it("rejects a committed search", () => {
      expect(isInitialMenuItemScope("all", "nasi", INITIAL_MENU_ITEM_LIMIT, undefined)).toBe(false);
    });

    it("rejects a non-default limit", () => {
      expect(isInitialMenuItemScope("all", undefined, 25, undefined)).toBe(false);
    });

    it("rejects a cursor", () => {
      expect(isInitialMenuItemScope("all", undefined, INITIAL_MENU_ITEM_LIMIT, "cursor-1")).toBe(false);
    });
  });

  describe("canReuseMenuPlaceholder", () => {
    const params = (overrides: Partial<MenuItemQueryParams> = {}): MenuItemQueryParams => ({
      outletId,
      filter: "all",
      search: undefined,
      limit: INITIAL_MENU_ITEM_LIMIT,
      cursor: undefined,
      ...overrides,
    });
    const keyFor = (scope: MenuItemAuthScope, p: MenuItemQueryParams) =>
      menuItemKeys().list(scope, p) as ReadonlyArray<unknown>;

    it("reuses when only the cursor differs", () => {
      const previousKey = keyFor(authScope, params());
      const next = params({ cursor: "cursor-2" });

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: next })).toBe(true);
    });

    it("rejects a different filter", () => {
      const previousKey = keyFor(authScope, params({ filter: "active" }));

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different search", () => {
      const previousKey = keyFor(authScope, params({ search: "nasi" }));

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different auth scope", () => {
      const previousKey = keyFor({ tenantId: "other-tenant", userId: "user-1" }, params());

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different outlet", () => {
      const previousKey = keyFor(authScope, params({ outletId: "outlet-2" }));

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a different limit", () => {
      const previousKey = keyFor(authScope, params({ limit: 25 }));

      expect(canReuseMenuPlaceholder(previousKey, { authScope, params: params() })).toBe(false);
    });

    it("rejects a non menu list key", () => {
      expect(canReuseMenuPlaceholder(["menu-items"], { authScope, params: params() })).toBe(false);
      expect(canReuseMenuPlaceholder(["posts", "list", {}], { authScope, params: params() })).toBe(false);
      expect(canReuseMenuPlaceholder(["menu-items", "detail", {}], { authScope, params: params() })).toBe(false);
      expect(canReuseMenuPlaceholder(["categories", "list", {}], { authScope, params: params() })).toBe(false);
    });

    it("rejects a malformed params object", () => {
      expect(
        canReuseMenuPlaceholder(["menu-items", "list", { authScope: null }], { authScope, params: params() })
      ).toBe(false);
      expect(
        canReuseMenuPlaceholder(["menu-items", "list", { authScope, limit: "50" }], {
          authScope,
          params: params(),
        })
      ).toBe(false);
    });
  });
});
