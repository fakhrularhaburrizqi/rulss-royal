"use client";

import React, { useCallback, useRef, useState } from "react";
import { useMenuItemsQuery } from "./useMenuItemsQuery";
import { MenuCreateDialog } from "./MenuCreateDialog";
import { MenuEditDialog } from "./MenuEditDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem, PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

interface MenuItemTableProps {
  authScope: MenuItemAuthScope;
  outletId: string;
  initialData?: PaginatedMenuItemsResult;
  initialDataUpdatedAt?: number;
  canManageCatalog?: boolean;
}

function formatRupiah(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export function MenuItemTable({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageCatalog = false,
}: MenuItemTableProps) {
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
  } = useMenuItemsQuery({
    authScope,
    outletId,
    initialData,
    initialDataUpdatedAt,
  });

  const [dialogMode, setDialogMode] = useState<"closed" | "create" | "edit">("closed");
  const [selectedMenuItem, setSelectedMenuItem] = useState<ManagementMenuItemListItem | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenCreate = useCallback(() => {
    setDialogMode("create");
  }, []);

  const handleOpenEdit = useCallback((item: ManagementMenuItemListItem) => {
    setSelectedMenuItem(item);
    setDialogMode("edit");
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogMode("closed");
    setSelectedMenuItem(null);
  }, []);

  const rows = data?.data ?? [];
  const err = (error as (Error & { code?: string; status?: number }) | null);

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
      : "Anda tidak memiliki akses ke menu di outlet ini."
    : "Gagal memuat menu. Silakan coba lagi.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-64">
            <Label htmlFor="menu-filter" className="sr-only">
              Filter menu
            </Label>
            <select
              id="menu-filter"
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
            <Label htmlFor="menu-search" className="sr-only">
              Cari menu
            </Label>
            <input
              id="menu-search"
              type="search"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder="Cari nama menu..."
              maxLength={120}
              disabled={isAuthError}
              className="w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
            />
          </div>
        </div>

        {canManageCatalog && !isAuthError && (
          <Button
            ref={triggerRef}
            onClick={handleOpenCreate}
            className="whitespace-nowrap"
          >
            Tambah Menu
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4" role="status" aria-live="polite" aria-label="Memuat menu">
            <div className="h-10 animate-pulse rounded bg-gray-100" />
            <div className="h-10 animate-pulse rounded bg-gray-100" />
            <div className="h-10 animate-pulse rounded bg-gray-100" />
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

            <div
              className="overflow-x-auto rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              role="region"
              aria-label="Tabel menu"
              tabIndex={0}
            >
              <Table className="w-full min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-emerald-800">Nama</TableHead>
                    <TableHead className="text-emerald-800">Kategori</TableHead>
                    <TableHead className="text-right text-emerald-800">Harga</TableHead>
                    <TableHead className="text-emerald-800">Status item</TableHead>
                    <TableHead className="text-emerald-800">Sold-out</TableHead>
                    {canManageCatalog && !isAuthError && (
                      <TableHead className="w-[120px] text-emerald-800">Aksi</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManageCatalog && !isAuthError ? 6 : 5} className="py-8 text-center text-emerald-600">
                        Tidak ada menu ditemukan
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const status = getStatusLabel(row.deletedAt ?? null, row.isActive === true);
                      const category = row.category ?? null;
                      const categoryUnavailable =
                        category === null || category.deletedAt !== null || !category.isActive;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium text-emerald-950">{row.name}</TableCell>
                          <TableCell>
                            {categoryUnavailable ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                Kategori tidak tersedia
                              </span>
                            ) : (
                              <span className="text-emerald-900">{category?.name ?? "-"}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-emerald-950">
                            {formatRupiah(row.price)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}
                            >
                              {status.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            {row.isSoldOut ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                Habis
                              </span>
                            ) : (
                              <span>
                                <span className="text-gray-600" aria-hidden="true">
                                  -
                                </span>
                                <span className="sr-only">Tidak ditandai habis</span>
                              </span>
                            )}
                          </TableCell>
                          {canManageCatalog && !isAuthError && (
                            <TableCell>
                              <Button
                                onClick={() => handleOpenEdit(row)}
                                aria-label={`Edit ${row.name}`}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer"
                              >
                                Edit
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-emerald-700">
                {rows.length === 0
                  ? "Tidak ada data"
                  : `Menampilkan ${rows.length} menu${hasMore ? " (lebih banyak tersedia)" : ""}`}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goToPrevious}
                  disabled={!canGoPrevious}
                  className="inline-flex items-center rounded-lg border border-emerald-900/30 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Halaman sebelumnya"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={!canGoNext}
                  className="inline-flex items-center rounded-lg border border-emerald-900/30 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Halaman selanjutnya"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <MenuCreateDialog
        isOpen={dialogMode === "create"}
        onClose={handleCloseDialog}
        outletId={outletId}
        authScope={authScope}
        triggerRef={triggerRef}
      />

      {selectedMenuItem && (
        <MenuEditDialog
          isOpen={dialogMode === "edit"}
          onClose={handleCloseDialog}
          outletId={outletId}
          authScope={authScope}
          menuItem={selectedMenuItem}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
}
