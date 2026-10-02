import { z } from "zod";

import {
  MAX_CATEGORY_NAME,
  MAX_IMAGE_ALT,
  MAX_IMAGE_URL,
  MAX_MENU_DESCRIPTION,
  MAX_MENU_NAME,
  MAX_MONEY,
  MAX_SORT_ORDER,
  MIN_MONEY,
} from "@/lib/order/constants";

const idSchema = z.string().trim().min(1, "ID wajib diisi");

const expectedUpdatedAtSchema = z
  .string()
  .datetime("expectedUpdatedAt harus berupa tanggal ISO UTC yang valid");

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Nama kategori wajib diisi")
  .max(MAX_CATEGORY_NAME, `Nama kategori maksimal ${MAX_CATEGORY_NAME} karakter`);

const menuItemNameSchema = z
  .string()
  .trim()
  .min(1, "Nama menu wajib diisi")
  .max(MAX_MENU_NAME, `Nama menu maksimal ${MAX_MENU_NAME} karakter`);

const sortOrderSchema = z
  .number()
  .int("Urutan harus bilangan bulat")
  .min(0, "Urutan minimal 0")
  .max(MAX_SORT_ORDER, `Urutan maksimal ${MAX_SORT_ORDER}`);

const priceSchema = z
  .number()
  .int("Harga harus bilangan bulat")
  .min(MIN_MONEY, "Harga tidak boleh negatif")
  .max(MAX_MONEY, "Harga melewati batas yang diizinkan");

const descriptionSchema = z
  .string()
  .trim()
  .max(MAX_MENU_DESCRIPTION, `Deskripsi maksimal ${MAX_MENU_DESCRIPTION} karakter`)
  .transform((value) => (value === "" ? null : value))
  .optional();

const imageAltSchema = z
  .string()
  .trim()
  .max(MAX_IMAGE_ALT, `Teks alt gambar maksimal ${MAX_IMAGE_ALT} karakter`)
  .transform((value) => (value === "" ? null : value))
  .optional();

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const imageUrlSchema = z
  .string()
  .trim()
  .max(MAX_IMAGE_URL, `URL gambar maksimal ${MAX_IMAGE_URL} karakter`)
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || isHttpUrl(value), {
    message: "URL gambar tidak valid",
  })
  .optional();

export const categoryCreateSchema = z
  .object({
    outletId: idSchema,
    name: categoryNameSchema,
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    outletId: idSchema,
    categoryId: idSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    name: categoryNameSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined || data.sortOrder !== undefined || data.isActive !== undefined,
    { message: "Minimal satu field kategori harus diperbarui" }
  );

const categoryTargetShape = {
  outletId: idSchema,
  categoryId: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
};

export const categoryArchiveSchema = z.object(categoryTargetShape).strict();

export const categoryRestoreSchema = z.object(categoryTargetShape).strict();

export const menuItemCreateSchema = z
  .object({
    outletId: idSchema,
    categoryId: idSchema,
    name: menuItemNameSchema,
    price: priceSchema,
    description: descriptionSchema,
    imageUrl: imageUrlSchema,
    imageAlt: imageAltSchema,
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
    isSoldOut: z.boolean().optional(),
  })
  .strict();

export const menuItemUpdateSchema = z
  .object({
    outletId: idSchema,
    menuItemId: idSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    categoryId: idSchema.optional(),
    name: menuItemNameSchema.optional(),
    price: priceSchema.optional(),
    description: descriptionSchema,
    imageUrl: imageUrlSchema,
    imageAlt: imageAltSchema,
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
    isSoldOut: z.boolean().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.categoryId !== undefined ||
      data.name !== undefined ||
      data.price !== undefined ||
      data.description !== undefined ||
      data.imageUrl !== undefined ||
      data.imageAlt !== undefined ||
      data.sortOrder !== undefined ||
      data.isActive !== undefined ||
      data.isSoldOut !== undefined,
    { message: "Minimal satu field menu harus diperbarui" }
  );

const menuItemTargetShape = {
  outletId: idSchema,
  menuItemId: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
};

export const menuItemArchiveSchema = z.object(menuItemTargetShape).strict();

export const menuItemRestoreSchema = z.object(menuItemTargetShape).strict();

export const menuItemSoldOutSchema = z
  .object({
    ...menuItemTargetShape,
    isSoldOut: z.boolean(),
  })
  .strict();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type CategoryArchiveInput = z.infer<typeof categoryArchiveSchema>;
export type CategoryRestoreInput = z.infer<typeof categoryRestoreSchema>;
export type MenuItemCreateInput = z.infer<typeof menuItemCreateSchema>;
export type MenuItemUpdateInput = z.infer<typeof menuItemUpdateSchema>;
export type MenuItemArchiveInput = z.infer<typeof menuItemArchiveSchema>;
export type MenuItemRestoreInput = z.infer<typeof menuItemRestoreSchema>;
export type MenuItemSoldOutInput = z.infer<typeof menuItemSoldOutSchema>;
