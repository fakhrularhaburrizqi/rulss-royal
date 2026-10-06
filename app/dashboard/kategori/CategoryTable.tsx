"use client";

import React from "react";
import { useCategoriesQuery } from "./useCategoriesQuery";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";

interface CategoryTableProps {
  authScope: CategoryAuthScope;
  outletId: string;
  initialData?: {
    data: ReadonlyArray<{
      id: string;
      name: string;
      sortOrder: number;
      isActive: boolean;
      deletedAt: string | null;
      updatedAt: string;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  };
  initialDataUpdatedAt?: number;
}

export function CategoryTable({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: CategoryTableProps) {
  const {
    filter,
    setFilter,
    draftSearch,
    setDraftSearch,
    data,
    isLoading,
    isFetching,
    isError,
    error,
    hasMore,
    canGoNext,
    canGoPrevious,
    goToNext,
    goToPrevious,
    refetch,
  } = useCategoriesQuery({
    authScope,
    outletId,
    initialData,
    initialDataUpdatedAt,
  });

  const rows: ReadonlyArray<{
    id: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    deletedAt: string | null;
    updatedAt: string;
  }> = data?.data ?? [];
  const err = error as Error & { code?: string; status?: number } | null;

  const getStatusLabel = (deletedAt: string | null, isActive: boolean) => {
    if (deletedAt) return { label: "Arsip", className: "bg-amber-100 text-amber-800" };
    return isActive
      ? { label: "Aktif", className: "bg-emerald-100 text-emerald-800" }
      : { label: "Tidak Aktif", className: "bg-gray-100 text-gray-800" };
  };

  const isAuthError = err?.status === 401 || err?.status === 403;
  const errorMessage = isAuthError
    ? err?.status === 401
      ? "Sesi Anda telah berakhir. Silakan masuk kembali."
      : "Anda tidak memiliki akses ke kategori di outlet ini."
    : "Gagal memuat kategori. Silakan coba lagi.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="w-full sm:w-64">
          <Label htmlFor="category-filter" className="sr-only">
            Filter kategori
          </Label>
          <select
            id="category-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "active" | "inactive" | "archived")}
            disabled={isAuthError}
            className="w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak Aktif</option>
            <option value="archived">Arsip</option>
          </select>
        </div>
        <div className="relative w-full sm:w-80">
          <Label htmlFor="category-search" className="sr-only">
            Cari kategori
          </Label>
          <input
            id="category-search"
            type="search"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            placeholder="Cari nama kategori..."
            maxLength={80}
            disabled={isAuthError}
            className="w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4" role="status" aria-live="polite" aria-label="Memuat kategori">
            <div className="h-10 animate-pulse bg-gray-100 rounded" />
            <div className="h-10 animate-pulse bg-gray-100 rounded" />
            <div className="h-10 animate-pulse bg-gray-100 rounded" />
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center" role="alert">
            <h3 className="text-lg font-semibold text-red-900">{isAuthError ? "Akses Ditolak" : "Gagal Memuat"}</h3>
            <p className="mt-2 text-sm text-red-800">{errorMessage}</p>
            {!isAuthError && (
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Coba Lagi
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {isFetching && (
              <span className="text-sm text-emerald-600" aria-live="polite">
                Memuat...
              </span>
            )}

            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Urutan</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-emerald-600">
                      Tidak ada kategori ditemukan
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const status = getStatusLabel(row.deletedAt, row.isActive);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-emerald-900">{row.sortOrder}</TableCell>
                        <TableCell className="font-medium text-emerald-950">{row.name}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between">
              <div className="text-sm text-emerald-700">
                {rows.length === 0
                  ? "Tidak ada data"
                  : `Menampilkan ${rows.length} kategori${hasMore ? " (lebih banyak tersedia)" : ""}`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goToPrevious}
                  disabled={!canGoPrevious}
                  className="inline-flex items-center rounded-lg border border-emerald-900/10 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Halaman sebelumnya"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={!canGoNext}
                  className="inline-flex items-center rounded-lg border border-emerald-900/10 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Halaman selanjutnya"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
