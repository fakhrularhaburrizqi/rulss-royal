"use server";

import { OrderSource, type OrderStatus } from "@prisma/client";

import { type OrderErrorCode, getOrderErrorMessage, toOrderError } from "@/lib/order/errors";
import { createCustomerOrder } from "@/lib/services/order-create.service";
import { updateOrderStatus } from "@/lib/services/order-status.service";
import { staffCreateOrderSchema, updateOrderStatusSchema } from "@/lib/validators/order.validator";

export type CreateOrderActionResult =
  | {
      ok: true;
      data: {
        orderId: string;
        orderNumber: string;
      };
    }
  | {
      ok: false;
      code: OrderErrorCode;
      message: string;
    };

export type UpdateOrderStatusActionResult =
  | {
      ok: true;
      data: {
        orderId: string;
        status: OrderStatus;
        version: number;
      };
    }
  | {
      ok: false;
      code: OrderErrorCode;
      message: string;
    };

function failure(code: OrderErrorCode): { ok: false; code: OrderErrorCode; message: string } {
  return { ok: false, code, message: getOrderErrorMessage(code) };
}

export async function createOrderAction(payload: unknown): Promise<CreateOrderActionResult> {
  const parsed = staffCreateOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await createCustomerOrder({
      ...parsed.data,
      source: OrderSource.CASHIER,
    });

    return {
      ok: true,
      data: {
        orderId: summary.id,
        orderNumber: summary.orderNumber,
      },
    };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}

export async function updateOrderStatusAction(
  payload: unknown
): Promise<UpdateOrderStatusActionResult> {
  const parsed = updateOrderStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await updateOrderStatus(parsed.data);

    return {
      ok: true,
      data: {
        orderId: summary.id,
        status: summary.status,
        version: summary.version,
      },
    };
  } catch (error) {
    const mapped = toOrderError(error);
    return failure(mapped.code);
  }
}
