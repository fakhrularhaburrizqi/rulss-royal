import { describe, expect, it } from "vitest";

import {
  buildHrefWithOutlet,
  buildHrefWithOutletPreserving,
  getActiveOutletFromParams,
  isActiveRoute,
  NAV_ITEMS,
} from "@/lib/dashboard/navigation";

describe("lib/dashboard/navigation", () => {
  describe("buildHrefWithOutlet", () => {
    it("returns base href when outletId is undefined", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori")).toBe("/dashboard/kategori");
      expect(buildHrefWithOutlet("/dashboard/menu")).toBe("/dashboard/menu");
    });

    it("returns base href when outletId is empty string", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori", "")).toBe("/dashboard/kategori");
    });

    it("appends outlet as query parameter", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori", "outlet-123")).toBe(
        "/dashboard/kategori?outlet=outlet-123"
      );
    });

    it("encodes special characters in outletId", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori", "outlet with spaces")).toBe(
        "/dashboard/kategori?outlet=outlet+with+spaces"
      );
    });

    it("replaces existing outlet parameter", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori?outlet=old", "new")).toBe(
        "/dashboard/kategori?outlet=new"
      );
    });

    it("preserves other query parameters", () => {
      expect(buildHrefWithOutlet("/dashboard/kategori?foo=bar", "outlet-1")).toBe(
        "/dashboard/kategori?foo=bar&outlet=outlet-1"
      );
    });
  });

  describe("buildHrefWithOutletPreserving", () => {
    it("preserves non-outlet params and sets outlet", () => {
      const result = buildHrefWithOutletPreserving("/dashboard/kategori", "outlet-1", { page: "2", sort: "name" });
      expect(result).toContain("/dashboard/kategori?");
      expect(result).toContain("page=2");
      expect(result).toContain("sort=name");
      expect(result).toContain("outlet=outlet-1");
    });

    it("replaces existing outlet param from existingParams", () => {
      const result = buildHrefWithOutletPreserving("/dashboard/kategori", "new", { outlet: "old", page: "2" });
      expect(result).toContain("/dashboard/kategori?");
      expect(result).toContain("page=2");
      expect(result).toContain("outlet=new");
      expect(result).not.toContain("outlet=old");
    });

    it("does not add empty outlet", () => {
      expect(
        buildHrefWithOutletPreserving("/dashboard/kategori", "", { page: "2" })
      ).toBe("/dashboard/kategori?page=2");
    });
  });

  describe("getActiveOutletFromParams", () => {
    it("returns null for undefined outlet", () => {
      expect(getActiveOutletFromParams({})).toBeNull();
    });

    it("returns null for empty string outlet", () => {
      expect(getActiveOutletFromParams({ outlet: "" })).toBeNull();
    });

    it("returns null for whitespace-only outlet", () => {
      expect(getActiveOutletFromParams({ outlet: "   " })).toBeNull();
    });

    it("returns null for array outlet", () => {
      expect(getActiveOutletFromParams({ outlet: ["outlet-1", "outlet-2"] })).toBeNull();
    });

    it("returns trimmed outlet ID", () => {
      expect(getActiveOutletFromParams({ outlet: "  outlet-123  " })).toBe("outlet-123");
    });

    it("returns outlet ID from string", () => {
      expect(getActiveOutletFromParams({ outlet: "outlet-abc" })).toBe("outlet-abc");
    });
  });

  describe("isActiveRoute", () => {
    it("matches exact for dashboard root", () => {
      expect(isActiveRoute("/dashboard", "/dashboard", true)).toBe(true);
      expect(isActiveRoute("/dashboard", "/dashboard", false)).toBe(true);
      expect(isActiveRoute("/dashboard/", "/dashboard", false)).toBe(false);
      expect(isActiveRoute("/dashboard/kategori", "/dashboard", false)).toBe(false);
    });

    it("matches exact for other routes when exact=true", () => {
      expect(isActiveRoute("/dashboard/kategori", "/dashboard/kategori", true)).toBe(true);
      expect(isActiveRoute("/dashboard/kategori/123", "/dashboard/kategori", true)).toBe(false);
    });

    it("matches prefix for child routes when exact=false", () => {
      expect(isActiveRoute("/dashboard/kategori", "/dashboard/kategori", false)).toBe(true);
      expect(isActiveRoute("/dashboard/kategori/123", "/dashboard/kategori", false)).toBe(true);
      expect(isActiveRoute("/dashboard/kategori/123/edit", "/dashboard/kategori", false)).toBe(true);
    });

    it("does not match similar prefix", () => {
      expect(isActiveRoute("/dashboard/kategori-lain", "/dashboard/kategori", false)).toBe(false);
      expect(isActiveRoute("/dashboard/menu", "/dashboard/kategori", false)).toBe(false);
    });

    it("does not match when current path is shorter", () => {
      expect(isActiveRoute("/dashboard", "/dashboard/kategori", false)).toBe(false);
    });
  });

  describe("NAV_ITEMS", () => {
    it("contains exactly 4 items", () => {
      expect(NAV_ITEMS).toHaveLength(4);
    });

    it("first item is Dashboard with no required permission", () => {
      expect(NAV_ITEMS[0]).toEqual({
        href: "/dashboard",
        label: "Dashboard",
        requiredPermission: undefined,
        isAvailable: true,
      });
    });

    it("Kategori requires canViewCatalog", () => {
      expect(NAV_ITEMS[1]).toEqual({
        href: "/dashboard/kategori",
        label: "Kategori",
        requiredPermission: "canViewCatalog",
        isAvailable: false,
      });
    });

    it("Menu requires canViewCatalog", () => {
      expect(NAV_ITEMS[2]).toEqual({
        href: "/dashboard/menu",
        label: "Menu",
        requiredPermission: "canViewCatalog",
        isAvailable: false,
      });
    });

    it("Meja requires canViewTables", () => {
      expect(NAV_ITEMS[3]).toEqual({
        href: "/dashboard/meja",
        label: "Meja",
        requiredPermission: "canViewTables",
        isAvailable: false,
      });
    });
  });

  describe("input immutability", () => {
    it("buildHrefWithOutlet does not mutate input params object", () => {
      const params = { foo: "bar" };
      buildHrefWithOutlet("/dashboard/kategori", "outlet-1");
      expect(params).toEqual({ foo: "bar" });
    });

    it("buildHrefWithOutletPreserving does not mutate existingParams", () => {
      const existingParams = { page: "2", sort: "name" };
      buildHrefWithOutletPreserving("/dashboard/kategori", "outlet-1", existingParams);
      expect(existingParams).toEqual({ page: "2", sort: "name" });
    });

    it("getActiveOutletFromParams does not mutate input", () => {
      const params = { outlet: "  outlet-1  " };
      getActiveOutletFromParams(params);
      expect(params).toEqual({ outlet: "  outlet-1  " });
    });
  });
});