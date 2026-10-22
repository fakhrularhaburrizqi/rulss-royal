import "server-only";

import type { OrderSource } from "@prisma/client";

import { db } from "@/lib/db";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";

export type OrderReceiptItem = {
  menuNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  note: string | null;
};

export type OrderReceiptData = {
  orderNumber: string;
  createdAt: string;
  customerName: string | null;
  note: string | null;
  source: OrderSource;
  total: number;
  diningTable: { code: string } | null;
  items: OrderReceiptItem[];
};

export async function getOrderForReceipt(
  orderId: string,
  tenantId: string
): Promise<OrderReceiptData> {
  const trimmedId = typeof orderId === "string" ? orderId.trim() : "";
  if (trimmedId === "" || typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }

  try {
    const order = await db.customerOrder.findFirst({
      where: { id: trimmedId, tenantId: tenantId.trim() },
      select: {
        orderNumber: true,
        createdAt: true,
        customerName: true,
        note: true,
        source: true,
        total: true,
        diningTable: {
          select: { code: true },
        },
        items: {
          select: {
            menuNameSnapshot: true,
            unitPrice: true,
            quantity: true,
            subtotal: true,
            note: true,
          },
        },
      },
    });

    if (order === null) {
      throw new OrderDomainError("ORDER_NOT_FOUND");
    }

    return {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      customerName: order.customerName,
      note: order.note,
      source: order.source,
      total: order.total,
      diningTable: order.diningTable ? { code: order.diningTable.code } : null,
      items: order.items,
    };
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
