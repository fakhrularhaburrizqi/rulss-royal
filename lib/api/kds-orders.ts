import { z } from "zod";

import type { KdsOrder } from "@/lib/services/kds-query.service";

const OrderStatusSchema = z.enum([
  "RECEIVED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
]);

const OrderSourceSchema = z.enum(["CASHIER", "QR_TABLE"]);

const KdsOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  source: OrderSourceSchema,
  status: OrderStatusSchema,
  customerName: z.string().nullable(),
  note: z.string().nullable(),
  subtotal: z.number(),
  total: z.number(),
  version: z.number(),
  createdAt: z.string(),
  diningTable: z
    .object({
      id: z.string(),
      code: z.string(),
    })
    .nullable(),
  items: z.array(
    z.object({
      id: z.string(),
      menuNameSnapshot: z.string(),
      unitPrice: z.number(),
      quantity: z.number(),
      subtotal: z.number(),
      note: z.string().nullable(),
    })
  ),
});

export async function fetchKdsOrders(
  outletId: string,
  signal?: AbortSignal
): Promise<KdsOrder[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("outletId", outletId);

  const response = await fetch(`/api/v1/kds/orders?${searchParams.toString()}`, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const code = (errorData as { code?: string } | null)?.code ?? "INTERNAL_ERROR";
    const message = (errorData as { message?: string } | null)?.message ?? "Gagal memuat pesanan dapur.";
    const error = new Error(message) as Error & { code: string; status: number };
    error.code = code;
    error.status = response.status;
    throw error;
  }

  const raw = await response.json();
  const parsed = z.array(KdsOrderSchema).safeParse(raw);
  if (!parsed.success) {
    throw new Error("Respons tidak valid");
  }
  return parsed.data as KdsOrder[];
}
