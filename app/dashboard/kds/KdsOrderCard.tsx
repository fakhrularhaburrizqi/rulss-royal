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
    <article className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-lg">
      <header className={`flex items-start justify-between gap-3 px-4 py-3 ${meta.bandClass}`}>
        <div className="min-w-0">
          <p className="truncate text-3xl font-black text-zinc-100 leading-none">{tableLabel}</p>
          <p className="mt-1.5 truncate text-sm font-semibold text-zinc-300">
            {order.customerName?.trim() || "Tanpa nama"} · {order.orderNumber}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}>
            {meta.label}
          </span>
          <span
            className={`rounded bg-zinc-900 px-2 py-0.5 text-xl font-black tabular-nums ${waitToneClass(minutes)}`}
            aria-label={`Menunggu ${minutes} menit`}
          >
            {formatWait(minutes)}
          </span>
        </div>
      </header>

      <div className="flex-1 px-4 py-3">
        {order.note && (
          <p className="mb-3 border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm font-bold text-emerald-400">
            Catatan pesanan: {order.note}
          </p>
        )}
        <ol className="divide-y divide-zinc-800">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 py-2.5">
              <span className="w-16 shrink-0 text-right text-4xl font-black leading-none tabular-nums text-zinc-100">
                {item.quantity}
                <span className="text-xl text-zinc-300">x</span>
              </span>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug text-zinc-100">{item.menuNameSnapshot}</p>
                {item.note && (
                  <p className="mt-1 border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-sm font-semibold text-emerald-400">
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
