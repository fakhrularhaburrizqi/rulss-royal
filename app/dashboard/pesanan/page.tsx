import React from "react";
import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { requireActiveUser } from "@/lib/auth/authorization";
import { listOrdersForOutlet, type OrderListItem } from "@/lib/services/order-query.service";
import { DashboardShell } from "../components/DashboardShell";
import { OrderListPage } from "./OrderListPage";

export default async function PesananPage({
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
        currentPath="/dashboard/pesanan"
      >
        <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-emerald-950">Pesanan</h2>
          <p className="mt-2 text-sm text-emerald-700">
            {resolution.kind !== "selected"
              ? "Pilih outlet terlebih dahulu untuk melihat pesanan."
              : "Anda tidak memiliki izin untuk melihat pesanan di outlet ini."}
          </p>
        </div>
      </DashboardShell>
    );
  }

  let initialOrders: OrderListItem[] = [];
  try {
    initialOrders = await listOrdersForOutlet(resolution.outlet.id);
  } catch {
    initialOrders = [];
  }

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant.name}
      tenantCode={tenant.code}
      userName={user.name}
      currentPath="/dashboard/pesanan"
    >
      <OrderListPage
        outletId={resolution.outlet.id}
        initialOrders={initialOrders}
      />
    </DashboardShell>
  );
}
