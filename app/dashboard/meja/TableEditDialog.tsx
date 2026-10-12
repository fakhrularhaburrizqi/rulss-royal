"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateTableAction } from "@/app/dashboard/table-actions";
import { tableUpdateSchema, type TableUpdateInput } from "@/lib/validators/table.validator";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

interface TableEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  table: DiningTableSummary;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  onSuccess?: (data: DiningTableSummary) => void;
}

export function TableEditDialog({
  isOpen,
  onClose,
  outletId,
  table,
  triggerRef,
  onSuccess,
}: TableEditDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);

  const form = useForm<TableUpdateInput>({
    resolver: zodResolver(tableUpdateSchema) as unknown as undefined,
    defaultValues: {
      outletId,
      tableId: table?.id ?? "",
      expectedUpdatedAt: table?.updatedAt ?? "",
      code: table?.code ?? "",
      capacity: table?.capacity ?? 4,
    },
  });

  // Reset form when dialog opens or table changes
  useEffect(() => {
    if (isOpen && table) {
      form.reset({
        outletId,
        tableId: table.id,
        expectedUpdatedAt: table.updatedAt,
        code: table.code,
        capacity: table.capacity,
      });
      setDomainError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, table, outletId, form]);

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

  const onSubmit: SubmitHandler<TableUpdateInput> = async (data) => {
    setIsSubmitting(true);
    setDomainError(null);

    try {
      const result = await updateTableAction({
        outletId,
        tableId: table.id,
        expectedUpdatedAt: table.updatedAt,
        code: data.code !== undefined && data.code !== "" ? data.code.toUpperCase() : undefined,
        capacity: data.capacity !== undefined ? Number(data.capacity) : undefined,
      });

      if (!result.ok) {
        if (result.code === "TABLE_CODE_CONFLICT") {
          form.setError("code", { type: "server", message: "Kode meja sudah digunakan di outlet ini." });
        } else if (result.code === "TABLE_VERSION_CONFLICT") {
          setDomainError("Data meja telah diubah oleh pengguna lain. Silakan muat ulang.");
        } else {
          setDomainError(result.message);
        }
        setIsSubmitting(false);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["tables"] });
        await queryClient.invalidateQueries({ queryKey: ["tables", outletId] });
        onSuccess?.(result.data);
        form.reset({
          outletId,
          tableId: result.data.id,
          expectedUpdatedAt: result.data.updatedAt,
          code: result.data.code,
          capacity: result.data.capacity,
        });
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
          <DialogTitle>Edit Meja</DialogTitle>
          <DialogDescription>
            Ubah informasi meja di bawah ini.
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
                max={99}
                step={1}
                {...form.register("capacity", {
                  setValueAs: (value) => (value === "" ? undefined : Number(value)),
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
              {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
