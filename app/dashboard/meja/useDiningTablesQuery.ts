"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDiningTables } from "@/lib/api/tables";
import { diningTableKeys, type DiningTableAuthScope } from "@/lib/dashboard/dining-table-query-keys";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

interface UseDiningTablesQueryOptions {
  authScope: DiningTableAuthScope;
  outletId: string;
  initialData?: DiningTableSummary[];
  initialDataUpdatedAt?: number;
}

export function useDiningTablesQuery({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: UseDiningTablesQueryOptions) {
  const query = useQuery({
    queryKey: diningTableKeys().list(authScope, outletId),
    queryFn: ({ signal }) => fetchDiningTables(outletId, signal),
    initialData,
    initialDataUpdatedAt,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
