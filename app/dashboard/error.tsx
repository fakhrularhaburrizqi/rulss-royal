"use client";

import React, { useEffect } from "react";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div
        className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-center"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-red-900">Terjadi Kesalahan</h2>
        <p className="mt-2 text-sm text-red-800">
          Halaman dashboard tidak dapat dimuat. Coba muat ulang, atau hubungi administrator jika
          masalah berlanjut.
        </p>
        {error?.digest && (
          <p className="mt-2 text-xs font-mono text-red-700">Kode: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
