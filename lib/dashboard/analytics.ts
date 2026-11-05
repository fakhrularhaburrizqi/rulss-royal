import "server-only";

import { db } from "@/lib/db";
import { OrderStatus } from "@prisma/client";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ANALYTICS_PERIOD_OPTIONS = [7, 30] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIOD_OPTIONS)[number];
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = 30;

export type RevenuePoint = {
  dateKey: string;
  label: string;
  revenue: number;
};

export type TopMenuItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type OutletAnalytics = {
  periodDays: number;
  periodStartLabel: string;
  todayLabel: string;
  totalRevenue: number;
  revenueToday: number;
  totalOrders: number;
  ordersToday: number;
  completedOrders: number;
  averageTransaction: number;
  activeOrders: number;
  trend: RevenuePoint[];
  topMenus: TopMenuItem[];
};

export function parseAnalyticsPeriod(
  raw: string | string[] | undefined
): AnalyticsPeriod {
  if (typeof raw === "string") {
    const value = Number(raw);
    if (ANALYTICS_PERIOD_OPTIONS.includes(value as AnalyticsPeriod)) {
      return value as AnalyticsPeriod;
    }
  }
  return DEFAULT_ANALYTICS_PERIOD;
}

function startOfPeriodUtc(now: Date, days: number): Date {
  const jakarta = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  const firstDayUtcMidnight = Date.UTC(
    jakarta.getUTCFullYear(),
    jakarta.getUTCMonth(),
    jakarta.getUTCDate() - (days - 1)
  );
  return new Date(firstDayUtcMidnight - JAKARTA_OFFSET_MS);
}

function dateKey(utcMillis: number): string {
  return new Date(utcMillis + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

const dayLabelFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const fullDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function dayLabel(utcMillis: number): string {
  return dayLabelFormatter.format(utcMillis);
}

export async function getOutletAnalytics(
  tenantId: string,
  outletId: string,
  periodDays: AnalyticsPeriod
): Promise<OutletAnalytics> {
  const now = new Date();
  const startUtc = startOfPeriodUtc(now, periodDays);

  const todayKey = dateKey(now.getTime());

  const [orders, topMenuRows, activeOrders] = await Promise.all([
    db.customerOrder.findMany({
      where: {
        tenantId,
        outletId,
        createdAt: { gte: startUtc },
        status: { not: OrderStatus.CANCELLED },
      },
      select: { status: true, total: true, createdAt: true },
    }),
    db.orderItem.groupBy({
      by: ["menuItemId", "menuNameSnapshot"],
      where: {
        tenantId,
        outletId,
        order: {
          status: OrderStatus.COMPLETED,
          createdAt: { gte: startUtc },
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.customerOrder.count({
      where: {
        tenantId,
        outletId,
        status: {
          in: [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY],
        },
      },
    }),
  ]);

  const trendMap = new Map<string, number>();
  const labelByKey = new Map<string, string>();
  for (let t = startUtc.getTime(); t <= now.getTime(); t += DAY_MS) {
    const key = dateKey(t);
    trendMap.set(key, 0);
    labelByKey.set(key, dayLabel(t));
  }

  let totalRevenue = 0;
  let revenueToday = 0;
  let completedOrders = 0;
  let ordersToday = 0;

  for (const order of orders) {
    const key = dateKey(order.createdAt.getTime());
    if (key === todayKey) {
      ordersToday += 1;
    }
    if (order.status !== OrderStatus.COMPLETED) {
      continue;
    }
    totalRevenue += order.total;
    completedOrders += 1;
    if (key === todayKey) {
      revenueToday += order.total;
    }
    trendMap.set(key, (trendMap.get(key) ?? 0) + order.total);
  }

  const trend: RevenuePoint[] = Array.from(trendMap.entries()).map(
    ([dateKeyValue, revenue]) => ({
      dateKey: dateKeyValue,
      label: labelByKey.get(dateKeyValue) ?? dateKeyValue,
      revenue,
    })
  );

  const topMenus: TopMenuItem[] = topMenuRows.map((row) => ({
    menuItemId: row.menuItemId,
    name: row.menuNameSnapshot,
    quantity: row._sum.quantity ?? 0,
    revenue: row._sum.subtotal ?? 0,
  }));

  return {
    periodDays,
    periodStartLabel: fullDateFormatter.format(startUtc),
    todayLabel: fullDateFormatter.format(now),
    totalRevenue,
    revenueToday,
    totalOrders: orders.length,
    ordersToday,
    completedOrders,
    averageTransaction:
      completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0,
    activeOrders,
    trend,
    topMenus,
  };
}
