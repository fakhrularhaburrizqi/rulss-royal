"use client";

import React, { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";
import type { ActiveMenuCategory, OrderableMenuItem } from "@/lib/services/menu.service";
import type { OrderReceiptData } from "@/lib/services/order-receipt.service";
import { createDirectOrderAction } from "@/app/dashboard/order-actions";
import { openReceiptPrintWindow } from "@/lib/order/receipt";

interface KasirDirectClientProps {
  outletId: string;
  tables: DiningTableSummary[];
  categories: ActiveMenuCategory[];
  menuItems: OrderableMenuItem[];
}

type SuccessState = {
  orderNumber: string;
  total: number;
  receipt: OrderReceiptData;
};

const TAKEAWAY_VALUE = "__TAKEAWAY__";

const actionButtonClass =
  "bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 text-xs rounded-md border-none cursor-pointer";

export function KasirDirectClient({
  outletId,
  tables,
  categories,
  menuItems,
}: KasirDirectClientProps) {
  const [selectedTableId, setSelectedTableId] = useState<string>(TAKEAWAY_VALUE);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeTables = useMemo(() => tables.filter((t) => t.isActive), [tables]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return menuItems;
    return menuItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        categories.some((c) => c.id === item.categoryId && c.name.toLowerCase().includes(q))
    );
  }, [menuItems, categories, search]);

  const itemsByCategory = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: filteredItems.filter((item) => item.categoryId === category.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, filteredItems]);

  const cartLines = useMemo(() => {
    return menuItems
      .filter((item) => (cart[item.id] ?? 0) > 0)
      .map((item) => ({
        item,
        quantity: cart[item.id] ?? 0,
        subtotal: item.price * (cart[item.id] ?? 0),
      }));
  }, [menuItems, cart]);

  const totalQuantity = cartLines.reduce((acc, line) => acc + line.quantity, 0);
  const totalPrice = cartLines.reduce((acc, line) => acc + line.subtotal, 0);

  const formatRupiah = (value: number) =>
    `Rp${value.toLocaleString("id-ID")}`;

  const handleAdd = (itemId: string) => {
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
  };

  const handleDecrease = (itemId: string) => {
    setCart((prev) => {
      const next = (prev[itemId] ?? 0) - 1;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleReset = () => {
    setCart({});
    setCustomerName("");
    setOrderNote("");
    setSearch("");
    setSelectedTableId(TAKEAWAY_VALUE);
    setErrorMessage(null);
    setSuccess(null);
  };

  const handleCheckout = () => {
    if (totalQuantity === 0 || isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await createDirectOrderAction({
        outletId,
        diningTableId: selectedTableId === TAKEAWAY_VALUE ? null : selectedTableId,
        customerName: customerName.trim() || undefined,
        note: orderNote.trim() || undefined,
        items: cartLines.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
        })),
      });

      if (!result.ok) {
        setErrorMessage(result.message);
      } else {
        setSuccess({
          orderNumber: result.data.orderNumber,
          total: result.data.total,
          receipt: result.data.receipt,
        });
      }
    });
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center"
          role="status"
          aria-live="polite"
        >
          <h2 className="text-lg font-bold text-emerald-900">Pesanan Kasir Berhasil Dibuat</h2>
          <p className="mt-2 text-sm text-emerald-800">
            Nomor pesanan: <span className="font-bold">{success.orderNumber}</span>
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Total: <span className="font-bold">{formatRupiah(success.total)}</span>
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Status pesanan langsung menjadi &quot;Selesai&quot; dan masuk ke daftar pesanan.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => openReceiptPrintWindow(success.receipt)}
            className={actionButtonClass}
          >
            Cetak Struk
          </Button>
          <Button onClick={handleReset} variant="outline" className="text-xs">
            Pesanan Baru
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-emerald-950">Kasir Direct (Pesanan Langsung)</h2>
        <p className="text-sm text-emerald-700">
          Masukkan pesanan walk-in untuk meja atau takeaway. Pesanan langsung berstatus Selesai.
        </p>
      </div>

      {errorMessage && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
            <label
              htmlFor="kasir-table"
              className="block text-sm font-medium text-emerald-900"
            >
              Meja / Tipe Pesanan
            </label>
            <select
              id="kasir-table"
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <option value={TAKEAWAY_VALUE}>Takeaway / Dine-in Langsung</option>
              {activeTables.map((table) => (
                <option key={table.id} value={table.id}>
                  Meja {table.code} (kap. {table.capacity})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
            <label htmlFor="kasir-search" className="sr-only">
              Cari menu
            </label>
            <input
              id="kasir-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama menu atau kategori..."
              maxLength={120}
              className="w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            />
          </div>

          {itemsByCategory.length === 0 ? (
            <div className="rounded-lg border border-emerald-900/10 bg-white p-8 text-center text-sm text-emerald-700">
              Tidak ada menu yang cocok dengan pencarian.
            </div>
          ) : (
            <div className="space-y-4">
              {itemsByCategory.map(({ category, items }) => (
                <section key={category.id} className="space-y-2">
                  <h3 className="text-sm font-bold text-emerald-900">{category.name}</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {items.map((item) => {
                      const qty = cart[item.id] ?? 0;
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-900/10 bg-white p-3 shadow-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-emerald-950">
                              {item.name}
                            </p>
                            <p className="text-sm font-bold text-emerald-700">
                              {formatRupiah(item.price)}
                            </p>
                          </div>
                          {qty === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAdd(item.id)}
                              className={actionButtonClass}
                            >
                              Tambah
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDecrease(item.id)}
                                aria-label={`Kurangi ${item.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-900/20 bg-white text-sm font-bold text-emerald-900 hover:bg-emerald-50"
                              >
                                −
                              </button>
                              <span className="min-w-6 text-center text-sm font-bold text-emerald-950">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdd(item.id)}
                                aria-label={`Tambah ${item.name}`}
                                className={actionButtonClass}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm lg:sticky lg:top-4">
          <h3 className="text-base font-bold text-emerald-950">Ringkasan Keranjang</h3>

          {cartLines.length === 0 ? (
            <p className="mt-3 text-sm text-emerald-700">
              Keranjang masih kosong. Pilih menu untuk mulai memesan.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-emerald-900/10">
              {cartLines.map(({ item, quantity, subtotal }) => (
                <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-emerald-950">{item.name}</p>
                      <p className="text-xs text-emerald-800">
                        {formatRupiah(item.price)} x {quantity}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-emerald-950">
                      {formatRupiah(subtotal)}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecrease(item.id)}
                      aria-label={`Kurangi jumlah ${item.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-900/20 bg-white text-sm font-bold text-emerald-900 hover:bg-emerald-50"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-sm font-bold text-emerald-950">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAdd(item.id)}
                      aria-label={`Tambah jumlah ${item.name}`}
                      className={actionButtonClass}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-3 border-t border-emerald-900/10 pt-4">
            <div>
              <label
                htmlFor="kasir-customer-name"
                className="block text-sm font-medium text-emerald-900"
              >
                Nama Pemesan (Opsional)
              </label>
              <input
                id="kasir-customer-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Contoh: Budi"
                maxLength={60}
                className="mt-1 w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label
                htmlFor="kasir-order-note"
                className="block text-sm font-medium text-emerald-900"
              >
                Catatan Pesanan (Opsional)
              </label>
              <textarea
                id="kasir-order-note"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Contoh: Jangan pakai pedas"
                rows={2}
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-emerald-900/10 bg-white px-3 py-2 text-sm font-medium text-emerald-900 placeholder:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-emerald-900/10 pt-4 text-sm font-semibold text-emerald-900">
            <span>Total ({totalQuantity} item)</span>
            <span className="text-lg font-bold text-emerald-950">
              {formatRupiah(totalPrice)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={isPending || totalQuantity === 0}
            className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Memproses..." : "Simpan Pesanan & Selesai"}
          </button>
        </aside>
      </div>
    </div>
  );
}
