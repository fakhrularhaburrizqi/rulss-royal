"use client";

import React, { useCallback } from "react";
import { useForm } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CategoryCreateInput } from "@/lib/validators/menu.validator";

interface CategoryCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onSubmit: (data: CategoryCreateInput) => Promise<void>;
  domainError: string | null;
  form: ReturnType<typeof useForm<CategoryCreateInput>>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function CategoryCreateDialog({
  isOpen,
  onClose,
  isSubmitting,
  onSubmit,
  domainError,
  form,
  triggerRef,
}: CategoryCreateDialogProps) {
  // Prevent close on Escape/outside when pending
  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isSubmitting) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isSubmitting]);

  const handleOverlayClick = useCallback((e: Event) => {
    if (isSubmitting && e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isSubmitting]);

  const handleCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    triggerRef.current?.focus();
  }, [triggerRef]);

  // Handle form submit - forward to owner
  const handleFormSubmit = useCallback(async (data: CategoryCreateInput) => {
    await onSubmit(data);
  }, [onSubmit]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          onKeyDown={handleDialogKeyDown}
          onPointerDownOutside={handleOverlayClick}
          onCloseAutoFocus={handleCloseAutoFocus}
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Tambah Kategori</DialogTitle>
            <DialogDescription>
              Isi formulir di bawah untuk menambahkan kategori baru.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} noValidate>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Kategori *</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Masukkan nama kategori"
                  maxLength={80}
                  disabled={isSubmitting}
                  aria-invalid={form.formState.errors.name ? "true" : "false"}
                  aria-describedby={form.formState.errors.name ? "name-error" : undefined}
                />
                {form.formState.errors.name && (
                  <p id="name-error" className="text-sm text-red-600" role="alert">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Urutan</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  min={0}
                  max={9999}
                  step={1}
                  {...form.register("sortOrder", {
                    setValueAs: (value) => (value === "" ? 0 : Number(value)),
                  })}
                  placeholder="0"
                  disabled={isSubmitting}
                  aria-invalid={form.formState.errors.sortOrder ? "true" : "false"}
                  aria-describedby={form.formState.errors.sortOrder ? "sortOrder-error" : undefined}
                />
                {form.formState.errors.sortOrder && (
                  <p id="sortOrder-error" className="text-sm text-red-600" role="alert">
                    {form.formState.errors.sortOrder.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="isActive">Aktif</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="isActive"
                    type="checkbox"
                    {...form.register("isActive")}
                    disabled={isSubmitting}
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
                  />
                  <Label htmlFor="isActive" className="cursor-pointer mb-0">
                    Aktif
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
                onClick={onClose}
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
    </>
  );
}