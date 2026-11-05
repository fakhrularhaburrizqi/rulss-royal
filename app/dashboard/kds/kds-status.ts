import { OrderStatus } from "@prisma/client";

export type KdsFilterId = "semua" | "proses" | "siap";

export type KdsStatusMeta = {
  label: string;
  bandClass: string;
  badgeClass: string;
  actionLabel: string;
  actionClass: string;
  nextStatus: OrderStatus | null;
};

export const KDS_STATUS_META: Record<OrderStatus, KdsStatusMeta> = {
  [OrderStatus.RECEIVED]: {
    label: "Menunggu",
    bandClass: "bg-amber-300 text-zinc-950",
    badgeClass: "bg-zinc-950 text-white",
    actionLabel: "Proses Sekarang",
    actionClass: "bg-sky-400 text-zinc-950 hover:bg-sky-500",
    nextStatus: OrderStatus.PREPARING,
  },
  [OrderStatus.PREPARING]: {
    label: "Diproses",
    bandClass: "bg-sky-300 text-zinc-950",
    badgeClass: "bg-zinc-950 text-white",
    actionLabel: "Tandai Siap",
    actionClass: "bg-emerald-400 text-zinc-950 hover:bg-emerald-500",
    nextStatus: OrderStatus.READY,
  },
  [OrderStatus.READY]: {
    label: "Siap Disajikan",
    bandClass: "bg-emerald-300 text-zinc-950",
    badgeClass: "bg-zinc-950 text-white",
    actionLabel: "Selesaikan",
    actionClass: "bg-zinc-950 text-white hover:bg-zinc-800",
    nextStatus: OrderStatus.COMPLETED,
  },
  [OrderStatus.COMPLETED]: {
    label: "Selesai",
    bandClass: "bg-zinc-200 text-zinc-700",
    badgeClass: "bg-zinc-700 text-white",
    actionLabel: "",
    actionClass: "",
    nextStatus: null,
  },
  [OrderStatus.CANCELLED]: {
    label: "Dibatalkan",
    bandClass: "bg-red-200 text-red-900",
    badgeClass: "bg-red-700 text-white",
    actionLabel: "",
    actionClass: "",
    nextStatus: null,
  },
};

export const KDS_ACTIVE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export const KDS_FILTERS: ReadonlyArray<{
  id: KdsFilterId;
  label: string;
  statuses: readonly OrderStatus[];
}> = [
  { id: "semua", label: "Semua", statuses: KDS_ACTIVE_STATUSES },
  { id: "proses", label: "Perlu Diproses", statuses: [OrderStatus.RECEIVED, OrderStatus.PREPARING] },
  { id: "siap", label: "Siap Disajikan", statuses: [OrderStatus.READY] },
];

export function nextStatusFor(status: OrderStatus): OrderStatus | null {
  return KDS_STATUS_META[status]?.nextStatus ?? null;
}

export function waitMinutesSince(createdAt: string, now: number): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 60_000));
}

export function waitToneClass(minutes: number): string {
  if (minutes >= 20) return "text-red-700";
  if (minutes >= 10) return "text-amber-700";
  return "text-zinc-950";
}

export function formatWait(minutes: number): string {
  return `${minutes} mnt`;
}
