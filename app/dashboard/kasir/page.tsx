import React from "react";
import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listTablesForManagement, type DiningTableSummary } from "@/lib/services/dining-table.service";
import {
  listActiveCategories,
  listOrderableMenuItems,
  type ActiveMenuCategory,
  type OrderableMenuItem,
} from "@/lib/services/menu.service";
import { DashboardShell } from "../components/DashboardShell";
import { KasirDirectClient } from "./KasirDirectClient";

export default async function KasirPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let resolution;
  try {
    resolution = await resolveDashboardContext(searchParams);
  } catch {
    redirect("/login");
  }

  const { user, tenant } = await requireActiveUser();

  if (resolution.kind !== "selected" || !resolution.capabilities.canViewOrders) {
    return (
      <DashboardShell
        resolution={resolution}
        tenantName={tenant.name}
        tenantCode={tenant.code}
        userName={user.name}
        currentPath="/dashboard/kasir"
      >
        <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-950">Kasir</h2>
          <p className="mt-2 text-sm text-emerald-700">
            {resolution.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk menggunakan kasir."
              : "Anda tidak memiliki izin untuk membuat pesanan di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let tables: DiningTableSummary[] = [];
  let categories: ActiveMenuCategory[] = [];
  let menuItems: OrderableMenuItem[] = [];
  try {
    [tables, categories, menuItems] = await Promise.all([
      listTablesForManagement(resolution.outlet.id),
      listActiveCategories(resolution.outlet.id),
      listOrderableMenuItems(resolution.outlet.id),
    ]);
  } catch {
    tables = [];
    categories = [];
    menuItems = [];
  }

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant.name}
      tenantCode={tenant.code}
      userName={user.name}
      currentPath="/dashboard/kasir"
    >
      <KasirDirectClient
        outletId={resolution.outlet.id}
        tables={tables}
        categories={categories}
        menuItems={menuItems}
      />
    </DashboardShell>
  );
}
