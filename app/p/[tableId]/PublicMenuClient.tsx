"use client";

import React, { useState, useTransition } from "react";
import Image from "next/image";
import type { PublicCatalogResult } from "@/lib/services/public-menu.service";
import { createPublicOrderAction } from "./actions";

interface PublicMenuClientProps {
  catalog: PublicCatalogResult;
  tableId: string;
  token: string;
}

export function PublicMenuClient({ catalog, tableId, token }: PublicMenuClientProps) {
  const { table, categories, menuItems } = catalog;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: string; orderNumber: string } | null>(null);

  const formatRupiah = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleAddToCart = (itemId: string) => {
    if (orderSuccess) return;
    setCart((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? 0) + 1,
    }));
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] ?? 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const cartItems = menuItems
    .filter((item) => (cart[item.id] ?? 0) > 0)
    .map((item) => ({
      item,
      quantity: cart[item.id] ?? 0,
      subtotal: item.price * (cart[item.id] ?? 0),
    }));

  const totalQuantity = cartItems.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalPrice = cartItems.reduce((acc, curr) => acc + curr.subtotal, 0);

  const handleCheckout = () => {
    if (totalQuantity === 0 || isPending) return;
    setErrorMessage(null);
    startTransition(async () => {
      const result = await createPublicOrderAction({
        tableId,
        token,
        customerName: customerName.trim() || undefined,
        note: orderNote.trim() || undefined,
        items: cartItems.map(({ item, quantity }) => ({
          menuItemId: item.id,
          quantity,
        })),
      });

      if (!result.ok) {
        setErrorMessage(result.message);
      } else {
        setOrderSuccess(result.data);
        setIsCartOpen(false);
      }
    });
  };

  if (orderSuccess) {
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 p-8 shadow-md w-full space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 font-bold text-xl">
            ✓
          </div>
          <h1 className="text-xl font-bold text-emerald-950 dark:text-emerald-100">Pesanan Berhasil Dibuat!</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Nomor Pesanan Anda: <span className="font-bold text-emerald-700 dark:text-emerald-400 text-base">{orderSuccess.orderNumber}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Meja: {table.code}. Mohon tunggu, pesanan Anda sedang disiapkan oleh dapur.
          </p>
          <button
            type="button"
            onClick={() => {
              setOrderSuccess(null);
              setCart({});
              setCustomerName("");
              setOrderNote("");
            }}
            className="w-full mt-4 rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors"
          >
            Pesan Menu Lainnya
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-900 min-h-screen pb-28 shadow-md relative">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-emerald-700 dark:bg-emerald-800 text-white p-4 shadow-sm flex items-center justify-between">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <Image
              src="/logo.png"
              alt="Rulss Royal Logo"
              width={64}
              height={64}
              className="rounded-full object-cover shadow-lg border-2 border-emerald-500/50 dark:border-emerald-400/50"
            />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Menu Rulss Royal</h1>
          </div>
          <span className="rounded-full bg-emerald-800 dark:bg-emerald-900 px-3 py-1 text-xs font-semibold">
            Meja: {table.code}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-6">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
            Belum ada kategori menu yang tersedia.
          </div>
        ) : (
          categories.map((category) => {
            const itemsInCategory = menuItems.filter((item) => item.categoryId === category.id);
            if (itemsInCategory.length === 0) return null;

            return (
              <section key={category.id} className="space-y-3">
                <h2 className="text-md font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-1">
                  {category.name}
                </h2>
                <div className="space-y-3">
                  {itemsInCategory.map((item) => {
                    const qtyInCart = cart[item.id] ?? 0;
                    return (
                      <div
                        key={item.id}
                        onClick={() => !item.isSoldOut && handleAddToCart(item.id)}
                        className={`flex justify-between items-start bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all ${
                          item.isSoldOut ? "opacity-60 grayscale cursor-not-allowed" : "cursor-pointer hover:border-emerald-600 dark:hover:border-emerald-500"
                        }`}
                      >
                        <div className="space-y-1 flex-1 pr-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{item.name}</h3>
                            {item.isSoldOut && (
                              <span className="rounded bg-red-100 dark:bg-red-900 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                                Habis
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>
                          )}
                          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 pt-1">
                            {formatRupiah(item.price)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end justify-between h-full">
                          {qtyInCart > 0 && (
                            <span className="rounded-full bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-2">
                              {qtyInCart}
                            </span>
                          )}
                          {!item.isSoldOut && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddToCart(item.id);
                              }}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                            >
                              + Tambah
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Floating Bottom Bar */}
      {totalQuantity > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 max-w-md mx-auto bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{totalQuantity} item terpilih</p>
            <p className="text-base font-bold text-emerald-950 dark:text-emerald-100">{formatRupiah(totalPrice)}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors shadow"
          >
            Lihat Keranjang &amp; Checkout
          </button>
        </div>
      )}

      {/* Cart Drawer / Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex flex-col justify-end max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Keranjang Pesanan</h2>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300 font-semibold">
                {errorMessage}
              </div>
            )}

            <div className="space-y-3 divide-y divide-gray-200 dark:divide-gray-700">
              {cartItems.map(({ item, quantity, subtotal }) => (
                <div key={item.id} className="pt-3 first:pt-0 flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatRupiah(item.price)} x {quantity}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-emerald-900 dark:text-emerald-300">{formatRupiah(subtotal)}</span>
                    <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200"
                      >
                        -
                      </button>
                      <span className="px-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama Pemesan (Opsional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Budi"
                  maxLength={60}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan Pesanan (Opsional)</label>
                <textarea
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  placeholder="Contoh: Jangan pakai pedas"
                  rows={2}
                  maxLength={200}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <div className="flex justify-between items-center text-sm font-semibold text-gray-700 dark:text-gray-300">
                <span>Total Pembayaran</span>
                <span className="text-lg font-bold text-emerald-900 dark:text-emerald-300">{formatRupiah(totalPrice)}</span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isPending || totalQuantity === 0}
                className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
              >
                {isPending ? "Memproses Pesanan..." : "Checkout & Kirim Pesanan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
