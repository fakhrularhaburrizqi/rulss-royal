"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCategories } from "@/lib/api/categories";
import {
  INITIAL_CATEGORY_LIMIT,
  canReuseCategoryPlaceholder,
  categoryKeys,
  isInitialCategoryScope,
  type CategoryAuthScope,
  type CategoryQueryParams,
} from "@/lib/dashboard/category-query-keys";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_SEARCH_LENGTH = 80;

type CategoryFilter = CategoryQueryParams["filter"];

interface UseCategoriesQueryOptions {
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

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isAuthStatus(error: unknown): boolean {
  const status = readStatus(error);
  return status === 401 || status === 403;
}

export function useCategoriesQuery({
  authScope,
  outletId,
  initialData,
  initialDataUpdatedAt,
}: UseCategoriesQueryOptions) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<CategoryFilter>("all");
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
      void queryClient.cancelQueries({ queryKey: categoryKeys().all });
      setSearch(raw.trim());
      setCursorHistory([]);
      setCurrentCursorIndex(-1);
    },
    [queryClient]
  );

  const normalizedSearch = search.trim() || undefined;
  const currentCursor = currentCursorIndex >= 0 ? cursorHistory[currentCursorIndex] : undefined;
  const queryParams: CategoryQueryParams = {
    outletId,
    filter,
    search: normalizedSearch,
    limit: INITIAL_CATEGORY_LIMIT,
    cursor: currentCursor,
  };
  const isInitialScope = isInitialCategoryScope(filter, normalizedSearch, INITIAL_CATEGORY_LIMIT, currentCursor);

  const query = useQuery({
    queryKey: categoryKeys().list(authScope, queryParams),
    queryFn: ({ signal }) =>
      fetchCategories(
        {
          outlet: outletId,
          filter,
          search: normalizedSearch,
          limit: INITIAL_CATEGORY_LIMIT,
          cursor: currentCursor,
        },
        signal
      ),
    initialData: isInitialScope ? initialData : undefined,
    initialDataUpdatedAt: isInitialScope ? initialDataUpdatedAt : undefined,
    enabled: terminalAuthError === null,
    placeholderData: (previousData, previousQuery) => {
      if (previousData === undefined || previousQuery === undefined) return undefined;
      if (!canReuseCategoryPlaceholder(previousQuery.queryKey, { authScope, params: queryParams })) return undefined;
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
    (newFilter: CategoryFilter) => {
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
    committedSearch: search,
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
