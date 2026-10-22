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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTableSummary | null>(null);
  const [qrTable, setQrTable] = useState<DiningTableSummary | null>(null);

  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const editTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const qrTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-emerald-950">Manajemen Meja</h2>
          <p className="text-sm text-emerald-700">Kelola daftar meja dan kapasitas untuk outlet ini.</p>
        </div>
        {canManageTables && (
          <Button
            ref={createTriggerRef}
            onClick={() => setIsCreateOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Tambah Meja
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode Meja</TableHead>
              <TableHead>Kapasitas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Memuat data meja...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-red-600">
                  {(error as Error)?.message ?? "Gagal memuat data meja."}
                  <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-2">
                    Coba Lagi
                  </Button>
                </TableCell>
              </TableRow>
            ) : tables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  Belum ada meja terdaftar.
                </TableCell>
              </TableRow>
            ) : (
              tables.map((table) => (
                <TableRow key={table.id}>
                  <TableCell className="font-medium text-emerald-950">{table.code}</TableCell>
                  <TableCell className="text-emerald-900">{table.capacity} orang</TableCell>
                  <TableCell>
                    {table.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        Tidak Aktif
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManageTables && (
                      <div className="flex justify-end gap-2">
                        <Button
                          ref={(el) => {
                            qrTriggerRefs.current[table.id] = el;
                          }}
                          onClick={() => setQrTable(table)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer"
                        >
                          QR
                        </Button>
                        <Button
                          ref={(el) => {
                            editTriggerRefs.current[table.id] = el;
                          }}
                          onClick={() => setEditingTable(table)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer"
                        >
                          Edit
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
