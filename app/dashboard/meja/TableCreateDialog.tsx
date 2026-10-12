"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createTableAction } from "@/app/dashboard/table-actions";
import { tableCreateSchema, type TableCreateInput } from "@/lib/validators/table.validator";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

interface TableCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onSuccess?: (data: DiningTableSummary) => void;
}

export function TableCreateDialog({
  isOpen,
  onClose,
  outletId,
  triggerRef,
  onSuccess,
}: TableCreateDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const form = useForm<TableCreateInput>({
    resolver: zodResolver(tableCreateSchema) as unknown as undefined,
    defaultValues: {
      outletId,
      code: "",
      capacity: 4,
      isActive: true,
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      form.reset({
        outletId,
        code: "",
        capacity: 4,
        isActive: true,
      });
      setDomainError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, outletId, form]);

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

  const onSubmit: SubmitHandler<TableCreateInput> = async (data) => {
    setIsSubmitting(true);
    setDomainError(null);

    try {
      const result = await createTableAction({
        ...data,
        outletId,
        code: data.code.toUpperCase(),
        capacity: Number(data.capacity),
      });

      if (!result.ok) {
        if (result.code === "TABLE_CODE_CONFLICT") {
          form.setError("code", { type: "server", message: "Kode meja sudah digunakan di outlet ini." });
        } else {
          setDomainError(result.message);
        }
        setIsSubmitting(false);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["tables"] });
        await queryClient.invalidateQueries({ queryKey: ["tables", outletId] });
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
        className="max-w-md max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Tambah Meja Baru</DialogTitle>
          <DialogDescription>
            Isi formulir di bawah untuk menambahkan meja baru ke outlet ini.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit as SubmitHandler<unknown>)} noValidate>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Meja *</Label>
              <Input
                id="code"
                {...form.register("code", {
                  onChange: (e) => {
                    const upper = e.target.value.toUpperCase();
                    form.setValue("code", upper, { shouldValidate: true, shouldDirty: true });
                  },
                })}
                placeholder="Contoh: M01"
                maxLength={20}
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.code ? "true" : "false"}
                aria-describedby={form.formState.errors.code ? "code-error" : undefined}
                className="uppercase"
              />
              {form.formState.errors.code && (
                <p id="code-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.code.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">Kapasitas (Orang)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={100}
                step={1}
                {...form.register("capacity", {
                  setValueAs: (value) => (value === "" ? 4 : Number(value)),
                })}
                placeholder="4"
                disabled={isSubmitting}
                aria-invalid={form.formState.errors.capacity ? "true" : "false"}
                aria-describedby={form.formState.errors.capacity ? "capacity-error" : undefined}
              />
              {form.formState.errors.capacity && (
                <p id="capacity-error" className="text-sm text-red-600" role="alert">
                  {form.formState.errors.capacity.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
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
