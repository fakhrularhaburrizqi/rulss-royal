"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchCategories } from "@/lib/api/categories";
import { updateMenuItemAction } from "@/app/dashboard/menu-actions";
import { menuItemUpdateSchema, type MenuItemUpdateInput } from "@/lib/validators/menu.validator";
import { menuItemKeys, type MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem } from "@/lib/services/menu-item-query.service";
import type { MenuItemSummary } from "@/lib/services/menu-item.service";

interface MenuEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  authScope: MenuItemAuthScope;
  menuItem: ManagementMenuItemListItem | MenuItemSummary & { description?: string | null; imageUrl?: string | null; imageAlt?: string | null; sortOrder?: number };
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onSuccess?: (data: MenuItemSummary) => void;
}

export function MenuEditDialog({
  isOpen,
  onClose,
  outletId,
  authScope,
  menuItem,
  triggerRef,
  onSuccess,
}: MenuEditDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  // Fetch active categories for dropdown (plus ensure current category is available even if inactive/archived)
  const categoriesQuery = useQuery({
    queryKey: ["categories", "active-or-current", authScope, outletId, menuItem?.categoryId],
    queryFn: () => fetchCategories({ outlet: outletId, filter: "all", limit: 100 }),
    enabled: isOpen,
  });

  const categories = categoriesQuery.data?.data ?? [];

  const form = useForm<MenuItemUpdateInput>({
    resolver: zodResolver(menuItemUpdateSchema) as unknown as undefined,
    defaultValues: {
      outletId,
      menuItemId: menuItem?.id ?? "",
      expectedUpdatedAt: menuItem?.updatedAt ?? "",
      categoryId: menuItem?.categoryId ?? "",
      name: menuItem?.name ?? "",
      price: menuItem?.price ?? 0,
      description: menuItem?.description ?? "",
      imageUrl: menuItem?.imageUrl ?? "",
      imageAlt: menuItem?.imageAlt ?? "",
      sortOrder: menuItem?.sortOrder ?? 0,
      isActive: menuItem?.isActive ?? true,
      isSoldOut: menuItem?.isSoldOut ?? false,
    },
  });

  // Reset form when dialog opens or menuItem changes
  useEffect(() => {
    if (isOpen && menuItem) {
      form.reset({
        outletId,
        menuItemId: menuItem.id,
        expectedUpdatedAt: menuItem.updatedAt,
        categoryId: menuItem.categoryId,
        name: menuItem.name,
        price: menuItem.price,
        description: menuItem.description ?? "",
        imageUrl: menuItem.imageUrl ?? "",
        imageAlt: menuItem.imageAlt ?? "",
        sortOrder: menuItem.sortOrder ?? 0,
        isActive: menuItem.isActive,
        isSoldOut: menuItem.isSoldOut,
      });
      setDomainError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, menuItem, outletId, form]);

  useEffect(() => {
    if (isOpen && menuItem && categoriesQuery.data?.data) {
      form.setValue("categoryId", menuItem.categoryId);
    }
  }, [isOpen, menuItem, categoriesQuery.data, form]);

  // Dirty state beforeunload warning
  useEffect(() => {
    if (!isOpen || !form.formState.isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isOpen, form.formState.isDirty]);

  const handleAttemptClose = useCallback(() => {
    if (isSubmitting) return;
    if (form.formState.isDirty) {
      const confirmed = window.confirm("Perubahan belum disimpan. Tutup dialog?");
      if (!confirmed) return;
    }
    onClose();
  }, [isSubmitting, form.formState.isDirty, onClose]);

  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        e.preventDefault();
        handleAttemptClose();
      }
    }
  }, [isSubmitting, handleAttemptClose]);

  const handleOverlayClick = useCallback((e: Event) => {
    if (isSubmitting && e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
    } else if (form.formState.isDirty && e.target === e.currentTarget) {
      e.preventDefault();
      handleAttemptClose();
    }
  }, [isSubmitting, form.formState.isDirty, handleAttemptClose]);

  const handleCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    triggerRef?.current?.focus();
  }, [triggerRef]);

  const onSubmit: SubmitHandler<MenuItemUpdateInput> = async (data) => {
    setIsSubmitting(true);
    setDomainError(null);

    try {
      const result = await updateMenuItemAction({
        ...data,
        outletId,
        menuItemId: menuItem.id,
        expectedUpdatedAt: menuItem.updatedAt,
        description: data.description === "" ? null : data.description,
        imageUrl: data.imageUrl === "" ? null : data.imageUrl,
        imageAlt: data.imageAlt === "" ? null : data.imageAlt,
      });

      if (!result.ok) {
        if (result.code === "MENU_NAME_CONFLICT") {
          form.setError("name", { type: "server", message: result.message });
        } else if (result.code === "CATALOG_VERSION_CONFLICT") {
          setDomainError("Data menu telah diubah oleh pengguna lain. Silakan muat ulang.");
        } else {
          setDomainError(result.message);
        }
        setIsSubmitting(false);
      } else {
        await queryClient.invalidateQueries({ queryKey: menuItemKeys().all });
        onSuccess?.(result.data);
        form.reset();
        setIsSubmitting(false);
        onClose();
      }
    } catch {
      setDomainError("Terjadi kesalahan. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose(); }}>
      <DialogContent
        onKeyDown={handleDialogKeyDown}
        onPointerDownOutside={handleOverlayClick}
        onCloseAutoFocus={handleCloseAutoFocus}
        className="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Edit Menu</DialogTitle>
          <DialogDescription>
            Perbarui informasi menu di bawah ini.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit as SubmitHandler<unknown>)} noValidate>
          <div className="grid gap-4 py-4">
            {/* Category selection */}
            <div className="space-y-2">
              <Label htmlFor="edit-categoryId">Kategori *</Label>
              <select
                id="edit-categoryId"
                {...form.register("categoryId")}
                disabled={isSubmitting || categoriesQuery.isLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-invalid={form.formState.errors.categoryId ? "true" : "false"}
                aria-describedby={form.formState.errors.categoryId ? "edit-categoryId-error" : undefined}
              >
                <option value="">Pilih kategori...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} {cat.deletedAt ? "(Arsip)" : ""}
                  </option>
                ))}
              </select>
              {form.formState.errors.categoryId && (
                <p id="edit-categoryId-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
            </div>

            {/* Menu Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nama Menu *</Label>
              <Input
                id="edit-name"
                {...form.register("name")}
                placeholder="Contoh: Nasi Goreng Spesial"
                maxLength={120}
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.name ? "true" : "false"}
                aria-describedby={form.formState.errors.name ? "edit-name-error" : undefined}
              />
              {form.formState.errors.name && (
                <p id="edit-name-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="edit-price">Harga (Rp) *</Label>
              <Input
                id="edit-price"
                type="number"
                min={0}
                step={1}
                {...form.register("price", {
                  setValueAs: (v) => (v === "" ? 0 : Number(v)),
                })}
                placeholder="15000"
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.price ? "true" : "false"}
                aria-describedby={form.formState.errors.price ? "edit-price-error" : undefined}
              />
              {form.formState.errors.price && (
                <p id="edit-price-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.price.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Deskripsi</Label>
              <textarea
                id="edit-description"
                {...form.register("description")}
                placeholder="Deskripsi singkat menu (opsional)"
                maxLength={500}
                rows={3}
                disabled={isSubmitting}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-invalid={form.formState.errors.description ? "true" : "false"}
                aria-describedby={form.formState.errors.description ? "edit-description-error" : undefined}
              />
              {form.formState.errors.description && (
                <p id="edit-description-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.description.message}
                </p>
              )}
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="edit-imageUrl">URL Gambar</Label>
              <Input
                id="edit-imageUrl"
                type="url"
                {...form.register("imageUrl")}
                placeholder="https://example.com/image.jpg"
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.imageUrl ? "true" : "false"}
                aria-describedby={form.formState.errors.imageUrl ? "edit-imageUrl-error" : undefined}
              />
              {form.formState.errors.imageUrl && (
                <p id="edit-imageUrl-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.imageUrl.message}
                </p>
              )}
            </div>

            {/* Sort Order */}
            <div className="space-y-2">
              <Label htmlFor="edit-sortOrder">Urutan</Label>
              <Input
                id="edit-sortOrder"
                type="number"
                min={0}
                max={9999}
                step={1}
                {...form.register("sortOrder", {
                  setValueAs: (v) => (v === "" ? 0 : Number(v)),
                })}
                placeholder="0"
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.sortOrder ? "true" : "false"}
                aria-describedby={form.formState.errors.sortOrder ? "edit-sortOrder-error" : undefined}
              />
              {form.formState.errors.sortOrder && (
                <p id="edit-sortOrder-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.sortOrder.message}
                </p>
              )}
            </div>

            {/* Checkboxes: Active & Sold Out */}
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
              <div className="flex items-center gap-2">
                <input
                  id="edit-isActive"
                  type="checkbox"
                  {...form.register("isActive")}
                  disabled={isSubmitting}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                />
                <Label htmlFor="edit-isActive" className="cursor-pointer mb-0">
                  Aktif
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edit-isSoldOut"
                  type="checkbox"
                  {...form.register("isSoldOut")}
                  disabled={isSubmitting}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                />
                <Label htmlFor="edit-isSoldOut" className="cursor-pointer mb-0">
                  Habis (Sold Out)
                </Label>
              </div>
            </div>

            {domainError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                {domainError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-3 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleAttemptClose}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
