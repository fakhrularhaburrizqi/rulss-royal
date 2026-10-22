export type NavItem = {
  href: string;
  label: string;
  requiredPermission?: "canViewCatalog" | "canViewTables" | "canViewOrders";
  isAvailable?: boolean;
};

export function buildHrefWithOutlet(baseHref: string, outletId?: string): string {
  if (!outletId) return baseHref;
  const url = new URL(baseHref, "http://localhost");
  url.searchParams.set("outlet", outletId);
  return url.pathname + url.search;
}

export function buildHrefWithOutletPreserving(baseHref: string, outletId?: string, existingParams?: Record<string, string>): string {
  const url = new URL(baseHref, "http://localhost");
  if (outletId) {
    url.searchParams.set("outlet", outletId);
  }
  if (existingParams) {
    for (const [key, value] of Object.entries(existingParams)) {
      if (key !== "outlet") {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.pathname + url.search;
}

export function getActiveOutletFromParams(params: Record<string, string | string[] | undefined>): string | null {
  const raw = params.outlet;
  if (Array.isArray(raw)) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

export function isActiveRoute(currentPath: string, href: string, exact = false): boolean {
  if (exact) {
    return currentPath === href;
  }
  if (href === "/dashboard") {
    return currentPath === "/dashboard";
  }
  return currentPath === href || currentPath.startsWith(href + "/");
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", requiredPermission: undefined, isAvailable: true },
  { href: "/dashboard/kategori", label: "Kategori", requiredPermission: "canViewCatalog", isAvailable: false },
  { href: "/dashboard/menu", label: "Menu", requiredPermission: "canViewCatalog", isAvailable: false },
  { href: "/dashboard/meja", label: "Meja", requiredPermission: "canViewTables", isAvailable: false },
];