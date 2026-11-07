"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateMenuItemAction } from "@/app/dashboard/menu-actions";
import { menuItemKeys } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem } from "@/lib/services/menu-item-query.service";
import { MAX_MENU_STOCK } from "@/lib/order/constants";

interface MenuStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  menuItem: ManagementMenuItemListItem;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MenuStockDialog({
  isOpen,
  onClose,
  outletId,
  menuItem,
  triggerRef,
}: MenuStockDialogProps) {
  const queryClient = useQueryClient();
  const [stock, setStock] = useState<number>(menuItem.stock);
  const [isSoldOut, setIsSoldOut] = useState<boolean>(menuItem.isSoldOut);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStock(menuItem.stock);
      setIsSoldOut(menuItem.isSoldOut);
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [isOpen, menuItem]);

  const handleAttemptClose = useCallback(() => {
    if (isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (!isSubmitting) {
        handleAttemptClose();
      }
    },
    [isSubmitting, handleAttemptClose]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_MENU_STOCK) {
      setErrorMessage(`Stok harus bilangan bulat antara 0 dan ${MAX_MENU_STOCK}.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await updateMenuItemAction({
        outletId,
        menuItemId: menuItem.id,
        expectedUpdatedAt: menuItem.updatedAt,
        stock,
        isSoldOut,
      });

      if (!result.ok) {
        setErrorMessage(
          result.code === "CATALOG_VERSION_CONFLICT"
            ? "Data menu telah diubah oleh pengguna lain. Silakan muat ulang."
            : result.message
        );
        setIsSubmitting(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: menuItemKeys().all });
      setIsSubmitting(false);
      onClose();
    } catch {
      setErrorMessage("Terjadi kesalahan. Silakan coba lagi.");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleAttemptClose(); }}>
      <DialogContent
        onKeyDown={handleKeyDown}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef?.current?.focus();
        }}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Atur Stok Menu</DialogTitle>
          <DialogDescription>
            Perbarui ketersediaan stok untuk {menuItem.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="rounded-lg border border-emerald-900/10 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Stok saat ini: <span className="font-bold">{menuItem.stock}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-stock">Stok Tersedia</Label>
              <Input
                id="quick-stock"
                type="number"
                min={0}
                max={MAX_MENU_STOCK}
                step={1}
                value={Number.isNaN(stock) ? "" : stock}
                onChange={(event) => {
                  const value = event.target.value;
                  setStock(value === "" ? 0 : Number(value));
                }}
                disabled={isSubmitting}
                aria-invalid={errorMessage ? "true" : "false"}
                aria-describedby={errorMessage ? "quick-stock-error" : "quick-stock-hint"}
              />
              <p id="quick-stock-hint" className="text-xs text-emerald-700">
                Stok 0 membuat menu otomatis berstatus habis.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="quick-sold-out"
                type="checkbox"
                checked={isSoldOut}
                onChange={(event) => setIsSoldOut(event.target.checked)}
                disabled={isSubmitting}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-2"
              />
              <Label htmlFor="quick-sold-out" className="cursor-pointer mb-0">
                Tandai habis (sold out)
              </Label>
            </div>

            {errorMessage && (
              <div
                id="quick-stock-error"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                {errorMessage}
              </div>
            )}
          </div>

          <DialogFooter className="gap-3 sm:space-x-0">
            <Button type="button" variant="outline" onClick={handleAttemptClose} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Simpan Stok"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
