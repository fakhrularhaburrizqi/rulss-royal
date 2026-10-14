"use client";

import React from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MenuItemTable } from "./MenuItemTable";
import type { MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

interface MenuListPageProps {
  authScope: MenuItemAuthScope;
  outletId: string;
  initialData?: PaginatedMenuItemsResult;
  initialDataUpdatedAt?: number;
  canManageCatalog?: boolean;
}

function MenuQueryScope({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageCatalog,
}: MenuListPageProps) {
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
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={initialData}
        initialDataUpdatedAt={initialDataUpdatedAt}
        canManageCatalog={canManageCatalog}
      />
    </QueryClientProvider>
  );
}

export function MenuListPage({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
  canManageCatalog = false,
}: MenuListPageProps) {
  const scopeKey = JSON.stringify([authScope.tenantId, authScope.userId, outletId]);

  return (
    <MenuQueryScope
      key={scopeKey}
      authScope={authScope}
      outletId={outletId}
      initialData={initialData}
      initialDataUpdatedAt={initialDataUpdatedAt}
      canManageCatalog={canManageCatalog}
    />
  );
}
