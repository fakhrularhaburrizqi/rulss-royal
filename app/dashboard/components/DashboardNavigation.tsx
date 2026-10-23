"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DashboardContextResult } from "@/lib/dashboard/context";
import type { NavItem } from "@/lib/dashboard/navigation";
import { isActiveRoute } from "@/lib/dashboard/navigation";

type DashboardNavigationProps = {
  resolution: DashboardContextResult;
  currentPath?: string;
};

const READY_ROUTES = new Set(["/dashboard/kategori", "/dashboard/menu", "/dashboard/meja", "/dashboard/pesanan", "/dashboard/kasir"]);

export function DashboardNavigation({ resolution, currentPath }: DashboardNavigationProps) {
  const pathname = usePathname();
  const path = currentPath ?? pathname;

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", requiredPermission: undefined, isAvailable: true },
    { href: "/dashboard/kategori", label: "Kategori", requiredPermission: "canViewCatalog", isAvailable: false },
    { href: "/dashboard/menu", label: "Menu", requiredPermission: "canViewCatalog", isAvailable: false },
    { href: "/dashboard/meja", label: "Meja", requiredPermission: "canViewTables", isAvailable: false },
    { href: "/dashboard/pesanan", label: "Pesanan", requiredPermission: "canViewOrders", isAvailable: false },
    { href: "/dashboard/kasir", label: "Kasir", requiredPermission: "canViewOrders", isAvailable: false },
  ];

  const filteredItems = navItems.map((item) => {
    if (item.requiredPermission && resolution?.kind === "selected") {
      return { ...item, isAvailable: resolution?.capabilities?.[item.requiredPermission] === true };
    }
    return item;
  });

  return (
    <nav aria-label="Navigasi utama dashboard" className="mb-6">
      <ul className="flex flex-wrap gap-2" role="list">
        {filteredItems.map((item) => {
          const isActive = isActiveRoute(path, item.href, item.href === "/dashboard");

          // Only render if available (Dashboard always, others only when capability true)
          if (!item.isAvailable) {
            return null;
          }

          const isComingSoon = item.requiredPermission !== undefined && !READY_ROUTES.has(item.href);

          if (isComingSoon) {
            return (
              <li key={item.href}>
                <span
                  className="inline-flex items-center rounded-lg border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                  aria-disabled="true"
                >
                  {item.label}
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Segera tersedia
                  </span>
                </span>
              </li>
            );
          }

          const outletId = resolution?.kind === "selected" ? resolution?.outlet?.id : undefined;
          const href = outletId
            ? `${item.href}?outlet=${outletId}`
            : item.href;

          return (
            <li key={item.href}>
              <Link
                href={href}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                  isActive
                    ? "bg-emerald-700 text-white"
                    : "border border-emerald-900/10 bg-white text-emerald-900 hover:bg-emerald-50"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}