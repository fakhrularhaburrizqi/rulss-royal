import { z } from "zod";
import type { PaginatedCategoriesResult } from "@/lib/services/menu-category-query.service";

const ManagementCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  deletedAt: z.string().nullable(),
  updatedAt: z.string(),
});

const PaginatedCategoriesResultSchema = z.object({
  data: z.array(ManagementCategorySchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export type FetchCategoriesParams = {
  outlet: string;
  limit?: number;
  filter?: "all" | "active" | "inactive" | "archived";
  search?: string;
  cursor?: string;
};

export async function fetchCategories(
  params: FetchCategoriesParams,
  signal?: AbortSignal
): Promise<PaginatedCategoriesResult> {
  const searchParams = new URLSearchParams();
  searchParams.set("outlet", params.outlet);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.filter !== undefined) searchParams.set("filter", params.filter);
  if (params.search !== undefined && params.search !== "") searchParams.set("search", params.search);
  if (params.cursor !== undefined) searchParams.set("cursor", params.cursor);

  const response = await fetch(`/api/v1/catalog/categories?${searchParams.toString()}`, {
    signal,
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    let errorData: unknown = null;
    try {
      if (contentType.includes("application/json")) {
        errorData = await response.json();
      }
    } catch {
      // ignore JSON parse errors
    }

    const code = (errorData as { code?: string } | null)?.code ?? "INTERNAL_ERROR";
    const message = (errorData as { message?: string } | null)?.message ?? "Terjadi kesalahan. Silakan coba lagi.";

    const error = new Error(message) as Error & { code: string; status: number };
    error.code = code;
    error.status = response.status;
    throw error;
  }

  const raw = await response.json();
  const parsed = PaginatedCategoriesResultSchema.safeParse(raw);

  if (!parsed.success) {
    const error = new Error("Respons tidak valid") as Error & { code: string; status: number };
    error.code = "INVALID_RESPONSE";
    error.status = 500;
    throw error;
  }

  return parsed.data;
}