import "server-only";

import type { OrderStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";
import { assertTransition } from "@/lib/order/status";
import { updateOrderStatusSchema } from "@/lib/validators/order.validator";

export type UpdatedOrderStatusSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const ORDER_STATUS_CHANGED_ACTION = "order.status.changed";
const ORDER_ENTITY = "CustomerOrder";

export async function updateOrderStatus(input: unknown): Promise<UpdatedOrderStatusSummary> {
  const parsed = updateOrderStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, orderId, status: targetStatus, version: expectedVersion } = parsed.data;

  const context = await requireOrderContext(outletId, "orders.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const order = await tx.customerOrder.findFirst({
        where: {
          id: orderId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          version: true,
        },
      });

      if (order === null) {
        throw new OrderDomainError("ORDER_NOT_FOUND");
      }

      if (order.version !== expectedVersion) {
        throw new OrderDomainError("VERSION_CONFLICT");
      }

      assertTransition(order.status, targetStatus);

      const updated = await tx.customerOrder.updateMany({
        where: {
          id: order.id,
          tenantId,
          outletId: authorizedOutletId,
          status: order.status,
          version: order.version,
        },
        data: {
          status: targetStatus,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("VERSION_CONFLICT");
      }

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: ORDER_STATUS_CHANGED_ACTION,
          entity: ORDER_ENTITY,
          entityId: order.id,
          before: {
            status: order.status,
            version: order.version,
          },
          after: {
            status: targetStatus,
            version: order.version + 1,
          },
        },
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: targetStatus,
        version: order.version + 1,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
