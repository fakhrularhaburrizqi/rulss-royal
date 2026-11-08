import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { DashboardShell } from "../components/DashboardShell";
import { ReportFilters } from "./ReportFilters";
import { SalesTrendChart } from "./SalesTrendChart";
import { requireActiveUser } from "@/lib/auth/authorization";
import { resolveDashboardContext } from "@/lib/dashboard/context";
import { parseReportRange } from "@/lib/dashboard/report-range";
import { getSalesReport, type SalesReport } from "@/lib/dashboard/sales-report";
import { formatRupiah } from "@/lib/utils/format-rupiah";

function MetricCard({
  label,
  value,
  detail,
  valueClassName = "text-emerald-300",
}: {
  label: string;
  value: string;
  detail: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p
        className={`mt-3 font-mono text-2xl font-semibold tracking-tight break-words ${valueClassName}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-8 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-400">{description}</p>
    </div>
  );
}

export default async function LaporanPage({
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
  const params = await searchParams;
  const range = parseReportRange(params);

  const isSelected = resolution?.kind === "selected";
  const canView = resolution?.kind === "selected" && resolution.capabilities.canViewOrders === true;
  const outletId = resolution?.kind === "selected" ? resolution.outlet.id : "";

  let report: SalesReport | null = null;
  if (
    resolution?.kind === "selected" &&
    resolution.capabilities.canViewOrders === true &&
    tenant?.id
  ) {
    try {
      report = await getSalesReport(tenant.id, resolution.outlet.id, range);
    } catch {
      report = null;
    }
  }

  const retryParams = new URLSearchParams();
  if (outletId) {
    retryParams.set("outlet", outletId);
  }
  retryParams.set("range", range.kind);
  if (range.kind === "custom") {
    retryParams.set("start", range.startKey);
    retryParams.set("end", range.endKey);
  }
  const retryHref = `/dashboard/laporan?${retryParams.toString()}`;

  const exportParams = new URLSearchParams({
    range: "custom",
    start: range.startKey,
    end: range.endKey,
  });
  if (outletId) {
    exportParams.set("outlet", outletId);
  }
  const exportHref = `/api/v1/reports/export?${exportParams.toString()}`;

  const topMenu = report?.topMenus[0] ?? null;
  const granularityLabel = range.granularity === "weekly" ? "Mingguan" : "Harian";

  return (
    <DashboardShell
      resolution={resolution}
      tenantName={tenant?.name ?? "-"}
      tenantCode={tenant?.code ?? "-"}
      userName={user?.name ?? "-"}
      currentPath="/dashboard/laporan"
    >
      <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
        <section className="rounded-2xl border border-emerald-800/50 bg-emerald-950 p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-bold tracking-wider text-white">
                Laporan &amp; Analytics Penjualan
              </h1>
              <p className="mt-2 font-mono text-xs text-emerald-100/90">
                Pantau omzet, tren transaksi, dan performa menu terlaris Warungku
              </p>
            </div>

            {canView ? (
              <div className="shrink-0">
                <a
                  href={exportHref}
                  download
                  title="Unduh rekap transaksi sebagai CSV yang dapat dibuka di Excel"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-950 focus-visible:outline-none"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export CSV / Excel
                </a>
                <p className="mt-2 text-center font-mono text-[11px] text-emerald-100/70">
                  Format CSV, dapat dibuka di Excel
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-emerald-800/40 pt-4 font-mono text-xs text-emerald-100/80">
            <span>
              Periode: <span className="text-emerald-50">{range.label}</span>
            </span>
            {resolution?.kind === "selected" ? (
              <span>
                Outlet: <span className="text-emerald-50">{resolution.outlet.name}</span>
              </span>
            ) : null}
            <span>Zona waktu: WIB</span>
          </div>
        </section>

        {!canView ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <h2 className="text-base font-semibold text-amber-100">
              {isSelected ? "Akses laporan ditolak" : "Pilih outlet terlebih dahulu"}
            </h2>
            <p className="mt-2 text-sm text-amber-100/80">
              {isSelected
                ? "Akun Anda tidak memiliki izin melihat pesanan di outlet ini."
                : "Laporan penjualan membutuhkan outlet aktif. Pilih outlet dari menu di header."}
            </p>
          </div>
        ) : (
          <>
            <ReportFilters outletId={outletId} range={range} />

            {report === null ? (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center"
              >
                <h2 className="text-base font-semibold text-red-200">Data laporan gagal dimuat</h2>
                <p className="mt-2 text-sm text-red-200/80">
                  Angka tidak ditampilkan agar tidak menyesatkan. Coba muat ulang laporan.
                </p>
                <Link
                  href={retryHref}
                  className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 focus-visible:outline-none"
                >
                  Muat ulang
                </Link>
              </div>
            ) : (
              <>
                <section aria-labelledby="laporan-metrik-heading">
                  <h2 id="laporan-metrik-heading" className="text-sm font-semibold text-zinc-300">
                    Ringkasan performa
                  </h2>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Total Omzet"
                      value={formatRupiah(report.totalRevenue)}
                      detail={`Dari ${report.completedOrders} pesanan selesai`}
                    />
                    <MetricCard
                      label="Total Pesanan"
                      value={String(report.completedOrders)}
                      detail="Pesanan berstatus selesai"
                      valueClassName="text-zinc-100"
                    />
                    <MetricCard
                      label="Rata-rata Transaksi (AOV)"
                      value={
                        report.completedOrders > 0 ? formatRupiah(report.averageTransaction) : "-"
                      }
                      detail={
                        report.completedOrders > 0
                          ? "Omzet dibagi pesanan selesai"
                          : "Belum ada pesanan selesai"
                      }
                      valueClassName="text-zinc-100"
                    />
                    <MetricCard
                      label="Menu Terlaris"
                      value={topMenu?.name ?? "-"}
                      detail={
                        topMenu
                          ? `${topMenu.quantity} porsi terjual · ${formatRupiah(topMenu.revenue)}`
                          : "Belum ada menu terjual"
                      }
                      valueClassName="text-lg text-emerald-300"
                    />
                  </div>
                </section>

                <section
                  aria-labelledby="laporan-tren-heading"
                  className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2
                        id="laporan-tren-heading"
                        className="text-base font-semibold text-zinc-100"
                      >
                        Tren Penjualan
                      </h2>
                      <p className="mt-1 text-xs text-zinc-400">
                        Omzet pesanan selesai per{" "}
                        {range.granularity === "weekly" ? "minggu" : "hari"}. Zona waktu WIB.
                      </p>
                    </div>
                    <span className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[11px] text-zinc-300">
                      {granularityLabel}
                    </span>
                  </div>

                  {report.completedOrders === 0 ? (
                    <EmptyPanel
                      title="Belum ada penjualan pada periode ini"
                      description="Grafik akan muncul setelah ada pesanan yang selesai."
                    />
                  ) : (
                    <SalesTrendChart
                      data={report.trend}
                      ariaLabel={`Grafik tren penjualan ${granularityLabel.toLowerCase()} dari ${range.label}, total ${formatRupiah(
                        report.totalRevenue
                      )}`}
                    />
                  )}
                </section>

                <section
                  aria-labelledby="laporan-menu-heading"
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                >
                  <div className="border-b border-zinc-800 p-5">
                    <h2 id="laporan-menu-heading" className="text-base font-semibold text-zinc-100">
                      Ranking Menu Terlaris
                    </h2>
                    <p className="mt-1 text-xs text-zinc-400">
                      Diurutkan berdasarkan porsi terjual. Pendapatan adalah subtotal item sebelum
                      pajak dan service.
                    </p>
                  </div>

                  {report.topMenus.length === 0 ? (
                    <div className="p-5">
                      <EmptyPanel
                        title="Belum ada menu terjual"
                        description="Peringkat menu muncul setelah ada pesanan selesai pada periode ini."
                      />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                            <th scope="col" className="px-5 py-3 font-medium">
                              Peringkat
                            </th>
                            <th scope="col" className="px-5 py-3 font-medium">
                              Menu
                            </th>
                            <th scope="col" className="px-5 py-3 text-right font-medium">
                              Porsi Terjual
                            </th>
                            <th scope="col" className="px-5 py-3 text-right font-medium">
                              Pendapatan
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.topMenus.map((menu, index) => (
                            <tr
                              key={menu.menuItemId}
                              className="border-b border-zinc-800/60 last:border-b-0 hover:bg-zinc-800/40"
                            >
                              <td className="px-5 py-3.5">
                                <span
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-semibold ${
                                    index === 0
                                      ? "bg-emerald-500 text-emerald-950"
                                      : index < 3
                                        ? "bg-emerald-500/10 text-emerald-300"
                                        : "text-zinc-400"
                                  }`}
                                >
                                  {index + 1}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 font-medium text-zinc-100">{menu.name}</td>
                              <td className="px-5 py-3.5 text-right font-mono text-zinc-200">
                                {menu.quantity}
                              </td>
                              <td className="px-5 py-3.5 text-right font-mono text-emerald-300">
                                {formatRupiah(menu.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
