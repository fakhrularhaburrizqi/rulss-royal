import { redirect } from "next/navigation";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { DashboardShell } from "./components/DashboardShell";
import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

async function getDashboardMetrics(tenantId: string, outletId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [completedToday, allToday, activeOrders] = await Promise.all([
    db.customerOrder.findMany({
      where: {
        tenantId,
        outletId,
        status: OrderStatus.COMPLETED,
        createdAt: { gte: startOfDay },
      },
      select: { total: true },
    }),
    db.customerOrder.count({
      where: {
        tenantId,
        outletId,
        createdAt: { gte: startOfDay },
      },
    }),
    db.customerOrder.count({
      where: {
        tenantId,
        outletId,
        status: {
          notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        },
      },
    }),
  ]);

  const revenueToday = completedToday.reduce((sum, order) => sum + order.total, 0);

  return {
    revenueToday,
    ordersToday: allToday,
    activeOrders,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let resolution;
  try {
    resolution = await resolveDashboardContext(searchParams);
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error;
    }
    redirect("/login");
  }

  const { user, tenant } = await (async () => {
    try {
      const { requireActiveUser } = await import("@/lib/auth/authorization");
      return await requireActiveUser();
    } catch {
      redirect("/login");
    }
  })();

  let metrics = { revenueToday: 0, ordersToday: 0, activeOrders: 0 };
  if (resolution.kind === "selected") {
    try {
      metrics = await getDashboardMetrics(tenant.id, resolution.outlet.id);
    } catch {
      // ignore metrics error if db fails temporarily
    }
  }

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant.name}
      tenantCode={tenant.code}
      userName={user.name}
      currentPath="/dashboard"
    >
      {(() => {
        switch (resolution.kind) {
          case "selected":
            return (
              <div className="space-y-6">
                <section aria-labelledby="metrics-heading">
                  <h2 id="metrics-heading" className="sr-only">
                    Metrik Statistik Hari Ini
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
                      <div className="text-sm font-medium text-emerald-700">Total Pendapatan Hari Ini</div>
                      <div className="mt-2 text-2xl font-bold text-emerald-950">
                        Rp{metrics.revenueToday.toLocaleString("id-ID")}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
                      <div className="text-sm font-medium text-emerald-700">Total Pesanan Hari Ini</div>
                      <div className="mt-2 text-2xl font-bold text-emerald-950">
                        {metrics.ordersToday}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
                      <div className="text-sm font-medium text-emerald-700">Pesanan Aktif / Diproses</div>
                      <div className="mt-2 text-2xl font-bold text-emerald-950">
                        {metrics.activeOrders}
                      </div>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="outlet-info-heading">
                  <h2 id="outlet-info-heading" className="sr-only">
                    Informasi outlet aktif
                  </h2>
                  <div className="rounded-lg border border-emerald-900/10 bg-white p-4">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-emerald-700">Outlet</dt>
                        <dd className="mt-1 text-sm font-semibold text-emerald-950">
                          {resolution.outlet.name} ({resolution.outlet.code})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-emerald-700">ID</dt>
                        <dd className="mt-1 text-sm font-mono text-emerald-900">
                          {resolution.outlet.id}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section aria-labelledby="capabilities-heading">
                  <h2 id="capabilities-heading" className="text-lg font-semibold text-emerald-950">
                    Akses Fitur
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2" role="list">
                    <li className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                      resolution.capabilities.canViewCatalog
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      Lihat Katalog {resolution.capabilities.canViewCatalog && "✓"}
                    </li>
                    <li className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                      resolution.capabilities.canManageCatalog
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      Kelola Katalog {resolution.capabilities.canManageCatalog && "✓"}
                    </li>
                    <li className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                      resolution.capabilities.canViewTables
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      Lihat Meja {resolution.capabilities.canViewTables && "✓"}
                    </li>
                    <li className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                      resolution.capabilities.canManageTables
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      Kelola Meja {resolution.capabilities.canManageTables && "✓"}
                    </li>
                  </ul>
                </section>

                <section aria-labelledby="outlets-heading">
                  <h2 id="outlets-heading" className="text-lg font-semibold text-emerald-950">
                    Outlet Tersedia ({resolution.outlets.length})
                  </h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
                    {resolution.outlets.map((outlet) => (
                      <li
                        key={outlet.id}
                        className={`rounded-lg border p-3 ${
                          outlet.id === resolution.outlet.id
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-emerald-900/10 bg-white hover:border-emerald-300"
                        }`}
                      >
                        <div className="font-semibold text-emerald-950">{outlet.name}</div>
                        <div className="text-sm text-emerald-700">{outlet.code}</div>
                        <div className="mt-1 text-xs font-mono text-emerald-500">{outlet.id}</div>
                        {outlet.id === resolution.outlet.id && (
                          <span className="mt-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Aktif
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            );

          case "selection-required":
            return (
              <div className="rounded-lg border border-emerald-900/10 bg-white p-6 text-center">
                <h2 className="text-lg font-semibold text-emerald-950">Pilih Outlet</h2>
                <p className="mt-2 text-sm text-emerald-700">
                  Anda memiliki akses ke beberapa outlet. Pilih outlet untuk mengelola katalog dan meja.
                </p>
                <p className="mt-1 text-xs text-emerald-500">
                  Outlet terpilih akan diteruskan ke halaman Kategori, Menu, dan Meja.
                </p>
              </div>
            );

          case "no-accessible-outlet":
            return (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <h2 className="text-lg font-semibold text-amber-900">Tidak Ada Outlet Akses</h2>
                <p className="mt-2 text-sm text-amber-800">
                  Akun Anda tidak memiliki akses ke outlet aktif manapun. Hubungi administrator.
                </p>
              </div>
            );

          case "invalid-or-denied":
            return (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                <h2 className="text-lg font-semibold text-red-900">Outlet Tidak Valid</h2>
                <p className="mt-2 text-sm text-red-800">
                  Outlet yang diminta tidak ditemukan atau akses ditolak.
                </p>
                {resolution.outlets.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="text-sm font-medium text-red-700">Pilih outlet yang tersedia:</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="list">
                      {resolution.outlets.map((outlet) => (
                        <li
                          key={outlet.id}
                          className="rounded-lg border border-red-200 bg-white p-3"
                        >
                          <div className="font-semibold text-red-900">{outlet.name}</div>
                          <div className="text-sm text-red-700">{outlet.code}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
        }
      })()}
    </DashboardShell>
  );
}