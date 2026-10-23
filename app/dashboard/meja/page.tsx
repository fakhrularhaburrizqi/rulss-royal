import React from "react";
import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listTablesForManagement } from "@/lib/services/dining-table.service";
import { DashboardShell } from "../components/DashboardShell";
import { DiningTableListPage } from "./DiningTableListPage";

export default async function DiningTablePage({
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

  if (resolution?.kind !== "selected" || resolution?.capabilities?.canViewTables !== true) {
    return (
      <DashboardShell
        resolution={resolution}
        tenantName={tenant?.name ?? "-"}
        tenantCode={tenant?.code ?? "-"}
        userName={user?.name ?? "-"}
        currentPath="/dashboard/meja"
      >
        <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-950">Meja</h2>
          <p className="mt-2 text-sm text-emerald-700">
            {resolution?.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk melihat meja."
              : "Anda tidak memiliki izin untuk melihat meja di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let initialData;
  try {
    initialData = await listTablesForManagement(resolution.outlet?.id ?? "");
  } catch {
    initialData = undefined;
  }
  const initialDataUpdatedAt = Date.now();

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant?.name ?? "-"}
      tenantCode={tenant?.code ?? "-"}
      userName={user?.name ?? "-"}
      currentPath="/dashboard/meja"
    >
      <DiningTableListPage
        authScope={{ tenantId: tenant?.id ?? "", userId: user?.id ?? "" }}
        outletId={resolution.outlet?.id ?? ""}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
        canManageTables={resolution?.capabilities?.canManageTables === true}
      />
    </DashboardShell>
  );
}
