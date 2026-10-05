import { z } from "zod";

import { MAX_CATEGORY_NAME } from "@/lib/order/constants";

const CURSOR_VERSION = 1 as const;
const MAX_CURSOR_ENCODED_LENGTH = 512;

const filterSchema = z.enum(["all", "active", "inactive", "archived"]);

const searchSchema = z
  .string()
  .trim()
  .max(MAX_CATEGORY_NAME, `Pencarian maksimal ${MAX_CATEGORY_NAME} karakter`)
  .optional()
  .transform((val) => (val === "" ? undefined : val));

const limitSchema = z
  .coerce.number()
  .int("Limit harus bilangan bulat")
  .min(1, "Limit minimal 1")
  .max(100, "Limit maksimal 100")
  .default(50);

const outletSchema = z
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

export const catalogListQuerySchema = z
  .object({
    outlet: outletSchema,
    limit: limitSchema,
    filter: filterSchema.default("all"),
    search: searchSchema,
    cursor: cursorSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const keys = Object.keys(data);
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Parameter duplikat: ${key}`,
          path: [key],
        });
      }
      seen.add(key);
    }
  });

export type CatalogListQueryInput = z.infer<typeof catalogListQuerySchema>;

export type CursorPayload = {
  readonly v: 1;
  readonly sortOrder: number;
  readonly name: string;
  readonly id: string;
  readonly outletId: string;
  readonly filter: "all" | "active" | "inactive" | "archived";
  readonly search: string | undefined;
};

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString("base64url");
}

export function decodeCursor(encoded: string): CursorPayload | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      parsed.v !== CURSOR_VERSION ||
      typeof parsed.sortOrder !== "number" ||
      typeof parsed.name !== "string" ||
      typeof parsed.id !== "string" ||
      typeof parsed.outletId !== "string" ||
      typeof parsed.filter !== "string" ||
      (parsed.search !== undefined && typeof parsed.search !== "string")
    ) {
      return null;
    }
    return parsed as CursorPayload;
  } catch {
    return null;
  }
}

export function validateCursorBinding(
  cursor: CursorPayload,
  expected: { outletId: string; filter: string; search: string | undefined }
): boolean {
  if (cursor.outletId !== expected.outletId) return false;
  if (cursor.filter !== expected.filter) return false;
  if (cursor.search !== expected.search) return false;
  return true;
}