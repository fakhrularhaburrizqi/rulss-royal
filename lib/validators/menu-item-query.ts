import { z } from "zod";

import { MAX_MENU_NAME } from "@/lib/order/constants";

const MAX_CURSOR_ENCODED_LENGTH = 512;

const filterSchema = z.enum(["all", "active", "inactive", "archived"]);

const searchSchema = z
  .string()
  .trim()
  .max(MAX_MENU_NAME, `Pencarian maksimal ${MAX_MENU_NAME} karakter`)
  .optional()
  .transform((val) => (val === "" ? undefined : val));

const limitSchema = z
  .coerce.number()
  .int("Limit harus bilangan bulat")
  .min(1, "Limit minimal 1")
  .max(100, "Limit maksimal 100")
  .default(50);

const outletIdSchema = z
  .string()
  .trim()
  .min(1, "Outlet wajib diisi")
  .max(100, "Outlet ID terlalu panjang");

const cursorSchema = z
  .string()
  .trim()
  .min(1, "Cursor tidak boleh kosong")
  .max(MAX_CURSOR_ENCODED_LENGTH, "Cursor terlalu panjang")
  .optional();

export const menuItemListQuerySchema = z
  .object({
    outletId: outletIdSchema,
    limit: limitSchema,
    filter: filterSchema.default("all"),
    search: searchSchema,
    cursor: cursorSchema,
  })
  .strict();

export type MenuItemListQueryInput = z.infer<typeof menuItemListQuerySchema>;
