export default function DashboardLoading() {
  return (
    <div
      className="min-h-[60vh] space-y-6"
      role="status"
      aria-live="polite"
      aria-label="Memuat halaman dashboard"
    >
      <span className="sr-only">Memuat halaman dashboard...</span>

      <div className="space-y-3" aria-hidden="true">
        <div className="h-4 w-32 animate-pulse rounded bg-emerald-100" />
        <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-gray-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
        <div className="h-24 animate-pulse rounded-lg border border-emerald-900/10 bg-white" />
        <div className="h-24 animate-pulse rounded-lg border border-emerald-900/10 bg-white" />
        <div className="h-24 animate-pulse rounded-lg border border-emerald-900/10 bg-white" />
      </div>

      <div className="space-y-3" aria-hidden="true">
        <div className="h-10 animate-pulse rounded bg-gray-100" />
        <div className="h-10 animate-pulse rounded bg-gray-100" />
        <div className="h-10 animate-pulse rounded bg-gray-100" />
      </div>
    </div>
  );
}
