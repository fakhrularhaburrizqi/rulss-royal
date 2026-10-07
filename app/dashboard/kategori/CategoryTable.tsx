"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useCategoriesQuery } from "./useCategoriesQuery";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import { createCategoryAction } from "@/app/dashboard/menu-actions";
import { categoryCreateSchema, type CategoryCreateInput } from "@/lib/validators/menu.validator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CategoryCreateDialog } from "./CategoryCreateDialog";

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
  canManageCatalog?: boolean;
}

export function CategoryTable({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageCatalog = false,
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

  // Create category dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const form = useForm<CategoryCreateInput>({
    resolver: zodResolver(categoryCreateSchema),
    defaultValues: {
      outletId,
      name: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  // Synchronous in-flight guard
  const inFlightRef = useRef(false);

  // Dirty tracking - use RHF formState.isDirty as single source of truth
  // const isSubmittedRef = useRef(false); // unused

  // beforeunload handler for dirty form - single owner in CategoryTable
  useEffect(() => {
    const isDirty = form.formState.isDirty;
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [form.formState.isDirty]);

  const handleOpenDialog = useCallback(() => {
    if (inFlightRef.current) return;
    setIsDialogOpen(true);
    form.reset({ outletId, name: "", sortOrder: 0, isActive: true });
    setDomainError(null);
    setSuccessFeedback(null);
    setRefreshError(null);
  }, [form, outletId]);

  // Single close guard - owner in CategoryTable
  const handleCloseDialog = useCallback(() => {
    if (inFlightRef.current) return;
    if (form.formState.isDirty) {
      const confirmed = window.confirm("Perubahan belum disimpan. Tutup dialog?");
      if (!confirmed) return;
    }
    setIsDialogOpen(false);
    form.reset({ outletId, name: "", sortOrder: 0, isActive: true });
    setDomainError(null);
  }, [form, outletId]);

  // Single submit with in-flight guard
  const handleSubmit = useCallback(async (data: CategoryCreateInput) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setDomainError(null);
    setRefreshError(null);

    try {
      const result = await createCategoryAction({ ...data, outletId });
      if (!result.ok) {
        if (result.code === "CATEGORY_NAME_CONFLICT") {
          form.setError("name", { type: "server", message: result.message });
        } else {
          setDomainError(result.message);
        }
        return;
      }
      // Success - action.ok === true is the only success criterion
      setSuccessFeedback("Kategori berhasil dibuat");
      form.reset({ outletId, name: "", sortOrder: 0, isActive: true });
      setIsDialogOpen(false);
      // Scoped invalidation - separate from action
      try {
        await queryClient.invalidateQueries(
          {
            predicate: (query) => {
              const key = query.queryKey;
              if (!Array.isArray(key) || key.length < 3) return false;
              if (key[0] !== "categories" || key[1] !== "list") return false;
              const params = key[2];
              if (typeof params !== "object" || params === null) return false;
              const p = params as Record<string, unknown>;
              if (typeof p.authScope !== "object" || p.authScope === null) return false;
              const authScopeObj = p.authScope as { tenantId?: unknown; userId?: unknown } | undefined;
              const tenantId = authScopeObj?.tenantId;
              const userId = authScopeObj?.userId;
              const outletIdParam = p.outletId;
              return (
                typeof tenantId === "string" &&
                typeof userId === "string" &&
                typeof outletIdParam === "string" &&
                tenantId === authScope.tenantId &&
                userId === authScope.userId &&
                outletIdParam === outletId
              );
            },
          },
          { throwOnError: true }
        );
      } catch {
        // Refresh failed but create succeeded
        setRefreshError("Kategori berhasil dibuat, tetapi daftar belum diperbarui.");
      }
    } catch {
      setDomainError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  }, [form, outletId, authScope.tenantId, authScope.userId, queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
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
        {canManageCatalog && !isAuthError && (
          <Button
            ref={triggerRef}
            onClick={handleOpenDialog}
            disabled={isSubmitting && isDialogOpen}
            aria-disabled={isSubmitting}
          >
            Tambah Kategori
          </Button>
        )}

        {/* Parent-mounted success feedback - inline role=status */}
{successFeedback && (
            <div
              id="create-category-feedback"
              role="status"
              aria-live="polite"
              className="rounded-lg bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-800 shadow-lg animate-in fade-in-0 duration-200"
            >
              {successFeedback}
            </div>
          )}

          {/* Refresh failure warning - separate from success feedback */}
          {refreshError && (
            <div
              id="refresh-category-warning"
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 shadow-lg animate-in fade-in-0 duration-200"
            >
              {refreshError}
            </div>
          )}

          {/* Create Category Dialog - simplified, forwards close to owner */}
        <CategoryCreateDialog
          isOpen={isDialogOpen}
          onClose={handleCloseDialog}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          domainError={domainError}
          form={form}
          triggerRef={triggerRef}
        />
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