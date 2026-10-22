"use client";

import React, { useState, useTransition } from "react";
import { OrderStatus } from "@prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { OrderListItem } from "@/lib/services/order-query.service";
import { updateOrderStatusAction } from "@/app/dashboard/order-actions";
import { openReceiptPrintWindow } from "@/lib/order/receipt";

interface OrderTableProps {
  outletId: string;
  initialOrders: OrderListItem[];
}

export function OrderTable({ outletId, initialOrders }: OrderTableProps) {
  const [orders, setOrders] = useState<OrderListItem[]>(initialOrders);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatRupiah = (value: number) => `Rp${value.toLocaleString("id-ID")}`;

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.RECEIVED:
        return { label: "Diterima", className: "bg-amber-100 text-amber-800" };
      case OrderStatus.PREPARING:
        return { label: "Diproses", className: "bg-blue-100 text-blue-800" };
      case OrderStatus.READY:
        return { label: "Siap", className: "bg-purple-100 text-purple-800" };
      case OrderStatus.COMPLETED:
        return { label: "Selesai", className: "bg-emerald-100 text-emerald-800" };
      case OrderStatus.CANCELLED:
        return { label: "Dibatalkan", className: "bg-red-100 text-red-800" };
      default:
        return { label: status, className: "bg-gray-100 text-gray-800" };
    }
  };

  const handlePrintReceipt = (order: OrderListItem) => {
    openReceiptPrintWindow({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.customerName,
      note: order.note,
      source: order.source,
      total: order.total,
      diningTable: order.diningTable,
      items: order.items.map((item) => ({
        menuNameSnapshot: item.menuNameSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        note: item.note,
      })),
    });
  };

  const handleUpdateStatus = (orderId: string, currentVersion: number, newStatus: OrderStatus) => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await updateOrderStatusAction({
        outletId,
        orderId,
        status: newStatus,
        version: currentVersion,
      });

      if (!result.ok) {
        setErrorMessage(result.message);
      } else {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? { ...o, status: result.data.status, version: result.data.version }
              : o
          )
        );
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-emerald-950">Pesanan Masuk (Live Orders)</h2>
          <p className="text-sm text-emerald-700">Kelola dan pantau status pesanan pelanggan di outlet ini.</p>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 font-semibold" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="rounded-lg border bg-white shadow-sm overflow-x-auto">
        <Table className="w-full min-w-[768px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-emerald-800">No. Pesanan</TableHead>
              <TableHead className="text-emerald-800">Meja / Sumber</TableHead>
              <TableHead className="text-emerald-800">Pelanggan</TableHead>
              <TableHead className="text-emerald-800">Menu Dipesan</TableHead>
              <TableHead className="text-emerald-800 text-right">Total</TableHead>
              <TableHead className="text-emerald-800">Status</TableHead>
              <TableHead className="text-emerald-800 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-emerald-600">
                  Belum ada pesanan masuk.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const statusInfo = getStatusBadge(order.status);
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-bold text-emerald-950 font-mono">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium text-emerald-900">
                        {order.diningTable ? `Meja ${order.diningTable.code}` : "Kasir"}
                      </span>
                      <span className="block text-xs text-gray-500">{order.source}</span>
                    </TableCell>
                    <TableCell className="text-emerald-900">
                      {order.customerName || "-"}
                      {order.note && <span className="block text-xs text-amber-700 italic">Catatan: {order.note}</span>}
                    </TableCell>
                    <TableCell>
                      <ul className="text-xs space-y-1">
                        {order.items.map((item) => (
                          <li key={item.id} className="text-gray-800">
                            <span className="font-bold text-emerald-800">{item.quantity}x</span> {item.menuNameSnapshot}
                            {item.note && <span className="text-gray-500 italic"> ({item.note})</span>}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell className="text-right font-bold text-emerald-950">
                      {formatRupiah(order.total)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {order.status === OrderStatus.RECEIVED && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleUpdateStatus(order.id, order.version, OrderStatus.PREPARING)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                          >
                            Proses
                          </Button>
                        )}
                        {order.status === OrderStatus.PREPARING && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleUpdateStatus(order.id, order.version, OrderStatus.READY)}
                            className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                          >
                            Siap
                          </Button>
                        )}
                        {order.status === OrderStatus.READY && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleUpdateStatus(order.id, order.version, OrderStatus.COMPLETED)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                          >
                            Selesai
                          </Button>
                        )}
                        {order.status === OrderStatus.COMPLETED && (
                          <Button
                            size="sm"
                            onClick={() => handlePrintReceipt(order)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none"
                          >
                            Cetak Struk
                          </Button>
                        )}
                        {order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => handleUpdateStatus(order.id, order.version, OrderStatus.CANCELLED)}
                            className="text-red-600 border-red-200 hover:bg-red-50 text-xs"
                          >
                            Batal
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
