import { z } from "zod";

import type { PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

const isoDateTimeSchema = z.string().datetime();

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  deletedAt: isoDateTimeSchema.nullable(),
});

const menuItemSchema = z
  .object({
    id: z.string(),
    categoryId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.number().int(),
    imageUrl: z.string().nullable(),
    imageAlt: z.string().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
    isSoldOut: z.boolean(),
    deletedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
    category: categorySchema,
  })
  .refine((item) => item.categoryId === item.category.id, {
    message: "categoryId tidak konsisten dengan category.id",
    path: ["category", "id"],
  });

const paginatedMenuItemsResultSchema = z
  .object({
    data: z.array(menuItemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .refine(
    (result) =>
      result.hasMore ? typeof result.nextCursor === "string" : result.nextCursor === null,
    {
      message: "nextCursor dan hasMore tidak konsisten",
      path: ["nextCursor"],
    }
  );

export type FetchMenuItemsParams = {
  outletId: string;
  limit?: number;
  filter?: "all" | "active" | "inactive" | "archived";
  search?: string;
  cursor?: string;
};

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return error.name === "AbortError";
}

function readErrorField(data: unknown, field: string): string | undefined {
  if (typeof data !== "object" || data === null || !(field in data)) {
    return undefined;
  }
  const value = (data as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function invalidResponse(): Error & { code: string; status: number } {
  const error = new Error("Respons tidak valid") as Error & { code: string; status: number };
  error.code = "INVALID_RESPONSE";
  error.status = 500;
  return error;
}

export async function fetchMenuItems(
  params: FetchMenuItemsParams,
  signal?: AbortSignal
): Promise<PaginatedMenuItemsResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("outletId", params.outletId);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.filter !== undefined) searchParams.set("filter", params.filter);
  if (params.search !== undefined && params.search !== "") {
    searchParams.set("search", params.search);
  }
  if (params.cursor !== undefined && params.cursor !== "") {
    searchParams.set("cursor", params.cursor);
  }

  const response = await fetch(`/api/v1/catalog/menu-items?${searchParams.toString()}`, {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    let errorData: unknown = null;
    if (contentType.includes("application/json")) {
      try {
        errorData = await response.json();
      } catch (error) {
        if (isAbortError(error)) throw error;
      }
    }

    const code = readErrorField(errorData, "code") ?? "INTERNAL_ERROR";
    const message =
      readErrorField(errorData, "message") ?? "Terjadi kesalahan. Silakan coba lagi.";

    const error = new Error(message) as Error & { code: string; status: number };
    error.code = code;
    error.status = response.status;
    throw error;
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw invalidResponse();
  }

  const parsed = paginatedMenuItemsResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalidResponse();
  }

  return parsed.data;
}
