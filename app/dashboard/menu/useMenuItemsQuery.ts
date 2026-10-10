"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMenuItems } from "@/lib/api/menu-items";
import {
  INITIAL_MENU_ITEM_LIMIT,
  canReuseMenuPlaceholder,
  isInitialMenuItemScope,
  menuItemKeys,
  type MenuItemAuthScope,
  type MenuItemQueryParams,
} from "@/lib/dashboard/menu-item-query-keys";
import type { PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SEARCH_LENGTH = 120;

type MenuItemFilter = MenuItemQueryParams["filter"];

interface UseMenuItemsQueryOptions {
  authScope: MenuItemAuthScope;
  outletId: string;
  initialData?: PaginatedMenuItemsResult;
  initialDataUpdatedAt?: number;
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isAuthStatus(error: unknown): boolean {
  const status = readStatus(error);
  return status === 401 || status === 403;
}

export function useMenuItemsQuery({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: UseMenuItemsQueryOptions) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<MenuItemFilter>("all");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [currentCursorIndex, setCurrentCursorIndex] = useState(-1);
  const [terminalAuthError, setTerminalAuthError] = useState<Error | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSearchRef = useRef("");
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (searchTimeoutRef.current !== null) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, []);

  const clearPendingSearch = useCallback(() => {
    if (searchTimeoutRef.current !== null) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  const commitDraftSearch = useCallback(
    (raw: string) => {
      void queryClient.cancelQueries({ queryKey: menuItemKeys().all });
      setSearch(raw.trim());
      setCursorHistory([]);
      setCurrentCursorIndex(-1);
    },
    [queryClient]
  );

  const normalizedSearch = search.trim() || undefined;
  const currentCursor = currentCursorIndex >= 0 ? cursorHistory[currentCursorIndex] : undefined;
  const queryParams: MenuItemQueryParams = {
    outletId,
    filter,
    search: normalizedSearch,
    limit: INITIAL_MENU_ITEM_LIMIT,
    cursor: currentCursor,
  };
  const isInitialScope = isInitialMenuItemScope(filter, normalizedSearch, INITIAL_MENU_ITEM_LIMIT, currentCursor);

  const query = useQuery({
    queryKey: menuItemKeys().list(authScope, queryParams),
    queryFn: ({ signal }) =>
      fetchMenuItems(
        {
          outletId,
          filter,
          search: normalizedSearch,
          limit: INITIAL_MENU_ITEM_LIMIT,
          cursor: currentCursor,
        },
        signal
      ),
    initialData: isInitialScope ? initialData : undefined,
    initialDataUpdatedAt: isInitialScope ? initialDataUpdatedAt : undefined,
    enabled: terminalAuthError === null,
    placeholderData: (previousData, previousQuery) => {
      if (previousData === undefined || previousQuery === undefined) return undefined;
      if (!canReuseMenuPlaceholder(previousQuery.queryKey, { authScope, params: queryParams })) return undefined;
      return previousData;
    },
    retry: (failureCount, error) => {
      if (isAuthStatus(error)) return false;
      return failureCount < 3;
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (query.isError && isAuthStatus(query.error)) {
      setTerminalAuthError(query.error);
    }
  }, [query.isError, query.error]);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (value.length > MAX_SEARCH_LENGTH) return;
      draftSearchRef.current = value;
      setDraftSearch(value);
      clearPendingSearch();
      searchTimeoutRef.current = setTimeout(() => {
        searchTimeoutRef.current = null;
        if (!isMountedRef.current) return;
        commitDraftSearch(draftSearchRef.current);
      }, SEARCH_DEBOUNCE_MS);
    },
    [clearPendingSearch, commitDraftSearch]
  );

  const handleFilterChange = useCallback(
    (newFilter: MenuItemFilter) => {
      clearPendingSearch();
      setFilter(newFilter);
      commitDraftSearch(draftSearchRef.current);
    },
    [clearPendingSearch, commitDraftSearch]
  );

  const goToNext = useCallback(() => {
    if (!query.data?.hasMore || query.isFetching || query.isPlaceholderData) return;
    const nextCursor = query.data.nextCursor;
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev.slice(0, currentCursorIndex + 1), nextCursor]);
    setCurrentCursorIndex((prev) => prev + 1);
  }, [
    query.data?.hasMore,
    query.data?.nextCursor,
    query.isFetching,
    query.isPlaceholderData,
    currentCursorIndex,
  ]);

  const goToPrevious = useCallback(() => {
    if (currentCursorIndex < 0 || query.isFetching) return;
    setCurrentCursorIndex((prev) => prev - 1);
  }, [currentCursorIndex, query.isFetching]);

  const refetch = useCallback(() => {
    query.refetch();
  }, [query]);

  const activeError: Error | null = terminalAuthError ?? query.error;

  return {
    filter,
    setFilter: handleFilterChange,
    draftSearch,
    setDraftSearch: handleSearchChange,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: activeError !== null,
    error: activeError,
    hasMore: query.data?.hasMore ?? false,
    canGoNext: (query.data?.hasMore ?? false) && !query.isFetching && !query.isPlaceholderData,
    canGoPrevious: currentCursorIndex >= 0 && !query.isFetching,
    goToNext,
    goToPrevious,
    refetch,
  };
}
