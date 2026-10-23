const pulseBarClass = "animate-pulse rounded bg-gray-200 dark:bg-gray-700";
const surfaceClass = "bg-white dark:bg-gray-900";
const borderClass = "border-emerald-900/10 dark:border-gray-700";

function ThinBar({ className }: { className?: string }) {
  return <div aria-hidden="true" className={`${pulseBarClass} h-2.5 ${className ?? ""}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" role="status" aria-live="polite" aria-label="Memuat halaman dashboard">
      <span className="sr-only">Memuat halaman dashboard...</span>

      <header className={`sticky top-0 z-40 border-b ${borderClass} ${surfaceClass}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className={`${pulseBarClass} h-9 w-9 rounded-full`} />
            <div className={`${pulseBarClass} h-5 w-28`} />
            <div className={`${pulseBarClass} hidden h-7 w-36 rounded-lg sm:block`} />
          </div>
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className={`${pulseBarClass} h-9 w-40 rounded-lg`} />
            <div className={`${pulseBarClass} hidden h-4 w-20 sm:block`} />
            <div className={`${pulseBarClass} h-8 w-16 rounded`} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-hidden="true" className="mb-6">
          <ul className="flex flex-wrap gap-2">
            {[56, 72, 56, 72, 76].map((width, index) => (
              <li key={index}>
                <div className={`${pulseBarClass} h-9 rounded-lg`} style={{ width }} />
              </li>
            ))}
          </ul>
        </nav>

        <main className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center" aria-hidden="true">
              <div className={`${pulseBarClass} h-10 w-full rounded-lg sm:w-64`} />
              <div className={`${pulseBarClass} h-10 w-full rounded-lg sm:w-80`} />
            </div>
            <div aria-hidden="true" className={`${pulseBarClass} h-10 w-36 rounded-md`} />
          </div>

          <div className={`rounded-md border ${borderClass} ${surfaceClass} shadow-sm`}>
            <div className="overflow-hidden">
              <div className={`flex h-12 items-center gap-4 border-b ${borderClass} px-4`} aria-hidden="true">
                <ThinBar className="w-12" />
                <ThinBar className="flex-1" />
                <ThinBar className="w-16" />
                <ThinBar className="w-20" />
              </div>
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={`flex h-12 items-center gap-4 border-b px-4 last:border-b-0 ${borderClass}`}
                  aria-hidden="true"
                >
                  <ThinBar className="w-6" />
                  <ThinBar className={index % 2 === 0 ? "w-40" : "w-28"} />
                  <ThinBar className="w-14" />
                  <ThinBar className="w-18" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
