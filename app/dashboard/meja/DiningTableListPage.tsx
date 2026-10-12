"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DiningTableTable } from "./DiningTableTable";
import type { DiningTableAuthScope } from "@/lib/dashboard/dining-table-query-keys";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

interface DiningTableListPageProps {
  authScope: DiningTableAuthScope;
  outletId: string;
  initialData?: DiningTableSummary[];
  initialDataUpdatedAt?: number;
  canManageTables?: boolean;
}

function DiningTableQueryScope({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageTables,
}: DiningTableListPageProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 10,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DiningTableTable
        authScope={authScope}
        outletId={outletId}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
        canManageTables={canManageTables}
      />
    </QueryClientProvider>
  );
}

export function DiningTableListPage({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageTables,
}: DiningTableListPageProps) {
  const scopeKey = JSON.stringify([authScope.tenantId, authScope.userId, outletId]);

  return (
    <DiningTableQueryScope
      key={scopeKey}
      authScope={authScope}
      outletId={outletId}
      initialData={initialData}
      initialDataUpdatedAt={initialDataUpdatedAt}
      canManageTables={canManageTables}
    />
  );
}
