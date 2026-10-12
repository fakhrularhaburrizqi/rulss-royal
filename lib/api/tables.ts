import { z } from "zod";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

const DiningTableSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  capacity: z.number(),
  isActive: z.boolean(),
  updatedAt: z.string(),
});

export async function fetchDiningTables(outletId: string, signal?: AbortSignal): Promise<DiningTableSummary[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("outletId", outletId);

  const response = await fetch(`/api/v1/dashboard/tables?${searchParams.toString()}`, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const code = (errorData as { code?: string } | null)?.code ?? "INTERNAL_ERROR";
    const message = (errorData as { message?: string } | null)?.message ?? "Gagal memuat meja.";
    const error = new Error(message) as Error & { code: string; status: number };
    error.code = code;
    error.status = response.status;
    throw error;
  }

  const raw = await response.json();
  const parsed = z.array(DiningTableSummarySchema).safeParse(raw);
  if (!parsed.success) {
    throw new Error("Respons tidak valid");
  }
  return parsed.data;
}
