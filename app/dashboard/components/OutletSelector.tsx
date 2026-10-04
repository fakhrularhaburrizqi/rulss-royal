"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { OutletDTO } from "@/lib/dashboard/context";

type OutletSelectorProps = {
  outlets: OutletDTO[];
  selectedOutletId: string | null;
};

export function OutletSelector({ outlets, selectedOutletId }: OutletSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);

  if (outlets.length === 0) {
    return (
      <span className="text-sm text-gray-500" aria-live="polite">
        Tidak ada outlet aktif
      </span>
    );
  }

  function handleChange(outletId: string) {
    if (isPending || outletId === selectedOutletId) return;
    setIsPending(true);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("outlet", outletId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setTimeout(() => setIsPending(false), 300);
  }

  if (outlets.length === 1) {
    const outlet = outlets[0];
    return (
      <div className="flex items-center gap-2">
        <label htmlFor="outlet-select" className="sr-only">
          Pilih outlet
        </label>
        <select
          id="outlet-select"
          value={selectedOutletId ?? outlet.id}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className="rounded-lg border border-emerald-900/10 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
          aria-label={`Outlet aktif: ${outlet.name} (${outlet.code})`}
        >
          <option value={outlet.id}>{outlet.name} ({outlet.code})</option>
        </select>
        {isPending && (
          <span className="sr-only" aria-live="polite">
            Memuat outlet...
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="outlet-select" className="sr-only">
        Pilih outlet
      </label>
      <select
        id="outlet-select"
        value={selectedOutletId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="rounded-lg border border-emerald-900/10 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
        aria-label="Pilih outlet aktif"
      >
        <option value="">Pilih outlet</option>
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name} ({outlet.code})
          </option>
        ))}
      </select>
      {isPending && (
        <span className="sr-only" aria-live="polite">
          Memuat outlet...
        </span>
      )}
    </div>
  );
}