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
    bandClass: "bg-emerald-600 text-white",
    badgeClass: "bg-emerald-500 text-white",
    actionLabel: "Proses Sekarang",
    actionClass: "bg-emerald-700 text-white border-emerald-500 hover:bg-emerald-600 hover:border-emerald-400",
    nextStatus: OrderStatus.PREPARING,
  },
  [OrderStatus.PREPARING]: {
    label: "Diproses",
    bandClass: "bg-emerald-600 text-white",
    badgeClass: "bg-emerald-500 text-white",
    actionLabel: "Tandai Siap",
    actionClass: "bg-emerald-700 text-white border-emerald-500 hover:bg-emerald-600 hover:border-emerald-400",
    nextStatus: OrderStatus.READY,
  },
  [OrderStatus.READY]: {
    label: "Siap Disajikan",
    bandClass: "bg-emerald-600 text-white",
    badgeClass: "bg-emerald-500 text-white",
    actionLabel: "Selesaikan",
    actionClass: "bg-emerald-700 text-white border-emerald-500 hover:bg-emerald-600 hover:border-emerald-400",
    nextStatus: OrderStatus.COMPLETED,
  },
  [OrderStatus.COMPLETED]: {
    label: "Selesai",
    bandClass: "bg-emerald-700 text-emerald-300",
    badgeClass: "bg-emerald-800 text-emerald-200",
    actionLabel: "",
    actionClass: "",
    nextStatus: null,
  },
  [OrderStatus.CANCELLED]: {
    label: "Dibatalkan",
    bandClass: "bg-red-600 text-white",
    badgeClass: "bg-red-500 text-white",
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
  return "text-emerald-900";
}

export function formatWait(minutes: number): string {
  return `${minutes} mnt`;
}
