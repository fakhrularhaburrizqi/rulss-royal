import "server-only";
import { OrderStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";
import type { OrderListItem } from "./order-query.service";

const KDS_ACTIVE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export type KdsOrder = OrderListItem;

export async function listKdsOrdersForOutlet(outletId: string): Promise<KdsOrder[]> {
  try {
    const context = await requireOrderContext(outletId, "orders.manage");

    const orders = await db.customerOrder.findMany({
      where: {
        tenantId: context.actor.tenantId,
        outletId: context.outletId,
        status: { in: [...KDS_ACTIVE_STATUSES] },
      },
      select: {
        id: true,
        orderNumber: true,
        source: true,
        status: true,
        customerName: true,
        note: true,
        subtotal: true,
        total: true,
        version: true,
        createdAt: true,
        diningTable: {
          select: {
            id: true,
            code: true,
          },
        },
        items: {
          select: {
            id: true,
            menuNameSnapshot: true,
            unitPrice: true,
            quantity: true,
            subtotal: true,
            note: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return orders.map((order) => ({
      ...order,
      createdAt: order.createdAt.toISOString(),
    }));
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
