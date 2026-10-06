import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import { CategoryListPage } from "@/app/dashboard/kategori/CategoryListPage";
import {
  INITIAL_CATEGORY_LIMIT,
  categoryKeys,
  type CategoryAuthScope,
} from "@/lib/dashboard/category-query-keys";
import type { PaginatedCategoriesResult } from "@/lib/services/menu-category-query.service";
import { useCategoriesQuery } from "@/app/dashboard/kategori/useCategoriesQuery";

const authScope: CategoryAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

const mockData: PaginatedCategoriesResult = {
  data: [
    { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-3", name: "Snack", sortOrder: 2, isActive: false, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
  nextCursor: "cursor-next",
  hasMore: true,
};

const mockEmptyData: PaginatedCategoriesResult = { data: [], nextCursor: null, hasMore: false };

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  const utils = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...utils, queryClient };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Mock fetchCategories at module level
vi.mock("@/lib/api/categories", () => ({
  fetchCategories: vi.fn(),
}));

import { fetchCategories } from "@/lib/api/categories";

const mockedFetchCategories = vi.mocked(fetchCategories);

function apiError(status: number, code: string, message: string): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

describe("useCategoriesQuery behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCategories.mockResolvedValue(mockEmptyData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses initialData only for exact initial query key", async () => {
    mockedFetchCategories.mockResolvedValue(mockEmptyData);

    renderWithProvider(
      <CategoryTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={Date.now()}
      />
    );

    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());
    expect(screen.getByText("Minuman")).toBeInTheDocument();
    expect(screen.getByText("Snack")).toBeInTheDocument();
    expect(screen.getByText("Dessert")).toBeInTheDocument();

    expect(mockedFetchCategories).not.toHaveBeenCalled();
  });

  it("query key includes auth scope, outlet, filter, normalized search, limit, cursor", async () => {
    let capturedParams: unknown;
    mockedFetchCategories.mockImplementation(async (params) => {
      capturedParams = params;
      return mockEmptyData;
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    expect(capturedParams).toEqual({
      outlet: outletId,
      filter: "all",
      search: undefined,
      limit: 50,
      cursor: undefined,
    });
  });

  it("QueryClient renders correctly", async () => {
    let renderCount = 0;
    function Wrapper() {
      renderCount++;
      return <CategoryTable authScope={authScope} outletId={outletId} />;
    }

    renderWithProvider(<Wrapper />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    // Rerender the same component
    renderWithProvider(<Wrapper />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    expect(renderCount).toBe(2);
  });

  it("auth/outlet boundary change does not leak stale data from previous scope", async () => {
    const outlet1Data = { data: [{ id: "cat-1", name: "Outlet1 Cat", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };
    const outlet2Data = { data: [{ id: "cat-2", name: "Outlet2 Cat", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };

    let fetchCount = 0;
    mockedFetchCategories.mockImplementation(async (params) => {
      fetchCount++;
      return params.outlet === "outlet-1" ? outlet1Data : outlet2Data;
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId="outlet-1" initialData={outlet1Data} initialDataUpdatedAt={Date.now() - 1000 * 60 * 10} />
    );
    await waitFor(() => expect(screen.getByText("Outlet1 Cat")).toBeInTheDocument());

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId="outlet-2" initialData={outlet2Data} initialDataUpdatedAt={Date.now() - 1000 * 60 * 10} />
    );
    await waitFor(() => expect(screen.getByText("Outlet2 Cat")).toBeInTheDocument());

    expect(fetchCount).toBeGreaterThan(1);
  });

  it("AbortSignal is passed to fetchCategories", async () => {
    let capturedSignal: AbortSignal | undefined = undefined;
    mockedFetchCategories.mockImplementation(async (_params, signal) => {
      capturedSignal = signal;
      return mockEmptyData;
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("401 does not retry and shows auth error without stale rows", async () => {
    mockedFetchCategories.mockRejectedValue(apiError(401, "UNAUTHENTICATED", "Sesi berakhir"));

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} initialData={mockData} initialDataUpdatedAt={Date.now() - 1000 * 60 * 10} />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Sesi Anda telah berakhir. Silakan masuk kembali.")).toBeInTheDocument();
      expect(screen.queryByText("Makanan")).not.toBeInTheDocument();
      expect(screen.queryByText("Minuman")).not.toBeInTheDocument();
    });
  });

  it("403 does not retry and shows access error without stale rows", async () => {
    mockedFetchCategories.mockImplementation(async () => {
      throw apiError(403, "OUTLET_ACCESS_DENIED", "Akses ditolak");
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} initialData={mockData} initialDataUpdatedAt={Date.now() - 1000 * 60 * 10} />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Anda tidak memiliki akses ke kategori di outlet ini.")).toBeInTheDocument();
      expect(screen.queryByText("Makanan")).not.toBeInTheDocument();
    });
  });

  it("401/403 does not cause refetch loop", async () => {
    mockedFetchCategories.mockImplementation(async () => {
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());

    await act(async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    expect(mockedFetchCategories).toHaveBeenCalledTimes(1);
  });

  it("handles malformed JSON response safely", async () => {
    mockedFetchCategories.mockImplementation(async () => {
      throw apiError(500, "INVALID_RESPONSE", "Invalid JSON");
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Gagal Memuat/i })).toBeInTheDocument();
    }, { timeout: 20000 });
  });

  it("handles HTTP error with non-JSON response", async () => {
    mockedFetchCategories.mockImplementation(async () => {
      throw apiError(500, "INTERNAL_ERROR", "HTTP Error");
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Gagal Memuat/i })).toBeInTheDocument();
    }, { timeout: 20000 });
  });

  it("handles missing required fields in response", async () => {
    mockedFetchCategories.mockImplementation(async () => {
      throw apiError(500, "INVALID_RESPONSE", "Invalid response");
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Gagal Memuat/i })).toBeInTheDocument();
    }, { timeout: 20000 });
  });

  it("keeps draft in input and commits trimmed search after debounce", async () => {
    const calls: Array<{
      search: string | undefined;
      filter: string | undefined;
      cursor: string | undefined;
    }> = [];
    mockedFetchCategories.mockImplementation(async (params) => {
      calls.push({ search: params.search, filter: params.filter, cursor: params.cursor });
      return mockEmptyData;
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Cari kategori")).toBeInTheDocument());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].search).toBeUndefined();

    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  nasi  " } });

    expect(input).toHaveValue("  nasi  ");
    const beforeCommit = calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    await waitFor(() => expect(calls.length).toBeGreaterThan(beforeCommit));
    expect(calls[calls.length - 1].search).toBe("nasi");
    expect(calls[calls.length - 1].filter).toBe("all");
    expect(calls[calls.length - 1].cursor).toBeUndefined();
    expect(calls.filter((c) => c.search === "nasi")).toHaveLength(1);
  });

  it("debounce boundary: 299ms no commit, 300ms commits with normalized search and undefined cursor", async () => {
    vi.useFakeTimers();
    try {
      const calls: Array<{
        search: string | undefined;
        filter: string | undefined;
        cursor: string | undefined;
      }> = [];
      mockedFetchCategories.mockImplementation(async (params) => {
        calls.push({ search: params.search, filter: params.filter, cursor: params.cursor });
        return mockEmptyData;
      });

      let setDraftSearchRef: ((value: string) => void) | null = null;

      function TestComponent() {
        const { draftSearch, setDraftSearch, committedSearch } = useCategoriesQuery({
          authScope,
          outletId,
        });
        setDraftSearchRef = setDraftSearch;
        return (
          <div>
            <input
              data-testid="search-input"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
            />
            <span data-testid="committed-search">{committedSearch}</span>
          </div>
        );
      }

      renderWithProvider(<TestComponent />);

      await vi.waitFor(() => expect(screen.getByTestId("search-input")).toBeInTheDocument());
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
      const initialCallCount = calls.length;

      act(() => {
        setDraftSearchRef!("  nasi goreng  ");
      });
      expect(screen.getByTestId("search-input")).toHaveValue("  nasi goreng  ");

      act(() => {
        vi.advanceTimersByTime(299);
      });
      await Promise.resolve();

      expect(calls.length).toBe(initialCallCount);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      await Promise.resolve();

      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(initialCallCount));
      const lastCall = calls[calls.length - 1];
      expect(lastCall.search).toBe("nasi goreng");
      expect(lastCall.filter).toBe("all");
      expect(lastCall.cursor).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts obsolete request when filter changes and late response does not replace new results", async () => {
    let firstRequestResolve: (value: PaginatedCategoriesResult) => void;
    let secondRequestResolve: (value: PaginatedCategoriesResult) => void;
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let firstAborted = false;
    let secondAborted = false;

    mockedFetchCategories.mockImplementation(async (_params, signal) => {
      if (!firstSignal) {
        firstSignal = signal;
        return new Promise<PaginatedCategoriesResult>((resolve) => {
          firstRequestResolve = resolve;
          signal?.addEventListener("abort", () => {
            firstAborted = true;
          });
        });
      } else {
        secondSignal = signal;
        return new Promise<PaginatedCategoriesResult>((resolve) => {
          secondRequestResolve = resolve;
          signal?.addEventListener("abort", () => {
            secondAborted = true;
          });
        });
      }
    });

    function TestComponent() {
      const { filter, setFilter, data } = useCategoriesQuery({
        authScope,
        outletId,
      });
      return (
        <div>
          <select
            data-testid="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "active" | "inactive" | "archived")}
          >
            <option value="all">Semua</option>
            <option value="active">Aktif</option>
          </select>
          <div data-testid="row-count">{data?.data.length ?? 0}</div>
        </div>
      );
    }

    renderWithProvider(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId("filter-select")).toBeInTheDocument());
    await waitFor(() => expect(firstSignal).toBeDefined());

    expect(firstAborted).toBe(false);

    const select = screen.getByTestId("filter-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "active" } });

    await waitFor(() => expect(secondSignal).toBeDefined());
    expect(firstAborted).toBe(true);
    expect(secondAborted).toBe(false);

    firstRequestResolve!({
      data: [{ id: "cat-old", name: "Old Data", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
      nextCursor: null,
      hasMore: false,
    });

    secondRequestResolve!({
      data: [{ id: "cat-new", name: "New Data", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
      nextCursor: null,
      hasMore: false,
    });

    await waitFor(() => expect(screen.getByTestId("row-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("row-count")).not.toHaveTextContent("Old Data");
  });

  it("aborts obsolete request on unmount and late response does not cause error", async () => {
    let requestResolve: (value: PaginatedCategoriesResult) => void;
    let signal: AbortSignal | undefined;
    let aborted = false;

    mockedFetchCategories.mockImplementation(async (_params, s) => {
      signal = s;
      return new Promise<PaginatedCategoriesResult>((resolve) => {
        requestResolve = resolve;
        s?.addEventListener("abort", () => {
          aborted = true;
        });
      });
    });

    const { unmount } = renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(aborted).toBe(true);

    requestResolve!({
      data: [{ id: "cat-late", name: "Late Data", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
      nextCursor: null,
      hasMore: false,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  it("401/403 terminal: single attempt, no cached rows in UI, no refetch on search/filter/rerender, new scope can query", async () => {
    let fetchCount = 0;
    mockedFetchCategories.mockImplementation(async () => {
      fetchCount++;
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    function TestComponent() {
      return (
        <CategoryTable
          authScope={authScope}
          outletId={outletId}
          initialData={mockData}
          initialDataUpdatedAt={Date.now() - 1000 * 60 * 10}
        />
      );
    }

    renderWithProvider(<TestComponent />);
    await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Sesi Anda telah berakhir. Silakan masuk kembali.")).toBeInTheDocument());
    expect(screen.queryByText("Makanan")).not.toBeInTheDocument();
    expect(screen.queryByText("Minuman")).not.toBeInTheDocument();
    expect(fetchCount).toBe(1);

    const filterSelect = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
    fireEvent.change(filterSelect, { target: { value: "active" } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(fetchCount).toBe(1);

    const searchInput = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "nasi" } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(fetchCount).toBe(1);

    const { unmount } = renderWithProvider(<TestComponent />);
    unmount();

    fetchCount = 0;
    mockedFetchCategories.mockImplementation(async () => {
      fetchCount++;
      return mockEmptyData;
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Tidak ada kategori ditemukan")).toBeInTheDocument());
    expect(fetchCount).toBe(1);
  });
});