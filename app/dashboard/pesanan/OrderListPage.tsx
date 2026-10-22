"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderTable } from "./OrderTable";
import type { OrderListItem } from "@/lib/services/order-query.service";

interface OrderListPageProps {
  outletId: string;
  initialOrders: OrderListItem[];
}

function OrderQueryScope({ outletId, initialOrders }: OrderListPageProps) {
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
      <OrderTable outletId={outletId} initialOrders={initialOrders} />
    </QueryClientProvider>
  );
}

export function OrderListPage({ outletId, initialOrders }: OrderListPageProps) {
  const scopeKey = JSON.stringify([outletId]);
  return <OrderQueryScope key={scopeKey} outletId={outletId} initialOrders={initialOrders} />;
}
