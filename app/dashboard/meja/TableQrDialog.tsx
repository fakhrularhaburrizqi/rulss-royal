"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateTableTokenAction, getTableQrAction } from "@/app/dashboard/table-actions";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

interface TableQrDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outletId: string;
  table: DiningTableSummary;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export function TableQrDialog({
  isOpen,
  onClose,
  outletId,
  table,
  triggerRef,
}: TableQrDialogProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsGenerating(true);
      setError(null);
      setCopied(false);
      getTableQrAction({ tableId: table.id, outletId })
        .then((res) => {
          if (res?.ok && res.data?.token) {
            setToken(res.data.token);
          } else {
            setToken(null);
          }
        })
        .catch(() => {
          setToken(null);
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }
  }, [isOpen, table.id, outletId]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateTableTokenAction({
        tableId: table.id,
        outletId,
      });

      if (!result?.ok || !result.data?.token) {
        setError(result?.ok ? "Terjadi kesalahan. Silakan coba lagi." : (result?.message ?? "Terjadi kesalahan. Silakan coba lagi."));
        setIsGenerating(false);
      } else {
        setToken(result.data.token);
        setIsGenerating(false);
      }
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
      setIsGenerating(false);
    }
  };

  const publicUrl = token && typeof window !== "undefined"
    ? `${window.location.origin}/p/${table.id}?token=${token}`
    : "";

  const handleCopy = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback or error
    }
  };

  const handleCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    triggerRef?.current?.focus();
  }, [triggerRef]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        onCloseAutoFocus={handleCloseAutoFocus}
        className="max-w-md max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>QR Code Meja: {table.code}</DialogTitle>
          <DialogDescription>
            Kelola dan buat kode QR untuk akses pemesanan pelanggan di meja ini.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!token ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
                Menghasilkan QR baru akan membuat QR lama tidak berlaku.
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isGenerating}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isGenerating ? "Menghasilkan..." : "Generate QR Baru"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                <div className="bg-white p-3 rounded-lg shadow-sm border">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(publicUrl)}`}
                    alt={`QR Code Meja ${table.code}`}
                    width={160}
                    height={160}
                    className="mx-auto"
                  />
                </div>
                <p className="mt-2 text-xs font-semibold text-emerald-950">Meja: {table.code}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qr-url">URL Publik Pelanggan</Label>
                <div className="flex gap-2">
                  <Input
                    id="qr-url"
                    readOnly
                    value={publicUrl}
                    className="bg-muted text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? "Tersalin!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(publicUrl, "_blank")}
                  className="flex-1 text-xs"
                >
                  Buka Tautan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                  className="flex-1 text-xs"
                >
                  Cetak / Print
                </Button>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  Tutup
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
