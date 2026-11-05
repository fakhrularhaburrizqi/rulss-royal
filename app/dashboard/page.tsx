import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { DashboardShell } from "./components/DashboardShell";
import { RevenueTrendChart } from "./components/RevenueTrendChart";
import {
  ANALYTICS_PERIOD_OPTIONS,
  getOutletAnalytics,
  parseAnalyticsPeriod,
  type OutletAnalytics,
} from "@/lib/dashboard/analytics";
import { formatRupiah } from "@/lib/utils/format-rupiah";
import { Check } from "lucide-react";

function MetricCard({
  label,
  value,
  detail,
  valueClassName = "text-2xl font-bold text-emerald-950",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
      <div className="text-sm font-medium text-emerald-700">{label}</div>
      <div className={`mt-2 ${valueClassName}`}>{value}</div>
      <div className="mt-auto pt-1 text-xs text-emerald-600">{detail}</div>
    </div>
  );
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

  const params = await searchParams;
  const period = parseAnalyticsPeriod(params.periode);

  let analytics: OutletAnalytics | null = null;
  if (resolution?.kind === "selected" && resolution.outlet?.id && tenant?.id) {
    try {
      analytics = await getOutletAnalytics(
        tenant.id,
        resolution.outlet.id,
        period
      );
    } catch {
      analytics = null;
    }
  }

  const outletId = resolution?.kind === "selected" ? resolution.outlet.id : "";
  const periodHref = (days: number) =>
    `/dashboard?periode=${days}${outletId ? `&outlet=${outletId}` : ""}`;
  const retryHref = periodHref(period);

  const topMenus = analytics?.topMenus ?? [];
  const topMenuMaxQuantity = topMenus[0]?.quantity ?? 0;

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant?.name ?? "-"}
      tenantCode={tenant?.code ?? "-"}
      userName={user?.name ?? "-"}
      currentPath="/dashboard"
    >
      {(() => {
        switch (resolution?.kind) {
          case "selected":
            return (
              <div className="space-y-6">
                <section aria-labelledby="metrics-heading">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2
                        id="metrics-heading"
                        className="text-lg font-semibold text-emerald-950"
                      >
                        Ringkasan Performa
                      </h2>
                      <p className="mt-1 text-sm text-emerald-700">
                        {analytics
                          ? `${analytics.periodStartLabel} - ${analytics.todayLabel}`
                          : `${period} hari terakhir`}
                      </p>
                    </div>
                    <nav
                      aria-label="Rentang waktu analitik"
                      className="flex gap-2"
                    >
                      {ANALYTICS_PERIOD_OPTIONS.map((days) => {
                        const isActive = period === days;
                        return (
                          <Link
                            key={days}
                            href={periodHref(days)}
                            aria-current={isActive ? "page" : undefined}
                            className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                              isActive
                                ? "bg-emerald-700 text-white"
                                : "border border-emerald-900/10 bg-white text-emerald-900 hover:bg-emerald-50"
                            }`}
                          >
                            {days} hari
                          </Link>
                        );
                      })}
                    </nav>
                  </div>

                  {analytics === null ? (
                    <div
                      role="alert"
                      className="mt-4 rounded-lg border border-red-200 bg-red-50 p-6 text-center"
                    >
                      <h3 className="text-lg font-semibold text-red-900">
                        Data Analitik Gagal Dimuat
                      </h3>
                      <p className="mt-2 text-sm text-red-800">
                        Terjadi gangguan saat mengambil data pesanan. Angka
                        analitik tidak ditampilkan agar tidak menyesatkan.
                      </p>
                      <Link
                        href={retryHref}
                        className="mt-4 inline-flex items-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                      >
                        Muat ulang
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard
                        label="Total Omzet"
                        value={formatRupiah(analytics.totalRevenue)}
                        detail={`Hari ini ${formatRupiah(analytics.revenueToday)}`}
                      />
                      <MetricCard
                        label="Total Pesanan"
                        value={String(analytics.totalOrders)}
                        detail={`Hari ini ${analytics.ordersToday} · ${analytics.activeOrders} sedang diproses`}
                      />
                      <MetricCard
                        label="Rata-rata Transaksi"
                        value={
                          analytics.completedOrders > 0
                            ? formatRupiah(analytics.averageTransaction)
                            : "-"
                        }
                        detail={
                          analytics.completedOrders > 0
                            ? `Dari ${analytics.completedOrders} pesanan selesai`
                            : "Belum ada pesanan selesai"
                        }
                      />
                      <MetricCard
                        label="Menu Terlaris #1"
                        value={analytics.topMenus[0]?.name ?? "-"}
                        detail={
                          analytics.topMenus[0]
                            ? `${analytics.topMenus[0].quantity} porsi · ${formatRupiah(analytics.topMenus[0].revenue)}`
                            : "Belum ada menu terjual"
                        }
                        valueClassName="text-xl font-bold break-words text-emerald-950"
                      />
                    </div>
                  )}
                </section>

                {analytics !== null && (
                  <section
                    aria-labelledby="trend-heading"
                    className="grid gap-4 lg:grid-cols-3"
                  >
                    <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm lg:col-span-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3
                          id="trend-heading"
                          className="text-base font-semibold text-emerald-950"
                        >
                          Tren Omzet Harian
                        </h3>
                        <p className="text-xs text-emerald-600">
                          Omzet pesanan selesai, dalam Rupiah
                        </p>
                      </div>

                      {analytics.totalOrders === 0 ? (
                        <div className="mt-4 rounded-lg border border-dashed border-emerald-900/15 bg-emerald-50/50 p-6 text-center">
                          <p className="text-sm font-medium text-emerald-900">
                            Belum ada pesanan pada periode ini
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">
                            Grafik akan muncul setelah ada transaksi yang
                            tercatat di outlet ini.
                          </p>
                        </div>
                      ) : (
                        <>
                          <RevenueTrendChart
                            data={analytics.trend}
                            ariaLabel={`Grafik tren omzet harian dari ${analytics.periodStartLabel} sampai ${analytics.todayLabel}, total ${formatRupiah(analytics.totalRevenue)}`}
                          />
                          <p className="mt-2 text-xs text-emerald-600">
                            Tanggal ditampilkan dalam WIB. Arahkan kursor atau
                            fokus ke grafik untuk melihat nominal per hari.
                          </p>
                        </>
                      )}
                    </div>

                    <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
                      <h3 className="text-base font-semibold text-emerald-950">
                        5 Menu Terlaris
                      </h3>
                      <p className="text-xs text-emerald-600">
                        Berdasarkan porsi terjual, pesanan selesai
                      </p>

                      {topMenus.length === 0 ? (
                        <div className="mt-4 rounded-lg border border-dashed border-emerald-900/15 bg-emerald-50/50 p-4 text-center">
                          <p className="text-sm font-medium text-emerald-900">
                            Belum ada menu terjual
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">
                            Peringkat muncul setelah ada pesanan selesai.
                          </p>
                        </div>
                      ) : (
                        <ol className="mt-4 space-y-4">
                          {topMenus.map((menu, index) => {
                            const share =
                              topMenuMaxQuantity > 0
                                ? Math.max(
                                    3,
                                    Math.round(
                                      (menu.quantity / topMenuMaxQuantity) * 100
                                    )
                                  )
                                : 0;
                            return (
                              <li
                                key={menu.menuItemId}
                                className="grid grid-cols-[1.25rem_1fr] gap-3"
                              >
                                <span className="pt-0.5 text-xs font-bold text-emerald-600">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-sm font-medium text-emerald-950">
                                      {menu.name}
                                    </span>
                                    <span className="flex-shrink-0 text-xs font-semibold text-emerald-700">
                                      {menu.quantity} porsi
                                    </span>
                                  </div>
                                  <div
                                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-50"
                                    aria-hidden="true"
                                  >
                                    <div
                                      className="h-full rounded-full bg-emerald-600"
                                      style={{ width: `${share}%` }}
                                    />
                                  </div>
                                  <div className="mt-1 text-xs text-emerald-600">
                                    {formatRupiah(menu.revenue)}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  </section>
                )}

                <section aria-labelledby="outlet-info-heading">
                  <h2 id="outlet-info-heading" className="sr-only">
                    Informasi outlet aktif
                  </h2>
                  <div className="rounded-lg border border-emerald-900/10 bg-white p-4">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm font-medium text-emerald-700">
                          Outlet
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-emerald-950">
                          {resolution?.outlet?.name ?? "-"} (
                          {resolution?.outlet?.code ?? "-"})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-emerald-700">
                          ID
                        </dt>
                        <dd className="mt-1 text-sm font-mono text-emerald-900">
                          {resolution?.outlet?.id ?? "-"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section aria-labelledby="capabilities-heading">
                  <h2
                    id="capabilities-heading"
                    className="text-lg font-semibold text-emerald-950"
                  >
                    Akses Fitur
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2" role="list">
                    {[
                      {
                        label: "Lihat Katalog",
                        allowed:
                          resolution?.capabilities?.canViewCatalog === true,
                      },
                      {
                        label: "Kelola Katalog",
                        allowed:
                          resolution?.capabilities?.canManageCatalog === true,
                      },
                      {
                        label: "Lihat Meja",
                        allowed:
                          resolution?.capabilities?.canViewTables === true,
                      },
                      {
                        label: "Kelola Meja",
                        allowed:
                          resolution?.capabilities?.canManageTables === true,
                      },
                    ].map((cap) => (
                      <li
                        key={cap.label}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                          cap.allowed
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {cap.label}{" "}
                        {cap.allowed && (
                          <Check className="ml-1.5 h-4 w-4 flex-shrink-0" />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>

                <section aria-labelledby="outlets-heading">
                  <h2
                    id="outlets-heading"
                    className="text-lg font-semibold text-emerald-950"
                  >
                    Outlet Tersedia ({resolution?.outlets?.length ?? 0})
                  </h2>
                  <ul
                    className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                    role="list"
                  >
                    {(resolution?.outlets ?? []).map((outlet) => (
                      <li
                        key={outlet?.id ?? outlet?.code ?? outlet?.name}
                        className={`rounded-lg border p-3 ${
                          outlet?.id === resolution?.outlet?.id
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-emerald-900/10 bg-white hover:border-emerald-300"
                        }`}
                      >
                        <div className="font-semibold text-emerald-950">
                          {outlet?.name ?? "-"}
                        </div>
                        <div className="text-sm text-emerald-700">
                          {outlet?.code ?? "-"}
                        </div>
                        <div className="mt-1 font-mono text-xs text-emerald-500">
                          {outlet?.id ?? "-"}
                        </div>
                        {outlet?.id === resolution?.outlet?.id && (
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
                <h2 className="text-lg font-semibold text-emerald-950">
                  Pilih Outlet
                </h2>
                <p className="mt-2 text-sm text-emerald-700">
                  Anda memiliki akses ke beberapa outlet. Pilih outlet untuk
                  mengelola katalog dan meja.
                </p>
                <p className="mt-1 text-xs text-emerald-500">
                  Outlet terpilih akan diteruskan ke halaman Kategori, Menu, dan
                  Meja.
                </p>
              </div>
            );

          case "no-accessible-outlet":
            return (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <h2 className="text-lg font-semibold text-amber-900">
                  Tidak Ada Outlet Akses
                </h2>
                <p className="mt-2 text-sm text-amber-800">
                  Akun Anda tidak memiliki akses ke outlet aktif manapun.
                  Hubungi administrator.
                </p>
              </div>
            );

          case "invalid-or-denied":
            return (
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                <h2 className="text-lg font-semibold text-red-900">
                  Outlet Tidak Valid
                </h2>
                <p className="mt-2 text-sm text-red-800">
                  Outlet yang diminta tidak ditemukan atau akses ditolak.
                </p>
                {resolution?.outlets?.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="text-sm font-medium text-red-700">
                      Pilih outlet yang tersedia:
                    </p>
                    <ul
                      className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                      role="list"
                    >
                      {(resolution?.outlets ?? []).map((outlet) => (
                        <li
                          key={outlet?.id ?? outlet?.code ?? outlet?.name}
                          className="rounded-lg border border-red-200 bg-white p-3"
                        >
                          <div className="font-semibold text-red-900">
                            {outlet?.name ?? "-"}
                          </div>
                          <div className="text-sm text-red-700">
                            {outlet?.code ?? "-"}
                          </div>
                          <div className="mt-1 font-mono text-xs text-red-500">
                            {outlet?.id ?? "-"}
                          </div>
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
