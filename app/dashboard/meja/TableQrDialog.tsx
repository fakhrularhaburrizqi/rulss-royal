"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateTableTokenAction, getTableQrAction } from "@/app/dashboard/table-actions";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";
import { getTableQrUrl } from "./table-qr-helper";

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
  const [token, setToken] = useState<string | null>(table.qrToken ?? null);
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
            setToken(table.qrToken ?? null);
          }
        })
        .catch(() => {
          setToken(table.qrToken ?? null);
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }
  }, [isOpen, table.id, outletId, table.qrToken]);

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

  const publicUrl = getTableQrUrl(table, token);

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
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 max-w-md w-full text-zinc-100"
      >
        <DialogHeader>
          <DialogTitle className="text-white font-mono font-semibold text-lg">
            QR Code Meja: {table.code}
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs font-mono">
            URL target QR Code untuk akses pemesanan pelanggan di meja ini.
          </DialogDescription>
        </DialogHeader>

        <div className="border-t border-zinc-800 my-4" />

        <div className="space-y-4 py-2">
          {!token ? (
            <div className="space-y-4">
              <p className="text-sm text-zinc-300">Buat token aman atau gunakan URL langsung untuk meja {table.code}.</p>

              {error && (
                <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300" role="alert">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isGenerating}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  {isGenerating ? "Menghasilkan..." : "Buat Token QR"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-700">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`}
                    alt={`QR Code Meja ${table.code}`}
                    width={180}
                    height={180}
                    className="mx-auto"
                  />
                </div>
                <p className="mt-3 font-mono text-xs font-bold text-zinc-200">Meja: {table.code}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="qr-url" className="text-zinc-300 text-xs font-mono">URL Publik Pelanggan</Label>
                <div className="flex gap-2">
                  <Input
                    id="qr-url"
                    readOnly
                    value={publicUrl}
                    className="bg-zinc-950 border-zinc-800 text-zinc-200 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopy}
                    className="shrink-0 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
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
                  className="flex-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                >
                  Buka Tautan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                  className="flex-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                >
                  Cetak / Print
                </Button>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
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
