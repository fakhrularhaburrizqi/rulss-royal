"use client";

import React from "react";

import type { KdsOrder } from "@/lib/services/kds-query.service";
import { KDS_STATUS_META, formatWait, waitMinutesSince, waitToneClass } from "./kds-status";

interface KdsOrderCardProps {
  order: KdsOrder;
  now: number;
  isPending: boolean;
  onAdvance: (order: KdsOrder) => void;
}

export function KdsOrderCard({ order, now, isPending, onAdvance }: KdsOrderCardProps) {
  const meta = KDS_STATUS_META[order.status];
  const minutes = waitMinutesSince(order.createdAt, now);
  const tableLabel = order.diningTable ? `Meja ${order.diningTable.code}` : "Tanpa Meja";
  const canAdvance = meta.nextStatus !== null;

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border-2 border-emerald-800 bg-white shadow-xl">
      <header className={`flex items-start justify-between gap-3 px-4 py-3 ${meta.bandClass}`}>
        <div className="min-w-0">
          <p className="truncate text-3xl font-black leading-none">{tableLabel}</p>
          <p className="mt-1.5 truncate text-sm font-semibold">
            {order.customerName?.trim() || "Tanpa nama"} · {order.orderNumber}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}>
            {meta.label}
          </span>
          <span
            className={`rounded bg-emerald-900 px-2 py-0.5 text-xl font-black tabular-nums ${waitToneClass(minutes)}`}
            aria-label={`Menunggu ${minutes} menit`}
          >
            {formatWait(minutes)}
          </span>
        </div>
      </header>

      <div className="flex-1 px-4 py-3">
        {order.note && (
          <p className="mb-3 border-2 border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
            Catatan pesanan: {order.note}
          </p>
        )}
        <ol className="divide-y divide-emerald-200">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <span className="w-16 shrink-0 text-right text-4xl font-black leading-none tabular-nums text-emerald-900">
                {item.quantity}
                <span className="text-xl">x</span>
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-emerald-950">{item.menuNameSnapshot}</p>
                {item.note && (
                  <p className="mt-1 border-2 border-emerald-400 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-900">
                    Catatan: {item.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <footer className="px-4 pb-4">
        <button
          type="button"
          disabled={isPending || !canAdvance}
          onClick={() => onAdvance(order)}
          className={`min-h-14 w-full rounded-md px-4 text-lg font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60 ${meta.actionClass}`}
        >
          {isPending ? "Memproses..." : meta.actionLabel}
        </button>
      </footer>
    </article>
  );
}
