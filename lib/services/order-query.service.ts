import "server-only";
import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";
import type { OrderStatus, OrderSource } from "@prisma/client";

export type OrderListItem = {
  id: string;
  orderNumber: string;
  source: OrderSource;
  status: OrderStatus;
  customerName: string | null;
  note: string | null;
  subtotal: number;
  total: number;
  version: number;
  createdAt: string;
  diningTable: {
    id: string;
    code: string;
  } | null;
  items: Array<{
    id: string;
    menuNameSnapshot: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    note: string | null;
  }>;
};

export async function listOrdersForOutlet(outletId: string): Promise<OrderListItem[]> {
  try {
    const context = await requireOrderContext(outletId, "orders.manage");
    const tenantId = context.actor.tenantId;
    const authorizedOutletId = context.outletId;

    const orders = await db.customerOrder.findMany({
      where: {
        tenantId,
        outletId: authorizedOutletId,
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
      orderBy: { createdAt: "desc" },
    });

    return orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
    }));
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
