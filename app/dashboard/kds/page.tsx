import React from "react";
import { redirect } from "next/navigation";

import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listKdsOrdersForOutlet, type KdsOrder } from "@/lib/services/kds-query.service";
import { DashboardShell } from "../components/DashboardShell";
import { KdsBoard } from "./KdsBoard";

export default async function KdsPage({
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

  if (resolution?.kind !== "selected" || resolution?.capabilities?.canViewOrders !== true) {
    return (
      <DashboardShell
        resolution={resolution}
        tenantName={tenant?.name ?? "-"}
        tenantCode={tenant?.code ?? "-"}
        userName={user?.name ?? "-"}
        currentPath="/dashboard/kds"
        wide
      >
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-12 text-center">
          <h2 className="text-lg font-semibold text-zinc-200">KDS Dapur</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {resolution?.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk melihat antrean dapur."
              : "Anda tidak memiliki izin untuk melihat pesanan di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let initialOrders: KdsOrder[] = [];
  try {
    initialOrders = (await listKdsOrdersForOutlet(resolution.outlet?.id ?? "")) ?? [];
  } catch {
    initialOrders = [];
  }

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant?.name ?? "-"}
      tenantCode={tenant?.code ?? "-"}
      userName={user?.name ?? "-"}
      currentPath="/dashboard/kds"
      wide
    >
      <KdsBoard
        outletId={resolution.outlet?.id ?? ""}
        outletName={resolution.outlet?.name ?? "-"}
        initialOrders={initialOrders}
      />
    </DashboardShell>
  );
}
