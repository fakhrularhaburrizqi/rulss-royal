"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { OrderStatus } from "@prisma/client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Utensils, Volume2, VolumeX } from "lucide-react";

import { fetchKdsOrders } from "@/lib/api/kds-orders";
import { updateOrderStatusAction } from "@/app/dashboard/order-actions";
import type { KdsOrder } from "@/lib/services/kds-query.service";
import { KdsOrderCard } from "./KdsOrderCard";
import { supabase } from "./kds-supabase";
import {
  KDS_ACTIVE_STATUSES,
  KDS_FILTERS,
  nextStatusFor,
  type KdsFilterId,
} from "./kds-status";
import { isSoundEnabled, playOrderBell, setSoundEnabled, unlockKdsAudio } from "./kds-sound";

const POLL_INTERVAL_MS = 4000;

type StatusOverride = { status: OrderStatus; version: number };

interface KdsBoardProps {
  outletId: string;
  outletName: string;
  initialOrders: KdsOrder[];
}

function matchesFilter(order: KdsOrder, filter: KdsFilterId): boolean {
  const definition = KDS_FILTERS.find((entry) => entry.id === filter);
  if (!definition) return true;
  return definition.statuses.includes(order.status);
}

function KdsBoardInner({ outletId, outletName, initialOrders }: KdsBoardProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<KdsFilterId>("semua");
  const [overrides, setOverrides] = useState<Record<string, StatusOverride>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const knownIdsRef = useRef<Set<string> | null>(null);

  const { data, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["kds-orders", outletId],
    queryFn: ({ signal }) => fetchKdsOrders(outletId, signal),
    initialData: initialOrders,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 1,
  });

  useEffect(() => {
    setSoundOn(isSoundEnabled());
  }, []);

  useEffect(() => {
    const unlock = () => unlockKdsAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data) return;
    const ids = data.map((order) => order.id);
    if (knownIdsRef.current === null) {
      knownIdsRef.current = new Set(ids);
      return;
    }
    const known = knownIdsRef.current;
    const hasNewOrder = ids.some((id) => !known.has(id));
    knownIdsRef.current = new Set(ids);
    if (hasNewOrder && soundOn) {
      playOrderBell();
    }
  }, [data, soundOn]);

  useEffect(() => {
    const channel = supabase
      .channel("kds-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public" },
        (payload) => {
          const table = payload.table;
          if (
            table === "CustomerOrder" ||
            table === "orders" ||
            table === "OrderItem" ||
            table === "order_items"
          ) {
            void refetch();
            if (table === "CustomerOrder" || table === "orders") {
              if (soundOn) {
                playOrderBell();
              }
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public" },
        (payload) => {
          const table = payload.table;
          if (
            table === "CustomerOrder" ||
            table === "orders" ||
            table === "OrderItem" ||
            table === "order_items"
          ) {
            void refetch();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, soundOn]);

  useEffect(() => {
    if (!data || data.length === 0) return;
    setOverrides((prev) => {
      const entries = Object.entries(prev);
      if (entries.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const [orderId, override] of entries) {
        const serverOrder = data.find((order) => order.id === orderId);
        if (!serverOrder || serverOrder.version >= override.version) {
          delete next[orderId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const orders = useMemo(
    () =>
      (data ?? []).map((order) => {
        const override = overrides[order.id];
        return override ? { ...order, ...override } : order;
      }),
    [data, overrides]
  );

  const activeOrders = useMemo(
    () => orders.filter((order) => KDS_ACTIVE_STATUSES.includes(order.status)),
    [orders]
  );

  const counts = useMemo(() => {
    const result: Record<KdsFilterId, number> = { semua: 0, proses: 0, siap: 0 };
    for (const order of activeOrders) {
      if (order.status === OrderStatus.RECEIVED || order.status === OrderStatus.PREPARING) {
        result.proses += 1;
      }
      if (order.status === OrderStatus.READY) {
        result.siap += 1;
      }
    }
    result.semua = activeOrders.length;
    return result;
  }, [activeOrders]);

  const visibleOrders = useMemo(
    () => activeOrders.filter((order) => matchesFilter(order, filter)),
    [activeOrders, filter]
  );

  const handleAdvance = async (order: KdsOrder) => {
    const nextStatus = nextStatusFor(order.status);
    if (!nextStatus || pendingId) return;

    setActionError(null);
    setPendingId(order.id);
    setOverrides((prev) => ({
      ...prev,
      [order.id]: { status: nextStatus, version: order.version + 1 },
    }));

    try {
      const result = await updateOrderStatusAction({
        outletId,
        orderId: order.id,
        status: nextStatus,
        version: order.version,
      });

      if (result.ok) {
        setOverrides((prev) => ({
          ...prev,
          [order.id]: { status: result.data.status, version: result.data.version },
        }));
        void queryClient.invalidateQueries({ queryKey: ["kds-orders", outletId] });
      } else {
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        setActionError(result.message);
      }
    } catch {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      setActionError("Gagal memperbarui status pesanan. Silakan coba lagi.");
    } finally {
      setPendingId(null);
    }
  };

  const toggleSound = () => {
    const enabled = !soundOn;
    setSoundOn(enabled);
    setSoundEnabled(enabled);
    unlockKdsAudio();
    if (enabled) {
      playOrderBell();
    }
  };

  const errorMessage = (error as Error | null)?.message ?? "";

  return (
    <section aria-label="Papan pesanan dapur" className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-zinc-100">KDS Dapur</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-zinc-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" aria-hidden="true" />
              {outletName} · pembaruan otomatis tiap {POLL_INTERVAL_MS / 1000} detik
              {isFetching && <span className="text-zinc-400">· memperbarui...</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
            {soundOn ? "Suara aktif" : "Suara mati"}
          </button>
        </div>

        <div
          role="group"
          aria-label="Filter pesanan"
          className="mt-4 flex flex-wrap gap-2"
        >
          {KDS_FILTERS.map((entry) => {
            const isActive = filter === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(entry.id)}
                className={`min-h-10 rounded-full border px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  isActive
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                {entry.label}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? "bg-zinc-900 text-white" : "bg-zinc-800/50 text-zinc-400"
                  }`}
                >
                  {counts[entry.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-bold text-zinc-200"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="min-h-9 rounded-md border border-zinc-700 px-3 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
          >
            Tutup
          </button>
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm font-bold text-zinc-200"
        >
          <span>{errorMessage || "Gagal memperbarui data pesanan."}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="min-h-9 rounded-md border border-zinc-700 px-3 text-xs font-bold text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-600"
          >
            Coba lagi
          </button>
        </div>
      )}

      {visibleOrders.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <Utensils className="mx-auto h-12 w-12 text-zinc-500 mb-4" aria-hidden="true" />
          <p className="text-zinc-200 font-semibold text-lg">
            Belum ada pesanan masuk
          </p>
          <p className="text-zinc-500 text-sm mt-1">
            Pesanan baru akan langsung muncul di sini tanpa perlu memuat ulang halaman.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleOrders.map((order) => (
            <KdsOrderCard
              key={order.id}
              order={order}
              now={now}
              isPending={pendingId === order.id}
              onAdvance={handleAdvance}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KdsBoardScope({ outletId, outletName, initialOrders }: KdsBoardProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 0,
            gcTime: 1000 * 60 * 10,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <KdsBoardInner
        outletId={outletId}
        outletName={outletName}
        initialOrders={initialOrders ?? []}
      />
    </QueryClientProvider>
  );
}

export function KdsBoard(props: KdsBoardProps) {
  const scopeKey = JSON.stringify([props.outletId]);
  return <KdsBoardScope key={scopeKey} {...props} />;
}
