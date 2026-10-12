import { z } from "zod";

import { MAX_TABLE_CODE, MAX_TABLE_CAPACITY, MIN_TABLE_CAPACITY } from "@/lib/order/constants";

const idSchema = z.string().trim().min(1, "ID wajib diisi");

const expectedUpdatedAtSchema = z
  .string()
  .datetime("expectedUpdatedAt harus berupa tanggal ISO UTC yang valid");

const TABLE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

const tableCodeSchema = z
  .string()
  .trim()
  .min(1, "Kode meja wajib diisi")
  .max(MAX_TABLE_CODE, `Kode meja maksimal ${MAX_TABLE_CODE} karakter`)
  .transform((value) => value.toUpperCase())
  .refine((value) => TABLE_CODE_PATTERN.test(value), {
    message:
      "Kode meja hanya boleh berisi huruf A-Z, angka, underscore, dan hyphen, dan wajib diawali huruf atau angka",
  });

const capacitySchema = z
  .number()
  .int("Kapasitas harus bilangan bulat")
  .min(MIN_TABLE_CAPACITY, `Kapasitas minimal ${MIN_TABLE_CAPACITY}`)
  .max(MAX_TABLE_CAPACITY, `Kapasitas maksimal ${MAX_TABLE_CAPACITY}`);

const isActiveSchema = z.boolean();

export const tableCreateSchema = z
  .object({
    outletId: idSchema,
    code: tableCodeSchema,
    capacity: capacitySchema.optional(),
    isActive: isActiveSchema.optional(),
  })
  .strict();

export const tableUpdateSchema = z
  .object({
    outletId: idSchema,
    tableId: idSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
    code: tableCodeSchema.optional(),
    capacity: capacitySchema.optional(),
  })
  .strict()
  .refine((data) => data.code !== undefined || data.capacity !== undefined, {
    message: "Minimal satu field meja harus diperbarui",
  });

const tableTargetShape = {
  outletId: idSchema,
  tableId: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
};

export const tableDeactivateSchema = z.object(tableTargetShape).strict();

export const tableReactivateSchema = z.object(tableTargetShape).strict();

export const generateTableTokenSchema = z
  .object({
    outletId: idSchema,
    tableId: idSchema,
  })
  .strict();

export type TableCreateInput = z.infer<typeof tableCreateSchema>;
export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;
export type TableDeactivateInput = z.infer<typeof tableDeactivateSchema>;
export type TableReactivateInput = z.infer<typeof tableReactivateSchema>;
export type GenerateTableTokenInput = z.infer<typeof generateTableTokenSchema>;
