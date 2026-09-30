import { OrderSource, OrderStatus } from "@prisma/client";
import { z } from "zod";

import {
  MAX_CUSTOMER_NAME,
  MAX_ITEM_LINES,
  MAX_NOTE,
  MAX_QUANTITY_PER_LINE,
} from "@/lib/order/constants";

export function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const idSchema = z.string().trim().min(1, "ID wajib diisi");

const diningTableIdSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const customerNameSchema = z
  .string()
  .trim()
  .max(MAX_CUSTOMER_NAME, `Nama pelanggan maksimal ${MAX_CUSTOMER_NAME} karakter`)
  .transform(normalizeOptionalText)
  .optional();

const noteSchema = z
  .string()
  .trim()
  .max(MAX_NOTE, `Catatan maksimal ${MAX_NOTE} karakter`)
  .transform(normalizeOptionalText)
  .optional();

const orderItemSchema = z
  .object({
    menuItemId: idSchema,
    quantity: z
      .number()
      .int("Quantity harus bilangan bulat")
      .min(1, "Quantity minimal 1")
      .max(MAX_QUANTITY_PER_LINE, `Quantity maksimal ${MAX_QUANTITY_PER_LINE}`),
    note: noteSchema,
  })
  .strict();

const itemsSchema = z
  .array(orderItemSchema)
  .min(1, "Item pesanan wajib minimal 1")
  .max(MAX_ITEM_LINES, `Item pesanan maksimal ${MAX_ITEM_LINES}`);

const orderShape = {
  outletId: idSchema,
  diningTableId: diningTableIdSchema,
  customerName: customerNameSchema,
  note: noteSchema,
  items: itemsSchema,
};

function containsDuplicateMenuItemId(value: { items: Array<{ menuItemId: string }> }): boolean {
  const seen = new Set<string>();
  for (const item of value.items) {
    if (seen.has(item.menuItemId)) {
      return true;
    }
    seen.add(item.menuItemId);
  }
  return false;
}

const duplicateMenuItemMessage = "Terdapat menuItemId duplikat pada items";

export const domainCreateOrderSchema = z
  .object({
    source: z.nativeEnum(OrderSource),
    ...orderShape,
  })
  .strict()
  .refine((value) => !containsDuplicateMenuItemId(value), {
    message: duplicateMenuItemMessage,
  });

export const staffCreateOrderSchema = z
  .object(orderShape)
  .strict()
  .refine((value) => !containsDuplicateMenuItemId(value), {
    message: duplicateMenuItemMessage,
  });

export const updateOrderStatusSchema = z
  .object({
    outletId: idSchema,
    orderId: idSchema,
    status: z.nativeEnum(OrderStatus),
    version: z.number().int("Version harus bilangan bulat").min(1, "Version minimal 1"),
  })
  .strict();

export type DomainCreateOrderInput = z.infer<typeof domainCreateOrderSchema>;
export type StaffCreateOrderInput = z.infer<typeof staffCreateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
