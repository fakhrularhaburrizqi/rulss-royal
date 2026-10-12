import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchMenuItems } from "@/lib/api/menu-items";
import { MenuItemTable } from "@/app/dashboard/menu/MenuItemTable";
import { menuItemKeys, type MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem, PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

vi.mock("@/lib/api/menu-items", () => ({
  fetchMenuItems: vi.fn(),
}));

vi.mock("@/lib/api/categories", () => ({
  fetchCategories: vi.fn().mockResolvedValue({
    data: [{ id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }],
    nextCursor: null,
    hasMore: false,
  }),
}));

const mockCreateMenuItemAction = vi.hoisted(() => vi.fn());
const mockUpdateMenuItemAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/dashboard/menu-actions", () => ({
  createMenuItemAction: mockCreateMenuItemAction,
  updateMenuItemAction: mockUpdateMenuItemAction,
}));

const mockedFetchMenuItems = vi.mocked(fetchMenuItems);

const authScope: MenuItemAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

function makeItem(
  overrides: Partial<ManagementMenuItemListItem> & { id: string; name: string }
): ManagementMenuItemListItem {
  return {
    categoryId: "cat-1",
    description: null,
    price: 15000,
    imageUrl: null,
    imageAlt: null,
    sortOrder: 0,
    isActive: true,
    isSoldOut: false,
    deletedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
    ...overrides,
  };
}

const mockData: PaginatedMenuItemsResult = {
  data: [
    makeItem({ id: "item-1", name: "Nasi Goreng" }),
    makeItem({ id: "item-2", name: "Es Teh", price: 8000 }),
  ],
  nextCursor: "cursor-next",
  hasMore: true,
};

const mockEmptyData: PaginatedMenuItemsResult = { data: [], nextCursor: null, hasMore: false };

const staleUpdatedAt = () => Date.now() - 1000 * 60 * 10;

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function apiError(status: number, code: string, message: string): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

describe("useMenuItemsQuery behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchMenuItems.mockResolvedValue(mockEmptyData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses initialData only for exact initial query key", async () => {
    renderWithProvider(
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={Date.now()}
      />
    );

    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());
    expect(screen.getByText("Es Teh")).toBeInTheDocument();
    expect(mockedFetchMenuItems).not.toHaveBeenCalled();
  });

  it("passes outlet, filter, normalized search, limit and cursor to fetchMenuItems", async () => {
    let capturedParams: unknown;
    mockedFetchMenuItems.mockImplementation(async (params) => {
      capturedParams = params;
      return mockEmptyData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(capturedParams).toBeDefined());

    expect(capturedParams).toEqual({
      outletId,
      filter: "all",
      search: undefined,
      limit: 50,
      cursor: undefined,
    });
  });

  it("auth/outlet boundary change does not leak stale data from previous scope", async () => {
    const outlet1Data: PaginatedMenuItemsResult = {
      data: [makeItem({ id: "item-o1", name: "Outlet1 Nasi" })],
      nextCursor: null,
      hasMore: false,
    };
    const outlet2Data: PaginatedMenuItemsResult = {
      data: [makeItem({ id: "item-o2", name: "Outlet2 Mie" })],
      nextCursor: null,
      hasMore: false,
    };

    let fetchCount = 0;
    mockedFetchMenuItems.mockImplementation(async (params) => {
      fetchCount++;
      return params.outletId === "outlet-1" ? outlet1Data : outlet2Data;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });
    const ui = (currentOutletId: string, data: PaginatedMenuItemsResult) => (
      <QueryClientProvider client={queryClient}>
        <MenuItemTable
          authScope={authScope}
          outletId={currentOutletId}
          initialData={data}
          initialDataUpdatedAt={staleUpdatedAt()}
        />
      </QueryClientProvider>
    );

    const { rerender } = render(ui("outlet-1", outlet1Data));
    await waitFor(() => expect(screen.getByText("Outlet1 Nasi")).toBeInTheDocument());

    rerender(ui("outlet-2", outlet2Data));
    await waitFor(() => expect(screen.getByText("Outlet2 Mie")).toBeInTheDocument());

    expect(screen.queryByText("Outlet1 Nasi")).not.toBeInTheDocument();
    expect(fetchCount).toBeGreaterThan(0);
  });

  it("AbortSignal is passed to fetchMenuItems", async () => {
    let capturedSignal: AbortSignal | undefined = undefined;
    mockedFetchMenuItems.mockImplementation(async (_params, signal) => {
      capturedSignal = signal;
      return mockEmptyData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
  });

  it("401 does not retry and shows auth error without stale rows", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    renderWithProvider(
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={staleUpdatedAt()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Sesi Anda telah berakhir. Silakan masuk kembali.")).toBeInTheDocument();
      expect(screen.queryByText("Nasi Goreng")).not.toBeInTheDocument();
    });
    expect(mockedFetchMenuItems).toHaveBeenCalledTimes(1);
  });

  it("403 does not retry and shows access error without stale rows", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(403, "OUTLET_ACCESS_DENIED", "Akses ditolak");
    });

    renderWithProvider(
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={staleUpdatedAt()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Anda tidak memiliki akses ke menu di outlet ini.")).toBeInTheDocument();
      expect(screen.queryByText("Nasi Goreng")).not.toBeInTheDocument();
    });
    expect(mockedFetchMenuItems).toHaveBeenCalledTimes(1);
  });

  it("401 does not cause a refetch loop", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(mockedFetchMenuItems).toHaveBeenCalledTimes(1);
  });

  it("handles malformed JSON response safely", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(500, "INVALID_RESPONSE", "Respons tidak valid");
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Gagal Memuat" })).toBeInTheDocument();
      expect(screen.getByText("Gagal memuat menu. Silakan coba lagi.")).toBeInTheDocument();
    });
  });

  it("handles HTTP error with non-JSON response", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(502, "INTERNAL_ERROR", "HTTP Error");
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Gagal Memuat" })).toBeInTheDocument();
    });
  });

  it("handles missing required fields in response", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(500, "INVALID_RESPONSE", "Invalid response");
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Gagal Memuat" })).toBeInTheDocument();
    });
  });

  it("keeps draft in input and commits trimmed search after debounce", async () => {
    interface RecordedCall {
      search: string | undefined;
      filter: string | undefined;
      cursor: string | undefined;
    }
    const calls: RecordedCall[] = [];
    mockedFetchMenuItems.mockImplementation(async (params) => {
      calls.push({ search: params.search, filter: params.filter, cursor: params.cursor });
      return mockEmptyData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Cari menu")).toBeInTheDocument());
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].search).toBeUndefined();

    const input = screen.getByLabelText("Cari menu") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  nasi  " } });

    expect(input).toHaveValue("  nasi  ");
    const beforeCommit = calls.length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    await waitFor(() => expect(calls.length).toBeGreaterThan(beforeCommit));
    const lastCall = calls[calls.length - 1];
    expect(lastCall.search).toBe("nasi");
    expect(lastCall.filter).toBe("all");
    expect(lastCall.cursor).toBeUndefined();
    expect(calls.filter((c) => c.search === "nasi")).toHaveLength(1);
  });

  it("debounce boundary: 299ms keeps draft uncommitted, 300ms commits trimmed search with undefined cursor", async () => {
    vi.useFakeTimers();
    try {
      interface RecordedCall {
        search: string | undefined;
        filter: string | undefined;
        cursor: string | undefined;
      }
      const calls: RecordedCall[] = [];
      mockedFetchMenuItems.mockImplementation(async (params) => {
        calls.push({ search: params.search, filter: params.filter, cursor: params.cursor });
        return mockEmptyData;
      });

      renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0));
      expect(calls[0].search).toBeUndefined();
      const initialCount = calls.length;

      const input = screen.getByLabelText("Cari menu") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "  nasi goreng  " } });
      expect(input).toHaveValue("  nasi goreng  ");

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(calls).toHaveLength(initialCount);
      expect(screen.getByLabelText("Cari menu")).toHaveValue("  nasi goreng  ");

      act(() => {
        vi.advanceTimersByTime(1);
      });

      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(initialCount));
      expect(calls).toHaveLength(initialCount + 1);
      const lastCall = calls[calls.length - 1];
      expect(lastCall.search).toBe("nasi goreng");
      expect(lastCall.filter).toBe("all");
      expect(lastCall.cursor).toBeUndefined();
      expect(input).toHaveValue("  nasi goreng  ");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Previous from cursor index 0 returns to first page at index -1 with cursor undefined", async () => {
    const calls: Array<{ cursor: string | undefined }> = [];
    mockedFetchMenuItems.mockImplementation(async (params) => {
      calls.push({ cursor: params.cursor });
      if (params.cursor === "cursor-p2") {
        return {
          data: [makeItem({ id: "page-2", name: "Halaman Kedua" })],
          nextCursor: null,
          hasMore: false,
        } satisfies PaginatedMenuItemsResult;
      }
      return {
        data: [makeItem({ id: "page-1", name: "Halaman Pertama" })],
        nextCursor: "cursor-p2",
        hasMore: true,
      } satisfies PaginatedMenuItemsResult;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MenuItemTable authScope={authScope} outletId={outletId} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Halaman Pertama")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([undefined]);
    expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Halaman selanjutnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Kedua")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([undefined, "cursor-p2"]);
    expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).not.toBeDisabled();

    await queryClient.invalidateQueries({ queryKey: menuItemKeys().all, refetchType: "none" });

    fireEvent.click(screen.getByRole("button", { name: "Halaman sebelumnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Pertama")).toBeInTheDocument());
    await waitFor(() => expect(calls.map((c) => c.cursor)).toEqual([undefined, "cursor-p2", undefined]));

    const prevButton = screen.getByRole("button", { name: "Halaman sebelumnya" });
    expect(prevButton).toBeDisabled();
    const callCount = calls.length;
    fireEvent.click(prevButton);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(calls).toHaveLength(callCount);
    expect(screen.getByRole("button", { name: "Halaman selanjutnya" })).not.toBeDisabled();
  });

  it("Next after Previous truncates the stale forward branch instead of replaying it", async () => {
    const calls: Array<{ cursor: string | undefined }> = [];
    let page2Visits = 0;
    mockedFetchMenuItems.mockImplementation(async (params) => {
      calls.push({ cursor: params.cursor });
      if (params.cursor === "cursor-p2") {
        page2Visits += 1;
        if (page2Visits === 1) {
          return {
            data: [makeItem({ id: "p2a", name: "Halaman Dua" })],
            nextCursor: "cursor-p3",
            hasMore: true,
          } satisfies PaginatedMenuItemsResult;
        }
        return {
          data: [makeItem({ id: "p2b", name: "Halaman Dua Segar" })],
          nextCursor: "cursor-p3-baru",
          hasMore: true,
        } satisfies PaginatedMenuItemsResult;
      }
      if (params.cursor === "cursor-p3") {
        return {
          data: [makeItem({ id: "p3", name: "Halaman Tiga" })],
          nextCursor: null,
          hasMore: false,
        } satisfies PaginatedMenuItemsResult;
      }
      if (params.cursor === "cursor-p3-baru") {
        return {
          data: [makeItem({ id: "p3b", name: "Halaman Tiga Baru" })],
          nextCursor: null,
          hasMore: false,
        } satisfies PaginatedMenuItemsResult;
      }
      return {
        data: [makeItem({ id: "p1", name: "Halaman Satu" })],
        nextCursor: "cursor-p2",
        hasMore: true,
      } satisfies PaginatedMenuItemsResult;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MenuItemTable authScope={authScope} outletId={outletId} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText("Halaman Satu")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Halaman selanjutnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Dua")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([undefined, "cursor-p2"]);

    fireEvent.click(screen.getByRole("button", { name: "Halaman selanjutnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Tiga")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([undefined, "cursor-p2", "cursor-p3"]);

    await queryClient.invalidateQueries({ queryKey: menuItemKeys().all, refetchType: "none" });

    fireEvent.click(screen.getByRole("button", { name: "Halaman sebelumnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Dua Segar")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([undefined, "cursor-p2", "cursor-p3", "cursor-p2"]);

    fireEvent.click(screen.getByRole("button", { name: "Halaman selanjutnya" }));
    await waitFor(() => expect(screen.getByText("Halaman Tiga Baru")).toBeInTheDocument());
    expect(calls.map((c) => c.cursor)).toEqual([
      undefined,
      "cursor-p2",
      "cursor-p3",
      "cursor-p2",
      "cursor-p3-baru",
    ]);
    expect(calls.filter((c) => c.cursor === "cursor-p3")).toHaveLength(1);
  });

  it("aborts obsolete request when filter changes and late response does not replace new results", async () => {
    let firstRequestResolve: (value: PaginatedMenuItemsResult) => void;
    let secondRequestResolve: (value: PaginatedMenuItemsResult) => void;
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let firstAborted = false;
    let secondAborted = false;

    mockedFetchMenuItems.mockImplementation(async (_params, signal) => {
      if (!firstSignal) {
        firstSignal = signal;
        return new Promise<PaginatedMenuItemsResult>((resolve) => {
          firstRequestResolve = resolve;
          signal?.addEventListener("abort", () => {
            firstAborted = true;
          });
        });
      } else {
        secondSignal = signal;
        return new Promise<PaginatedMenuItemsResult>((resolve) => {
          secondRequestResolve = resolve;
          signal?.addEventListener("abort", () => {
            secondAborted = true;
          });
        });
      }
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Filter menu")).toBeInTheDocument());
    await waitFor(() => expect(firstSignal).toBeDefined());

    expect(firstAborted).toBe(false);

    const select = screen.getByLabelText("Filter menu") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "active" } });

    await waitFor(() => expect(secondSignal).toBeDefined());
    expect(firstAborted).toBe(true);
    expect(secondAborted).toBe(false);

    firstRequestResolve!({
      data: [makeItem({ id: "item-old", name: "Old Data" })],
      nextCursor: null,
      hasMore: false,
    });

    secondRequestResolve!({
      data: [makeItem({ id: "item-new", name: "New Data" })],
      nextCursor: null,
      hasMore: false,
    });

    await waitFor(() => expect(screen.getByText("New Data")).toBeInTheDocument());
    expect(screen.queryByText("Old Data")).not.toBeInTheDocument();
  });

  it("aborts obsolete request on unmount and late response does not cause error", async () => {
    let requestResolve: (value: PaginatedMenuItemsResult) => void;
    let signal: AbortSignal | undefined;
    let aborted = false;

    mockedFetchMenuItems.mockImplementation(async (_params, s) => {
      signal = s;
      return new Promise<PaginatedMenuItemsResult>((resolve) => {
        requestResolve = resolve;
        s?.addEventListener("abort", () => {
          aborted = true;
        });
      });
    });

    const { unmount } = renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Filter menu")).toBeInTheDocument());
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(aborted).toBe(true);

    requestResolve!({
      data: [makeItem({ id: "item-late", name: "Late Data" })],
      nextCursor: null,
      hasMore: false,
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  it("401/403 terminal: single attempt, no cached rows in UI, no refetch on search/filter/rerender, new scope can query", async () => {
    let fetchCount = 0;
    mockedFetchMenuItems.mockImplementation(async () => {
      fetchCount++;
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    function TestComponent() {
      return (
        <MenuItemTable
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
    expect(screen.queryByText("Nasi Goreng")).not.toBeInTheDocument();
    expect(screen.queryByText("Es Teh")).not.toBeInTheDocument();
    expect(fetchCount).toBe(1);

    const filterSelect = screen.getByLabelText("Filter menu") as HTMLSelectElement;
    fireEvent.change(filterSelect, { target: { value: "active" } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(fetchCount).toBe(1);

    const searchInput = screen.getByLabelText("Cari menu") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "nasi" } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(fetchCount).toBe(1);

    const { unmount } = renderWithProvider(<TestComponent />);
    unmount();

    fetchCount = 0;
    mockedFetchMenuItems.mockImplementation(async () => {
      fetchCount++;
      return mockEmptyData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Tidak ada menu ditemukan")).toBeInTheDocument());
    expect(fetchCount).toBe(1);
  });

  it("retries non-auth 4 attempts total (1 initial + 3 retries) with backoff", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      mockedFetchMenuItems.mockImplementation(async () => {
        attempts++;
        throw apiError(500, "INTERNAL_ERROR", "Server error");
      });

      renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

      await vi.waitFor(() => expect(attempts).toBe(1));

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          vi.advanceTimersByTime(5000);
        });
      }

      await vi.waitFor(() => expect(attempts).toBe(4));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reuse placeholder across incompatible scope (different outlet or filter)", async () => {
    mockedFetchMenuItems.mockImplementation(async (params) => {
      if (params.outletId === "outlet-1") {
        return {
          data: [makeItem({ id: "item-o1", name: "Outlet 1 Menu" })],
          nextCursor: null,
          hasMore: false,
        };
      }
      return {
        data: [makeItem({ id: "item-o2", name: "Outlet 2 Menu" })],
        nextCursor: null,
        hasMore: false,
      };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MenuItemTable authScope={authScope} outletId="outlet-1" initialData={mockData} initialDataUpdatedAt={staleUpdatedAt()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    rerender(
      <QueryClientProvider client={queryClient}>
        <MenuItemTable authScope={authScope} outletId="outlet-2" initialData={mockData} initialDataUpdatedAt={staleUpdatedAt()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Outlet 2 Menu")).toBeInTheDocument());
    expect(screen.queryByText("Nasi Goreng")).not.toBeInTheDocument();
  });

  it("resets pagination history on filter or search change", async () => {
    mockedFetchMenuItems.mockImplementation(async (params) => {
      if (params.cursor === "cursor-p2") {
        return {
          data: [makeItem({ id: "p2", name: "Page Two" })],
          nextCursor: null,
          hasMore: false,
        };
      }
      return {
        data: [makeItem({ id: "p1", name: "Page One" })],
        nextCursor: "cursor-p2",
        hasMore: true,
      };
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Page One")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Halaman selanjutnya" }));
    await waitFor(() => expect(screen.getByText("Page Two")).toBeInTheDocument());

    const select = screen.getByLabelText("Filter menu") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "active" } });

    await waitFor(() => expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled());
  });

  it("maintains current view state during background refetch", async () => {
    let callCount = 0;
    mockedFetchMenuItems.mockImplementation(async () => {
      callCount++;
      return mockData;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MenuItemTable authScope={authScope} outletId={outletId} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    await act(async () => {
      await queryClient.refetchQueries({ queryKey: menuItemKeys().all });
    });

    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
    expect(screen.getByText("Es Teh")).toBeInTheDocument();
  });
});
