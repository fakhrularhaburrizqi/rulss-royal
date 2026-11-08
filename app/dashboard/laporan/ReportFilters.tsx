import Link from "next/link";

import {
  MAX_CUSTOM_RANGE_DAYS,
  REPORT_RANGE_PRESETS,
  type ReportRange,
} from "@/lib/dashboard/report-range";

type ReportFiltersProps = {
  outletId: string;
  range: ReportRange;
};

function presetHref(outletId: string, kind: string): string {
  const params = new URLSearchParams();
  if (outletId) {
    params.set("outlet", outletId);
  }
  params.set("range", kind);
  return `/dashboard/laporan?${params.toString()}`;
}

const activePresetClass = "border-emerald-500 bg-emerald-500/10 text-emerald-300";
const idlePresetClass =
  "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white";

export function ReportFilters({ outletId, range }: ReportFiltersProps) {
  return (
    <section
      aria-label="Filter rentang waktu laporan"
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <nav aria-label="Rentang waktu laporan">
          <p className="mb-2 text-xs font-medium text-zinc-400">Rentang cepat</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_RANGE_PRESETS.map((preset) => {
              const isActive = range.kind === preset.kind;
              return (
                <Link
                  key={preset.kind}
                  href={presetHref(outletId, preset.kind)}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none ${
                    isActive ? activePresetClass : idlePresetClass
                  }`}
                >
                  {preset.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div
          className={`rounded-xl border p-3 ${
            range.kind === "custom"
              ? "border-emerald-500/60 bg-emerald-500/5"
              : "border-zinc-800 bg-zinc-950/40"
          }`}
        >
          <p className="mb-2 text-xs font-medium text-zinc-400">Rentang kustom</p>
          <form
            method="get"
            action="/dashboard/laporan"
            aria-label="Rentang tanggal kustom"
            className="flex flex-wrap items-end gap-3"
          >
            {outletId ? <input type="hidden" name="outlet" value={outletId} /> : null}
            <input type="hidden" name="range" value="custom" />

            <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-400">
              Dari tanggal
              <input
                type="date"
                name="start"
                required
                defaultValue={range.customStartKey ?? range.startKey}
                className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-400">
              Sampai tanggal
              <input
                type="date"
                name="end"
                required
                defaultValue={range.customEndKey ?? range.endKey}
                className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
              />
            </label>

            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none"
            >
              Terapkan
            </button>
          </form>
        </div>
      </div>

      {range.customInvalid ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          Tanggal kustom tidak valid. Maksimal {MAX_CUSTOM_RANGE_DAYS} hari dan tanggal akhir harus
          setelah tanggal mulai. Menampilkan 7 hari terakhir.
        </p>
      ) : null}
    </section>
  );
}
