"use client";

import React from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTable } from "./CategoryTable";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";

interface CategoryListPageProps {
  authScope: CategoryAuthScope;
  outletId: string;
  initialData?: {
    data: ReadonlyArray<{
      id: string;
      name: string;
      sortOrder: number;
      isActive: boolean;
      deletedAt: string | null;
      updatedAt: string;
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  };
  initialDataUpdatedAt?: number;
}

function CategoryQueryScope({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: CategoryListPageProps) {
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
      <CategoryTable
        authScope={authScope}
        outletId={outletId}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
      />
    </QueryClientProvider>
  );
}

export function CategoryListPage({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: CategoryListPageProps) {
  const scopeKey = JSON.stringify([authScope.tenantId, authScope.userId, outletId]);

  return (
    <CategoryQueryScope
      key={scopeKey}
      authScope={authScope}
      outletId={outletId}
      initialData={initialData}
      initialDataUpdatedAt={initialDataUpdatedAt}
    />
  );
}
