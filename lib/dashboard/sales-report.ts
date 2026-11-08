import "server-only";

import { OrderStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  addDaysToDateKey,
  diffDateKeys,
  formatDateKeyShort,
  toJakartaDateKey,
  type ReportRange,
} from "@/lib/dashboard/report-range";

export type SalesTrendPoint = {
  dateKey: string;
  label: string;
  revenue: number;
};

export type TopSellingItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type SalesReport = {
  totalRevenue: number;
  completedOrders: number;
  averageTransaction: number;
  trend: SalesTrendPoint[];
  topMenus: TopSellingItem[];
};

export type ReportExportItem = {
  menuNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type ReportExportRow = {
  orderNumber: string;
  createdAt: Date;
  status: string;
  source: string;
  customerName: string | null;
  tableCode: string | null;
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
  items: ReportExportItem[];
};

type TrendBucket = {
  key: string;
  dateKey: string;
  label: string;
  revenue: number;
};

function buildTrendBuckets(range: ReportRange): TrendBucket[] {
  const buckets: TrendBucket[] = [];

  if (range.granularity === "daily") {
    let cursor = range.startKey;
    let guard = 0;
    while (cursor <= range.endKey && guard <= range.days + 1) {
      buckets.push({
        key: cursor,
        dateKey: cursor,
        label: formatDateKeyShort(cursor),
        revenue: 0,
      });
      cursor = addDaysToDateKey(cursor, 1);
      guard += 1;
    }
    return buckets;
  }

  let cursor = range.startKey;
  let index = 0;
  while (cursor <= range.endKey && index <= Math.ceil(range.days / 7) + 1) {
    const rawEnd = addDaysToDateKey(cursor, 6);
    const bucketEnd = rawEnd < range.endKey ? rawEnd : range.endKey;
    buckets.push({
      key: `w${index}`,
      dateKey: cursor,
      label:
        cursor === bucketEnd
          ? formatDateKeyShort(cursor)
          : `${formatDateKeyShort(cursor)} - ${formatDateKeyShort(bucketEnd)}`,
      revenue: 0,
    });
    cursor = addDaysToDateKey(bucketEnd, 1);
    index += 1;
  }

  return buckets;
}

export async function getSalesReport(
  tenantId: string,
  outletId: string,
  range: ReportRange
): Promise<SalesReport> {
  const createdAtFilter = { gte: range.start, lt: range.endExclusive };

  const [orders, topMenuRows] = await Promise.all([
    db.customerOrder.findMany({
      where: {
        tenantId,
        outletId,
        status: OrderStatus.COMPLETED,
        createdAt: createdAtFilter,
      },
      select: {
        total: true,
        createdAt: true,
      },
    }),
    db.orderItem.groupBy({
      by: ["menuItemId", "menuNameSnapshot"],
      where: {
        tenantId,
        outletId,
        order: {
          status: OrderStatus.COMPLETED,
          createdAt: createdAtFilter,
        },
      },
      _sum: {
        quantity: true,
        subtotal: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 10,
    }),
  ]);

  const buckets = buildTrendBuckets(range);
  const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  let totalRevenue = 0;

  for (const order of orders) {
    totalRevenue += order.total;

    const orderKey = toJakartaDateKey(order.createdAt);
    if (orderKey < range.startKey || orderKey > range.endKey) {
      continue;
    }

    const bucketKey =
      range.granularity === "daily"
        ? orderKey
        : `w${Math.floor(diffDateKeys(range.startKey, orderKey) / 7)}`;
    const bucket = bucketByKey.get(bucketKey);
    if (bucket) {
      bucket.revenue += order.total;
    }
  }

  const completedOrders = orders.length;
  const topMenus: TopSellingItem[] = topMenuRows.map((row) => ({
    menuItemId: row.menuItemId,
    name: row.menuNameSnapshot,
    quantity: row._sum.quantity ?? 0,
    revenue: row._sum.subtotal ?? 0,
  }));

  return {
    totalRevenue,
    completedOrders,
    averageTransaction: completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0,
    trend: buckets.map((bucket) => ({
      dateKey: bucket.dateKey,
      label: bucket.label,
      revenue: bucket.revenue,
    })),
    topMenus,
  };
}

export async function listReportOrders(
  tenantId: string,
  outletId: string,
  range: ReportRange
): Promise<ReportExportRow[]> {
  const orders = await db.customerOrder.findMany({
    where: {
      tenantId,
      outletId,
      status: OrderStatus.COMPLETED,
      createdAt: {
        gte: range.start,
        lt: range.endExclusive,
      },
    },
    select: {
      orderNumber: true,
      createdAt: true,
      status: true,
      source: true,
      customerName: true,
      subtotal: true,
      taxAmount: true,
      serviceAmount: true,
      total: true,
      diningTable: {
        select: {
          code: true,
        },
      },
      items: {
        select: {
          menuNameSnapshot: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return orders.map((order) => ({
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    source: order.source,
    customerName: order.customerName,
    tableCode: order.diningTable?.code ?? null,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    serviceAmount: order.serviceAmount,
    total: order.total,
    items: order.items.map((item) => ({
      menuNameSnapshot: item.menuNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
  }));
}
