import { ReactNode } from "react";
import { DashboardNavigation } from "./DashboardNavigation";
import { OutletSelector } from "./OutletSelector";
import { logoutAction } from "../actions";
import type { DashboardContextResult } from "@/lib/dashboard/context";

type DashboardShellProps = {
  resolution: DashboardContextResult;
  children: ReactNode;
  tenantName: string;
  tenantCode: string;
  userName: string;
};

export function DashboardShell({
  resolution,
  children,
  tenantName,
  tenantCode,
  userName,
}: DashboardShellProps) {
  const isSelected = resolution.kind === "selected";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-emerald-950">Warungku</h1>
            <span className="hidden sm:inline-flex items-center rounded-lg border border-emerald-900/10 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
              {tenantName} ({tenantCode})
            </span>
          </div>
          <div className="flex items-center gap-3">
            <OutletSelector
              outlets={resolution.outlets}
              selectedOutletId={isSelected ? resolution.outlet.id : null}
            />
            <span className="hidden sm:inline text-sm text-gray-600">{userName}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardNavigation
          resolution={resolution}
          currentPath="/dashboard"
        />
        <main id="main-content" className="mt-6">
          {children}
        </main>
      </div>
    </div>
  );
}