"use server";

import "server-only";
import bcrypt from "bcryptjs";
import { OrderSource, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getOrderErrorMessage, isOrderNumberUniqueViolation, toOrderError } from "@/lib/order/errors";
import { itemSubtotal, orderTotals } from "@/lib/order/pricing";
import {
  formatOrderNumber,
  maxSequence,
  orderNumberPrefix,
  resolveLocalDate,
} from "@/lib/order/order-number";
import { DEFAULT_TIMEZONE, MAX_ORDER_CREATE_ATTEMPTS, MAX_ORDER_SEQ_PER_DAY } from "@/lib/order/constants";

export type PublicOrderActionResult =
  | {
      ok: true;
      data: {
        orderId: string;
        orderNumber: string;
      };
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export async function createPublicOrderAction(payload: {
  tableId: string;
  token: string;
  customerName?: string;
  note?: string;
  items: Array<{ menuItemId: string; quantity: number; note?: string }>;
}): Promise<PublicOrderActionResult> {
  try {
    const { tableId, token, customerName, note, items } = payload;
    if (!tableId || !token || !items || items.length === 0) {
      return { ok: false, code: "INVALID_INPUT", message: "Data pesanan tidak valid" };
    }

    const table = await db.diningTable.findFirst({
      where: { id: tableId.trim(), isActive: true },
      select: {
        id: true,
        code: true,
        outletId: true,
        qrTokenHash: true,
        outlet: {
          select: {
            id: true,
            tenantId: true,
            code: true,
            setting: { select: { timezone: true } },
          },
        },
      },
    });

    if (!table || !table.qrTokenHash) {
      return { ok: false, code: "TABLE_NOT_FOUND", message: "Meja tidak ditemukan" };
    }

    const isValidToken = await bcrypt.compare(token.trim(), table.qrTokenHash);
    if (!isValidToken) {
      return { ok: false, code: "TOKEN_INVALID", message: "Token QR tidak valid" };
    }

    const tenantId = table.outlet.tenantId;
    const outletId = table.outletId;

    const menuItemIds = items.map((i) => i.menuItemId);
    const menuRows = await db.menuItem.findMany({
      where: {
        tenantId,
        outletId,
        id: { in: menuItemIds },
        isActive: true,
        deletedAt: null,
        isSoldOut: false,
        category: { isActive: true, deletedAt: null },
      },
      select: { id: true, name: true, price: true },
    });

    if (menuRows.length !== menuItemIds.length) {
      return { ok: false, code: "MENU_ITEM_UNAVAILABLE", message: "Beberapa menu tidak tersedia" };
    }

    const menuById = new Map(menuRows.map((r) => [r.id, r]));
    const orderLines = items.map((item) => {
      const menu = menuById.get(item.menuItemId);
      if (!menu) throw new Error("Menu not found");
      return {
        menuItemId: menu.id,
        menuNameSnapshot: menu.name,
        unitPrice: menu.price,
        quantity: item.quantity,
        note: item.note?.trim() || null,
        subtotal: itemSubtotal(menu.price, item.quantity),
      };
    });

    const timezone = table.outlet.setting?.timezone || DEFAULT_TIMEZONE;
    const capturedNow = new Date();
    const datePart = resolveLocalDate(capturedNow, timezone);
    const prefix = orderNumberPrefix(table.outlet.code, datePart);

    const totals = orderTotals(
      orderLines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity }))
    );

    for (let attempt = 1; attempt <= MAX_ORDER_CREATE_ATTEMPTS; attempt++) {
      try {
        const result = await db.$transaction(
          async (tx) => {
            const existing = await tx.customerOrder.findMany({
              where: { tenantId, outletId, orderNumber: { startsWith: prefix } },
              select: { orderNumber: true },
            });

            const seq = maxSequence(existing.map((e) => e.orderNumber), prefix) + 1;
            if (seq > MAX_ORDER_SEQ_PER_DAY) {
              throw new Error("Order limit reached");
            }

            const orderNumber = formatOrderNumber(prefix, seq);

            const order = await tx.customerOrder.create({
              data: {
                tenantId,
                outletId,
                diningTableId: table.id,
                createdByUserId: null,
                orderNumber,
                source: OrderSource.QR_TABLE,
                status: OrderStatus.RECEIVED,
                customerName: customerName?.trim() || null,
                note: note?.trim() || null,
                subtotal: totals.subtotal,
                taxAmount: totals.taxAmount,
                serviceAmount: totals.serviceAmount,
                total: totals.total,
                version: 1,
              },
            });

            await tx.orderItem.createMany({
              data: orderLines.map((l) => ({
                tenantId,
                outletId,
                orderId: order.id,
                menuItemId: l.menuItemId,
                menuNameSnapshot: l.menuNameSnapshot,
                unitPrice: l.unitPrice,
                quantity: l.quantity,
                note: l.note,
                subtotal: l.subtotal,
              })),
            });

            await tx.activityLog.create({
              data: {
                tenantId,
                outletId,
                userId: null,
                action: "order.created",
                entity: "CustomerOrder",
                entityId: order.id,
                after: {
                  orderNumber: order.orderNumber,
                  source: order.source,
                  total: order.total,
                },
              },
            });

            return { orderId: order.id, orderNumber: order.orderNumber };
          },
          { maxWait: 5000, timeout: 15000 }
        );

        return { ok: true, data: result };
      } catch (err: unknown) {
        if (isOrderNumberUniqueViolation(err) && attempt < MAX_ORDER_CREATE_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }

    return { ok: false, code: "ORDER_NUMBER_CONFLICT", message: "Gagal membuat nomor pesanan" };
  } catch (error) {
    const mapped = toOrderError(error);
    return { ok: false, code: mapped.code, message: getOrderErrorMessage(mapped.code) };
  }
}
