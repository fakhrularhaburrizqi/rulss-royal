"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useCategoriesQuery } from "./useCategoriesQuery";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import { archiveCategoryAction, createCategoryAction, restoreCategoryAction, updateCategoryAction } from "@/app/dashboard/menu-actions";
import { categoryCreateSchema, categoryUpdateSchema, type CategoryCreateInput, type CategoryUpdateInput } from "@/lib/validators/menu.validator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CategoryCreateDialog } from "./CategoryCreateDialog";
import { CategoryEditDialog } from "./CategoryEditDialog";
import { CategoryArchiveDialog } from "./CategoryArchiveDialog";

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

  // Dialog mode state
  const [dialogMode, setDialogMode] = useState<"closed" | "create" | "edit" | "archive" | "restore">("closed");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);

  // Snapshot for edit mode
  const [editSnapshot, setEditSnapshot] = useState<{
    id: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    deletedAt: string | null;
    updatedAt: string;
  } | null>(null);

  // Snapshot for archive/restore mode
  const [archiveSnapshot, setArchiveSnapshot] = useState<{
    id: string;
    name: string;
    deletedAt: string | null;
    updatedAt: string;
  } | null>(null);

  // Create form
  const createForm = useForm<CategoryCreateInput>({
    resolver: zodResolver(categoryCreateSchema),
    defaultValues: {
      outletId,
      name: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  // Edit form
  const editForm = useForm<CategoryUpdateInput>({
    resolver: zodResolver(categoryUpdateSchema),
    defaultValues: {
      outletId,
      categoryId: "",
      expectedUpdatedAt: "",
      name: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  // Synchronous in-flight guard
  const inFlightRef = useRef(false);

  // beforeunload handler for dirty form - single owner in CategoryTable
  useEffect(() => {
    if (dialogMode !== "create" && dialogMode !== "edit") return;
    const form = dialogMode === "create" ? createForm : editForm;
    const isDirty = form.formState.isDirty;
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dialogMode, createForm, editForm, createForm.formState.isDirty, editForm.formState.isDirty]);

  const handleOpenCreateDialog = useCallback(() => {
    if (inFlightRef.current) return;
    if (dialogMode !== "closed") return;
    setDialogMode("create");
    // Reset form after mode change to ensure clean state
    createForm.reset({ outletId, name: "", sortOrder: 0, isActive: true });
    setDomainError(null);
    setSuccessFeedback(null);
    setRefreshError(null);
  }, [createForm, outletId, dialogMode]);

  const handleOpenEditDialog = useCallback((row: {
    id: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    deletedAt: string | null;
    updatedAt: string;
  }, trigger: HTMLButtonElement | null) => {
    if (inFlightRef.current) return;
    if (dialogMode !== "closed") return;
    editTriggerRef.current = trigger;
    const snapshot = { ...row };
    setEditSnapshot(snapshot);
    setDialogMode("edit");
    editForm.reset({
      outletId,
      categoryId: row.id,
      expectedUpdatedAt: row.updatedAt,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });
    setDomainError(null);
    setSuccessFeedback(null);
    setRefreshError(null);
  }, [editForm, outletId, dialogMode]);

  const handleOpenArchiveDialog = useCallback((row: {
    id: string;
    name: string;
    deletedAt: string | null;
    updatedAt: string;
  }, mode: "archive" | "restore", trigger: HTMLButtonElement | null) => {
    if (inFlightRef.current) return;
    if (dialogMode !== "closed") return;
    archiveTriggerRef.current = trigger;
    setArchiveSnapshot({ ...row });
    setDialogMode(mode);
    setDomainError(null);
    setSuccessFeedback(null);
    setRefreshError(null);
  }, [dialogMode]);

  // Single close guard - owner in CategoryTable
  const handleCloseDialog = useCallback(() => {
    if (inFlightRef.current) return;
    if (dialogMode === "create" || dialogMode === "edit") {
      const form = dialogMode === "create" ? createForm : editForm;
      if (form.formState.isDirty) {
        const confirmed = window.confirm("Perubahan belum disimpan. Tutup dialog?");
        if (!confirmed) return;
      }
    }
    setDialogMode("closed");
    createForm.reset({ outletId, name: "", sortOrder: 0, isActive: true });
    editForm.reset({ outletId, categoryId: "", expectedUpdatedAt: "", name: "", sortOrder: 0, isActive: true });
    setEditSnapshot(null);
    setArchiveSnapshot(null);
    setDomainError(null);
  }, [createForm, editForm, dialogMode, outletId]);

  // Create submit
  const handleCreateSubmit = useCallback(async (data: CategoryCreateInput) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    setDomainError(null);
    setRefreshError(null);

    try {
      const result = await createCategoryAction({ ...data, outletId });
      if (!result.ok) {
        if (result.code === "CATEGORY_NAME_CONFLICT") {
          createForm.setError("name", { type: "server", message: result.message });
        } else {
          setDomainError(result.message);
        }
        return;
      }
      // Success - action.ok === true is the only success criterion
      setSuccessFeedback("Kategori berhasil dibuat");
      createForm.reset({ outletId, name: "", sortOrder: 0, isActive: true });
      setDialogMode("closed");
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
  }, [createForm, outletId, authScope.tenantId, authScope.userId, queryClient]);

  // Edit submit
  const handleEditSubmit = useCallback(async (data: CategoryUpdateInput) => {
    if (inFlightRef.current) return;
    const snapshot = editSnapshot;
    if (!snapshot) return;

    // Actual change detection: normalized form values vs frozen edit snapshot
    const nameChanged = typeof data.name === "string" && data.name.trim() !== snapshot.name;
    const sortOrderChanged = typeof data.sortOrder === "number" && Number(data.sortOrder) !== snapshot.sortOrder;
    const isActiveChanged = typeof data.isActive === "boolean" && data.isActive !== snapshot.isActive;

    if (!nameChanged && !sortOrderChanged && !isActiveChanged) {
      setSuccessFeedback(null);
      setRefreshError(null);
      setDomainError("Tidak ada perubahan");
      return;
    }

    // Authoritative metadata: outletId from prop, id/updatedAt from snapshot
    const payload: CategoryUpdateInput = {
      outletId,
      categoryId: snapshot.id,
      expectedUpdatedAt: snapshot.updatedAt,
    };
    if (nameChanged) payload.name = (data.name as string).trim();
    if (sortOrderChanged) payload.sortOrder = Number(data.sortOrder);
    if (isActiveChanged) payload.isActive = Boolean(data.isActive);

    inFlightRef.current = true;
    setIsSubmitting(true);
    setDomainError(null);
    setRefreshError(null);

    try {
      const result = await updateCategoryAction(payload);
      if (!result.ok) {
        if (result.code === "CATEGORY_NAME_CONFLICT") {
          editForm.setError("name", { type: "server", message: result.message });
        } else if (result.code === "CATALOG_VERSION_CONFLICT" || result.code === "CATALOG_STATE_CONFLICT" || result.code === "CATEGORY_NOT_FOUND") {
          setDomainError(result.message);
        } else {
          setDomainError(result.message);
        }
        return;
      }
      // Success - action.ok === true is the only success criterion
      setSuccessFeedback("Kategori berhasil diperbarui");
      editForm.reset({ outletId, categoryId: "", expectedUpdatedAt: "", name: "", sortOrder: 0, isActive: true });
      setDialogMode("closed");
      setEditSnapshot(null);
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
        // Refresh failed but update succeeded
        setRefreshError("Kategori berhasil diperbarui, tetapi daftar belum diperbarui.");
      }
    } catch {
      setDomainError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  }, [editForm, editSnapshot, outletId, authScope.tenantId, authScope.userId, queryClient]);

  // Archive/restore submit - mode captured while the dialog is open
  const handleArchiveRestoreSubmit = useCallback(async () => {
    if (inFlightRef.current) return;
    const snapshot = archiveSnapshot;
    const mode = dialogMode;
    if (!snapshot || (mode !== "archive" && mode !== "restore")) return;

    inFlightRef.current = true;
    setIsSubmitting(true);
    setDomainError(null);
    setRefreshError(null);

    try {
      const payload = {
        outletId,
        categoryId: snapshot.id,
        expectedUpdatedAt: snapshot.updatedAt,
      };
      const result =
        mode === "archive"
          ? await archiveCategoryAction(payload)
          : await restoreCategoryAction(payload);
      if (!result.ok) {
        setDomainError(result.message);
        return;
      }
      // Success - action.ok === true is the only success criterion
      setSuccessFeedback(
        mode === "archive" ? "Kategori berhasil diarsipkan" : "Kategori berhasil dipulihkan"
      );
      setDialogMode("closed");
      setArchiveSnapshot(null);
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
        // Refresh failed but archive/restore succeeded
        setRefreshError(
          mode === "archive"
            ? "Kategori berhasil diarsipkan, tetapi daftar belum diperbarui."
            : "Kategori berhasil dipulihkan, tetapi daftar belum diperbarui."
        );
      }
    } catch {
      setDomainError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
      inFlightRef.current = false;
    }
  }, [archiveSnapshot, dialogMode, outletId, authScope.tenantId, authScope.userId, queryClient]);

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
              className="w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:opacity-50"
            />
          </div>
        </div>
        {canManageCatalog && !isAuthError && (
          <Button
            ref={triggerRef}
            onClick={handleOpenCreateDialog}
            disabled={isSubmitting && dialogMode !== "closed"}
            aria-disabled={isSubmitting}
            className="aria-disabled:cursor-wait"
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
          isOpen={dialogMode === "create"}
          onClose={handleCloseDialog}
          isSubmitting={isSubmitting}
          onSubmit={handleCreateSubmit}
          domainError={domainError}
          form={createForm}
          triggerRef={triggerRef}
        />

        {/* Edit Category Dialog */}
        <CategoryEditDialog
          isOpen={dialogMode === "edit"}
          onClose={handleCloseDialog}
          isSubmitting={isSubmitting}
          onSubmit={handleEditSubmit}
          domainError={domainError}
          form={editForm}
          triggerRef={editTriggerRef}
          fallbackTriggerRef={triggerRef}
          isArchived={Boolean(editSnapshot?.deletedAt)}
        />

        {/* Archive/Restore confirmation dialog */}
        <CategoryArchiveDialog
          isOpen={dialogMode === "archive" || dialogMode === "restore"}
          mode={dialogMode === "restore" ? "restore" : "archive"}
          categoryName={archiveSnapshot?.name ?? ""}
          onClose={handleCloseDialog}
          onConfirm={handleArchiveRestoreSubmit}
          isSubmitting={isSubmitting}
          domainError={domainError}
          triggerRef={archiveTriggerRef}
          fallbackTriggerRef={triggerRef}
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
                  <TableHead className="w-[60px] text-emerald-800">Urutan</TableHead>
                  <TableHead className="text-emerald-800">Nama</TableHead>
                  <TableHead className="w-[140px] text-emerald-800">Status</TableHead>
                  <TableHead className="w-[220px] text-emerald-800">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-emerald-600">
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
                        <TableCell>
                          {canManageCatalog && !isAuthError && (
                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                onClick={(event) => handleOpenEditDialog(row, event.currentTarget)}
                                disabled={isSubmitting && dialogMode !== "closed"}
                                aria-disabled={isSubmitting}
                                aria-label={`Edit ${row.name}`}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Edit
                              </Button>
                              {row.deletedAt === null ? (
                                <Button
                                  onClick={(event) =>
                                    handleOpenArchiveDialog(row, "archive", event.currentTarget)
                                  }
                                  disabled={isSubmitting && dialogMode !== "closed"}
                                  aria-disabled={isSubmitting}
                                  aria-label={`Arsip ${row.name}`}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Arsip
                                </Button>
                              ) : (
                                <Button
                                  onClick={(event) =>
                                    handleOpenArchiveDialog(row, "restore", event.currentTarget)
                                  }
                                  disabled={isSubmitting && dialogMode !== "closed"}
                                  aria-disabled={isSubmitting}
                                  aria-label={`Pulihkan ${row.name}`}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Pulihkan
                                </Button>
                              )}
                            </div>
                          )}
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
    </div>
  );
}