"use client";

import React, { useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CategoryArchiveDialogProps {
  isOpen: boolean;
  mode: "archive" | "restore";
  categoryName: string;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  domainError: string | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  fallbackTriggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function CategoryArchiveDialog({
  isOpen,
  mode,
  categoryName,
  onClose,
  onConfirm,
  isSubmitting,
  domainError,
  triggerRef,
  fallbackTriggerRef,
}: CategoryArchiveDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const isArchive = mode === "archive";

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

  const handleOpenAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    cancelRef.current?.focus();
  }, []);

  const handleCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    const canFocus = (el: HTMLButtonElement | null): el is HTMLButtonElement =>
      !!el && el.isConnected && !el.disabled;
    const primary = triggerRef.current;
    if (canFocus(primary)) {
      primary.focus();
      return;
    }
    const fallback = fallbackTriggerRef?.current ?? null;
    if (canFocus(fallback)) {
      fallback.focus();
      return;
    }
    const stable = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => !b.disabled && b.textContent?.trim() === "Tambah Kategori"
    );
    stable?.focus();
  }, [triggerRef, fallbackTriggerRef]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        onKeyDown={handleDialogKeyDown}
        onPointerDownOutside={handleOverlayClick}
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle>{isArchive ? "Arsipkan Kategori" : "Pulihkan Kategori"}</DialogTitle>
          <DialogDescription>
            {isArchive
              ? `Tandai kategori "${categoryName}" sebagai arsip.`
              : `Batalkan arsip kategori "${categoryName}".`}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {isArchive ? (
            <ul className="list-disc space-y-1 pl-5">
              <li>Kategori ditandai arsip.</li>
              <li>Item menu tidak dihapus.</li>
              <li>Status Aktif kategori tidak berubah.</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pl-5">
              <li>Arsip dibatalkan tanpa mengubah status Aktif.</li>
              <li>Pemulihan dapat gagal karena konflik nama.</li>
            </ul>
          )}
        </div>
        {domainError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {domainError}
          </div>
        )}
        <DialogFooter className="gap-3 sm:space-x-0">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting
              ? isArchive
                ? "Mengarsipkan..."
                : "Memulihkan..."
              : isArchive
                ? "Arsipkan"
                : "Pulihkan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
