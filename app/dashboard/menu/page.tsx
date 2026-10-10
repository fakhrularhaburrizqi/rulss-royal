import React from "react";
import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listMenuItemsPaginated } from "@/lib/services/menu-item-query.service";
import { DashboardShell } from "../components/DashboardShell";
import { MenuListPage } from "./MenuListPage";

export default async function MenuPage({
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

  if (resolution.kind !== "selected" || !resolution.capabilities.canViewCatalog) {
    return (
      <DashboardShell
        resolution={resolution}
        tenantName={tenant.name}
        tenantCode={tenant.code}
        userName={user.name}
        currentPath="/dashboard/menu"
      >
        <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-950">Menu</h2>
          <p className="mt-2 text-sm text-emerald-700">
            {resolution.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk melihat menu."
              : "Anda tidak memiliki izin untuk melihat menu di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let initialData;
  try {
    initialData = await listMenuItemsPaginated({
      outletId: resolution.outlet.id,
      limit: 50,
      filter: "all",
      search: undefined,
      cursor: undefined,
    });
  } catch {
    initialData = undefined;
  }
  const initialDataUpdatedAt = Date.now();

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant.name}
      tenantCode={tenant.code}
      userName={user.name}
      currentPath="/dashboard/menu"
    >
      <MenuListPage
        authScope={{ tenantId: tenant.id, userId: user.id }}
        outletId={resolution.outlet.id}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
      />
    </DashboardShell>
  );
}
