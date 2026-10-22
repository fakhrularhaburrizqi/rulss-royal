"use server";

import { revalidatePath } from "next/cache";
import { OrderSource, type OrderStatus } from "@prisma/client";

import { type OrderErrorCode, getOrderErrorMessage, toOrderError } from "@/lib/order/errors";
import { createCustomerOrder } from "@/lib/services/order-create.service";
import { completeOrderDirect } from "@/lib/services/order-complete.service";
import { getOrderForReceipt, type OrderReceiptData } from "@/lib/services/order-receipt.service";
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

export type CreateDirectOrderActionResult =
  | {
      ok: true;
      data: {
        orderId: string;
        orderNumber: string;
        total: number;
        receipt: OrderReceiptData;
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

export async function createDirectOrderAction(
  payload: unknown
): Promise<CreateDirectOrderActionResult> {
  const parsed = staffCreateOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return failure("INVALID_INPUT");
  }

  try {
    const summary = await createCustomerOrder({
      ...parsed.data,
      source: OrderSource.CASHIER,
    });

    const completed = await completeOrderDirect({
      outletId: parsed.data.outletId,
      orderId: summary.id,
      version: summary.version,
    });

    const receipt = await getOrderForReceipt(summary.id, completed.tenantId);

    try {
      revalidatePath("/dashboard/pesanan");
      revalidatePath("/dashboard/kasir");
      revalidatePath("/dashboard");
    } catch {
      // ignore outside request context in unit tests
    }

    return {
      ok: true,
      data: {
        orderId: completed.id,
        orderNumber: completed.orderNumber,
        total: receipt.total,
        receipt,
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

    try {
      revalidatePath("/dashboard/pesanan");
      revalidatePath("/dashboard");
    } catch {
      // ignore outside request context in unit tests
    }

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
