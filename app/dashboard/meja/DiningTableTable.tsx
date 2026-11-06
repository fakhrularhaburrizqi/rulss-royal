"use client";

import React, { useState, useRef } from "react";
import { useDiningTablesQuery } from "./useDiningTablesQuery";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { DiningTableAuthScope } from "@/lib/dashboard/dining-table-query-keys";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";
import { TableCreateDialog } from "./TableCreateDialog";
import { TableEditDialog } from "./TableEditDialog";
import { TableQrDialog } from "./TableQrDialog";
import { QrCode, Download, Printer, LayoutGrid, Table as TableIcon, Plus, CheckCircle, XCircle } from "lucide-react";
import { getTableQrUrl } from "./table-qr-helper";

interface DiningTableTableProps {
  authScope: DiningTableAuthScope;
  outletId: string;
  initialData?: DiningTableSummary[];
  initialDataUpdatedAt?: number;
  canManageTables?: boolean;
}

export function DiningTableTable({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageTables = false,
}: DiningTableTableProps) {
  const { data, isLoading, isError, error, refetch } = useDiningTablesQuery({
    authScope,
    outletId,
    initialData,
    initialDataUpdatedAt,
  });

  const tables = data ?? [];

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTableSummary | null>(null);
  const [qrTable, setQrTable] = useState<DiningTableSummary | null>(null);

  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const editTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const qrTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleDownloadPng = async (table: DiningTableSummary) => {
    const qrUrl = getTableQrUrl(table);
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrUrl)}&format=png`;
    try {
      const response = await fetch(apiUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `QR-Meja-${table.code}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(apiUrl, "_blank");
    }
  };

  const handlePrintAll = () => {
    window.print();
  };

  const activeTables = tables.filter((t) => t.isActive);

  return (
    <div className="space-y-6">
      {/* Non-print Screen UI */}
      <div className="print:hidden space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-800/50 bg-emerald-900 p-5 shadow-lg">
          <div>
            <h2 className="font-mono text-2xl font-bold text-white tracking-wider">Manajemen Meja &amp; QR Code</h2>
            <p className="mt-1 font-mono text-xs text-emerald-100/90 tracking-wide">
              Kelola daftar meja, kapasitas, dan unduh/cetak QR Code untuk pemesanan pelanggan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handlePrintAll}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer border-0"
            >
              <Printer className="h-4 w-4" />
              Cetak Semua QR Code
            </Button>
            <div className="flex rounded-md border border-emerald-700/50 bg-emerald-950/60 p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`h-8 gap-1.5 px-3 text-xs font-semibold cursor-pointer ${
                  viewMode === "grid" ? "bg-white text-emerald-950 font-bold" : "text-emerald-100 hover:text-white"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grid QR
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("table")}
                className={`h-8 gap-1.5 px-3 text-xs font-semibold cursor-pointer ${
                  viewMode === "table" ? "bg-white text-emerald-950 font-bold" : "text-emerald-100 hover:text-white"
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                Tabel
              </Button>
            </div>
            {canManageTables && (
              <Button
                ref={createTriggerRef}
                onClick={() => setIsCreateOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer border-0"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Tambah Meja
              </Button>
            )}
          </div>
        </div>

        {/* Content View */}
        {isLoading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-zinc-400">
            Memuat data meja...
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center text-red-400">
            {(error as Error)?.message ?? "Gagal memuat data meja."}
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3 ml-2 border-red-700 text-red-300">
              Coba Lagi
            </Button>
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-12 text-center text-zinc-500">
            <QrCode className="mx-auto h-12 w-12 text-zinc-600 mb-3" />
            <p className="text-lg font-semibold text-zinc-300">Belum ada meja terdaftar</p>
            <p className="text-sm text-zinc-500 mt-1">Tambahkan meja baru untuk mulai menghasilkan QR Code.</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tables.map((table) => {
              const qrUrl = getTableQrUrl(table);
              const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`;
              return (
                <div
                  key={table.id}
                  className="flex flex-col items-center rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-lg transition-all hover:border-zinc-700"
                >
                  <div className="flex w-full items-center justify-between mb-3">
                    <span className="font-mono text-xs font-semibold text-zinc-400">Kapasitas: {table.capacity} Orang</span>
                    {table.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="h-3 w-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-400 border border-zinc-700">
                        <XCircle className="h-3 w-3" /> Nonaktif
                      </span>
                    )}
                  </div>

                  <h3 className="font-mono text-2xl font-black text-zinc-100 mb-3">Meja {table.code}</h3>

                  <div className="bg-white p-4 rounded-xl border border-zinc-700 shadow-sm inline-block my-2">
                    <img
                      src={qrImgUrl}
                      alt={`QR Meja ${table.code}`}
                      width={160}
                      height={160}
                      className="mx-auto"
                    />
                  </div>

                  <p className="mt-2 text-[11px] font-mono text-zinc-500 truncate max-w-full">
                    /menu?table={table.code}
                  </p>

                  <div className="mt-5 flex w-full flex-wrap gap-2 pt-3 border-t border-zinc-800">
                    <Button
                      type="button"
                      onClick={() => handleDownloadPng(table)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold gap-1.5 cursor-pointer border-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Unduh PNG
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      ref={(el) => {
                        qrTriggerRefs.current[table.id] = el;
                      }}
                      onClick={() => setQrTable(table)}
                      className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-3 cursor-pointer"
                    >
                      QR
                    </Button>
                    {canManageTables && (
                      <Button
                        type="button"
                        variant="outline"
                        ref={(el) => {
                          editTriggerRefs.current[table.id] = el;
                        }}
                        onClick={() => setEditingTable(table)}
                        className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold px-3 cursor-pointer"
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 font-bold">Kode Meja</TableHead>
                  <TableHead className="text-zinc-400 font-bold">Kapasitas</TableHead>
                  <TableHead className="text-zinc-400 font-bold">Status</TableHead>
                  <TableHead className="text-zinc-400 font-bold text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="font-mono font-bold text-zinc-100">Meja {table.code}</TableCell>
                    <TableCell className="text-zinc-300">{table.capacity} orang</TableCell>
                    <TableCell>
                      {table.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/25">
                          Aktif
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-semibold text-zinc-400 border border-zinc-700">
                          Tidak Aktif
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          onClick={() => handleDownloadPng(table)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 h-8 px-3 text-xs rounded-md border border-zinc-700 gap-1 cursor-pointer"
                        >
                          <Download className="h-3 w-3" /> Unduh PNG
                        </Button>
                        {canManageTables && (
                          <>
                            <Button
                              ref={(el) => {
                                qrTriggerRefs.current[table.id] = el;
                              }}
                              onClick={() => setQrTable(table)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 text-xs rounded-md border-0 cursor-pointer"
                            >
                              QR
                            </Button>
                            <Button
                              ref={(el) => {
                                editTriggerRefs.current[table.id] = el;
                              }}
                              onClick={() => setEditingTable(table)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 text-xs rounded-md border-0 cursor-pointer"
                            >
                              Edit
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Print-Only Layout (2x3 or 3x4 grid per A4 page) */}
      <div className="hidden print:block print:bg-white print:text-black print:p-4">
        <div className="grid grid-cols-2 gap-6 print:grid-cols-2 print:gap-4">
          {activeTables.map((table) => {
            const qrUrl = getTableQrUrl(table);
            const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}`;
            return (
              <div
                key={table.id}
                className="border-2 border-black p-6 rounded-xl text-center bg-white text-black flex flex-col items-center justify-center break-inside-avoid page-break-inside-avoid shadow-none"
                style={{ pageBreakInside: "avoid" }}
              >
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-700 mb-1">SCAN UNTUK PESAN MENU</p>
                <h1 className="text-3xl font-black font-mono my-1 tracking-tight text-black">MEJA {table.code}</h1>
                <p className="text-xs text-zinc-600 mb-3 font-semibold">Kapasitas: {table.capacity} Orang</p>
                <div className="bg-white p-3 border-2 border-zinc-900 rounded-xl shadow-none inline-block my-1">
                  <img
                    src={qrImgUrl}
                    alt={`QR Meja ${table.code}`}
                    width={180}
                    height={180}
                    className="mx-auto"
                  />
                </div>
                <p className="mt-3 text-xs font-bold text-zinc-900">
                  Arahkan kamera HP ke QR Code di atas
                </p>
                <p className="text-[9px] text-zinc-600 font-mono mt-0.5">
                  {qrUrl}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <TableCreateDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        outletId={outletId}
        triggerRef={createTriggerRef}
      />

      {editingTable && (
        <TableEditDialog
          isOpen={true}
          onClose={() => setEditingTable(null)}
          outletId={outletId}
          table={editingTable}
          triggerRef={{ current: editTriggerRefs.current[editingTable.id] ?? null }}
        />
      )}

      {qrTable && (
        <TableQrDialog
          isOpen={true}
          onClose={() => setQrTable(null)}
          outletId={outletId}
          table={qrTable}
          triggerRef={{ current: qrTriggerRefs.current[qrTable.id] ?? null }}
        />
      )}
    </div>
  );
}
