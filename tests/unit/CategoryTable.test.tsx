import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import { fetchCategories } from "@/lib/api/categories";
import { CategoryListPage } from "@/app/dashboard/kategori/CategoryListPage";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import { categoryKeys, INITIAL_CATEGORY_LIMIT } from "@/lib/dashboard/category-query-keys";
import type { PaginatedCategoriesResult } from "@/lib/services/menu-category-query.service";

// Mock server action boundary
const mockCreateCategoryAction = vi.hoisted(() => vi.fn());
const mockUpdateCategoryAction = vi.hoisted(() => vi.fn());
const mockArchiveCategoryAction = vi.hoisted(() => vi.fn());
const mockRestoreCategoryAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/dashboard/menu-actions", () => ({
  createCategoryAction: mockCreateCategoryAction,
  updateCategoryAction: mockUpdateCategoryAction,
  archiveCategoryAction: mockArchiveCategoryAction,
  restoreCategoryAction: mockRestoreCategoryAction,
}));

const authScope: CategoryAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

const mockData = {
  data: [
    { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-3", name: "Snack", sortOrder: 2, isActive: false, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
  nextCursor: "cursor-next",
  hasMore: true,
};

const mockEmptyData = { data: [], nextCursor: null, hasMore: false };

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

interface RecordedRequest {
  filter: string;
  search: string | null;
  cursor: string | null;
}

type CategoryResponder = (
  filter: string,
  search: string | null,
  cursor: string | null
) => unknown | Promise<unknown>;

const makeRow = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  sortOrder,
  isActive: true,
  deletedAt: null as string | null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const defaultResponder: CategoryResponder = (filter, search, cursor) => {
  if (filter === "active") {
    return { data: [makeRow("cat-active", "Aktif Saja", 0)], nextCursor: null, hasMore: false };
  }
  if (search) {
    return { data: [makeRow("cat-search", `Hasil ${search}`, 0)], nextCursor: null, hasMore: false };
  }
  if (cursor === "cursor-p2") {
    return { data: [makeRow("cat-p2", "Page 2", 1)], nextCursor: null, hasMore: false };
  }
  return { data: [makeRow("cat-p1", "Page 1", 0)], nextCursor: "cursor-p2", hasMore: true };
};

function installCategoryFetchRecorder(respond: CategoryResponder = defaultResponder) {
  const requests: RecordedRequest[] = [];
  global.fetch = vi.fn().mockImplementation(async (input: unknown) => {
    const url = new URL(String(input), "http://localhost");
    const filter = url.searchParams.get("filter") ?? "all";
    const search = url.searchParams.get("search");
    const cursor = url.searchParams.get("cursor");
    requests.push({ filter, search, cursor });
    const body = await respond(filter, search, cursor);
    return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
  });
  return requests;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("CategoryTable DOM", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Baru", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    mockUpdateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    mockArchiveCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    });
    mockRestoreCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: null, updatedAt: "2026-01-02T00:00:00.000Z" },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("renders filter select with all four options", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} />
    );

    await waitFor(() => {
      const select = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
      expect(select.options).toHaveLength(4);
      expect(select.options[0].value).toBe("all");
      expect(select.options[1].value).toBe("active");
      expect(select.options[2].value).toBe("inactive");
      expect(select.options[3].value).toBe("archived");
    });
  });

  it("renders status badges: Aktif, Tidak Aktif, Arsip", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} />
    );

    await waitFor(() => {
      const table = screen.getByRole("table");
      const tableBody = within(table).getAllByRole("rowgroup")[1];
      const rows = within(tableBody).getAllByRole("row");
      const statusCells = rows.flatMap(row => within(row).getAllByRole("cell")).filter(cell => cell.textContent?.includes("Aktif") || cell.textContent?.includes("Tidak Aktif") || cell.textContent?.includes("Arsip"));
      const aktifCount = statusCells.filter(cell => cell.textContent === "Aktif").length;
      expect(aktifCount).toBe(2);
      expect(within(tableBody).getByText("Tidak Aktif")).toBeInTheDocument();
      expect(within(tableBody).getByText("Arsip")).toBeInTheDocument();
    });
  });

  it("renders table columns: Urutan, Nama, Status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} />
    );

    await waitFor(() => {
      expect(screen.getByText("Urutan")).toBeInTheDocument();
      expect(screen.getByText("Nama")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });
  });

  it("shows loading skeleton on initial load without initialData", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    global.fetch = vi.fn().mockReturnValue(fetchPromise);

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getAllByRole("status")[0]).toHaveTextContent("");
      const pulseDivs = screen.getAllByRole("status")[0].querySelectorAll(".animate-pulse");
      expect(pulseDivs.length).toBeGreaterThanOrEqual(3);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    await act(async () => {
      resolveFetch!({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockEmptyData,
      });
      await fetchPromise;
    });
  });

  it("shows empty state when no data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Tidak ada kategori ditemukan")).toBeInTheDocument());
  });

  it("shows error state with retry button for non-auth errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "INTERNAL_ERROR", message: "Server error" }),
    });
    global.fetch = fetchMock;

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Gagal Memuat/i })).toBeInTheDocument();
      expect(screen.getByText("Coba Lagi")).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retry click after error: initial 500 -> error shows -> mock success -> click Coba Lagi -> data appears, error gone, no refetch loop", async () => {
    let fetchCount = 0;
    let shouldError = true;

    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      if (shouldError) {
        return {
          ok: false,
          status: 500,
          headers: { get: () => "application/json" },
          json: async () => ({ code: "INTERNAL_ERROR", message: "Server error" }),
        };
      }
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      };
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Gagal Memuat/i })).toBeInTheDocument();
      expect(screen.getByText("Coba Lagi")).toBeInTheDocument();
    }, { timeout: 3000 });

    const initialFetchCount = fetchCount;
    expect(initialFetchCount).toBeGreaterThan(0);

    shouldError = false;

    await userEvent.click(screen.getByText("Coba Lagi"));

    await waitFor(() => {
      expect(screen.getByText("Makanan")).toBeInTheDocument();
      expect(screen.getByText("Minuman")).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: /Gagal Memuat/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Coba Lagi")).not.toBeInTheDocument();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });

    expect(fetchCount).toBe(initialFetchCount + 1);
  });

  it("shows auth error without retry button for 401", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "UNAUTHENTICATED", message: "Sesi berakhir" }),
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Sesi Anda telah berakhir. Silakan masuk kembali.")).toBeInTheDocument();
      expect(screen.queryByText("Coba Lagi")).not.toBeInTheDocument();
    });
  });

  it("shows auth error without retry button for 403", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "OUTLET_ACCESS_DENIED", message: "Akses ditolak" }),
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Anda tidak memiliki akses ke kategori di outlet ini.")).toBeInTheDocument();
      expect(screen.queryByText("Coba Lagi")).not.toBeInTheDocument();
    });
  });

  it("filter change triggers refetch and resets cursor history", async () => {
    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => mockEmptyData };
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    const select = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
    await userEvent.selectOptions(select, "active");

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(0);
    });
  });

  it("search debounces at 300ms and cleans up on unmount", async () => {
    let searchFetchCount = 0;
    let initialFetchDone = false;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      const urlObj = new URL(url, "http://localhost");
      const searchParam = urlObj.searchParams.get("search");
      if (!initialFetchDone && !searchParam) {
        initialFetchDone = true;
        return { ok: true, headers: { get: () => "application/json" }, json: async () => mockEmptyData };
      }
      if (searchParam) {
        searchFetchCount++;
      }
      return { ok: true, headers: { get: () => "application/json" }, json: async () => mockEmptyData };
    });

    const { unmount } = renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByLabelText("Cari kategori")).toBeInTheDocument());
    await waitFor(() => expect(initialFetchDone).toBe(true));

    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    await userEvent.type(input, "test");

    unmount();

    await act(async () => {
      await new Promise(r => setTimeout(r, 500));
    });

    expect(searchFetchCount).toBe(0);
  });

  it("draft input updates immediately and commits search only after 300ms", async () => {
    const requests = installCategoryFetchRecorder();

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(screen.getByText("Page 1")).toBeInTheDocument());
    expect(requests).toHaveLength(1);

    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    await userEvent.type(input, "nasi");

    expect(input).toHaveValue("nasi");
    expect(requests).toHaveLength(1);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(requests).toHaveLength(1);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ filter: "all", search: "nasi", cursor: null });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(requests).toHaveLength(2);
  });

  it("search committed from page2 sends undefined cursor", async () => {
    const requests = installCategoryFetchRecorder();

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(screen.getByText("Page 1")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Page 2")).toBeInTheDocument());
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ filter: "all", search: null, cursor: "cursor-p2" });

    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    await userEvent.type(input, "nasi", { delay: 0 });

    expect(input).toHaveValue("nasi");
    expect(requests).toHaveLength(2);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual({ filter: "all", search: "nasi", cursor: null });
    expect(screen.getByText("Hasil nasi")).toBeInTheDocument();
  });

  it("rapid search then filter change does not use stale cursor", async () => {
    const gate = deferred();
    const requests = installCategoryFetchRecorder(async (filter, search, cursor) => {
      if (filter === "active") {
        await gate.promise;
        return { data: [makeRow("cat-active", "Aktif Saja", 0)], nextCursor: null, hasMore: false };
      }
      return defaultResponder(filter, search, cursor);
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(screen.getByText("Page 1")).toBeInTheDocument());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ filter: "all", search: null, cursor: null });

    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Page 2")).toBeInTheDocument());
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ filter: "all", search: null, cursor: "cursor-p2" });

    const select = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;

    await userEvent.type(input, "nasi", { delay: 0 });
    expect(input).toHaveValue("nasi");
    expect(requests).toHaveLength(2);

    await userEvent.selectOptions(select, "active");

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument();
    expect(screen.getByLabelText("Cari kategori")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Page 2")).not.toBeInTheDocument();

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => expect(screen.getByText("Aktif Saja")).toBeInTheDocument());
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual({ filter: "active", search: "nasi", cursor: null });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });

    expect(requests).toHaveLength(3);
    expect(requests.filter((r) => r.cursor === "cursor-p2")).toHaveLength(1);
    expect(requests.slice(2).every((r) => r.cursor === null)).toBe(true);
  });

  it("controls stay available while results load after query key change", async () => {
    const gate = deferred();
    installCategoryFetchRecorder(async (filter, search, cursor) => {
      if (filter === "active") {
        await gate.promise;
        return { data: [makeRow("cat-active", "Aktif Saja", 0)], nextCursor: null, hasMore: false };
      }
      return defaultResponder(filter, search, cursor);
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Page 1")).toBeInTheDocument());

    const select = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
    const input = screen.getByLabelText("Cari kategori") as HTMLInputElement;

    await userEvent.selectOptions(select, "active");
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument();
    expect(screen.getByLabelText("Cari kategori")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Page 1")).not.toBeInTheDocument();
    expect(select).not.toBeDisabled();
    expect(input).not.toBeDisabled();

    await userEvent.type(input, "ayam", { delay: 0 });
    expect(screen.getByLabelText("Cari kategori")).toHaveValue("ayam");

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.getByText("Aktif Saja")).toBeInTheDocument());
  });

  it("Previous/Next pagination with cursor history", async () => {
    const cursorResponses = new Map([
      [undefined, { data: [{ id: "cat-1", name: "Cat 1", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-1", hasMore: true }],
      ["cursor-1", { data: [{ id: "cat-2", name: "Cat 2", sortOrder: 2, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-2", hasMore: true }],
      ["cursor-2", { data: [{ id: "cat-3", name: "Cat 3", sortOrder: 3, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-3", hasMore: true }],
      ["cursor-3", { data: [], nextCursor: null, hasMore: false }],
    ]);

    global.fetch = vi.fn().mockImplementation(async (url) => {
      const urlObj = new URL(url, "http://localhost");
      const cursor = urlObj.searchParams.get("cursor") || undefined;
      const response = cursorResponses.get(cursor) ?? { data: [], nextCursor: null, hasMore: false };
      return { ok: true, headers: { get: () => "application/json" }, json: async () => response };
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Cat 1")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Selanjutnya")).not.toBeDisabled());

    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Cat 2")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Selanjutnya")).not.toBeDisabled());

    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Selanjutnya")).not.toBeDisabled(), { timeout: 10000 });
    await waitFor(() => expect(screen.getByText("Cat 3")).toBeInTheDocument(), { timeout: 10000 });

    expect(screen.getByText("Sebelumnya")).not.toBeDisabled();

    await userEvent.click(screen.getByText("Sebelumnya"));
    await waitFor(() => expect(screen.getByText("Cat 2")).toBeInTheDocument());
  });

  it("disables Next when !hasMore", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Selanjutnya")).toBeDisabled());
  });

  it("Previous works on empty later page if history exists", async () => {
    const cursorResponses = new Map([
      [undefined, { data: [{ id: "cat-1", name: "Cat 1", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-1", hasMore: true }],
      ["cursor-1", { data: [], nextCursor: null, hasMore: false }],
    ]);

    global.fetch = vi.fn().mockImplementation(async (url) => {
      const urlObj = new URL(url, "http://localhost");
      const cursor = urlObj.searchParams.get("cursor") || undefined;
      const response = cursorResponses.get(cursor) ?? { data: [], nextCursor: null, hasMore: false };
      return { ok: true, headers: { get: () => "application/json" }, json: async () => response };
    });

    const initialData = { data: [{ id: "cat-1", name: "Cat 1", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-1", hasMore: true };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 1000 * 60 * 10 } },
    });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <CategoryTable authScope={authScope} outletId={outletId} initialData={initialData} initialDataUpdatedAt={Date.now()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Cat 1")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Selanjutnya")).not.toBeDisabled());
    expect(screen.getByText("Sebelumnya")).toBeDisabled();

    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Tidak ada kategori ditemukan")).toBeInTheDocument());

    expect(screen.getByText("Selanjutnya")).toBeDisabled();
    expect(screen.getByText("Sebelumnya")).not.toBeDisabled();

    await userEvent.click(screen.getByText("Sebelumnya"));
    await waitFor(() => expect(screen.getByText("Cat 1")).toBeInTheDocument());
    expect(screen.getByText("Sebelumnya")).toBeDisabled();

    unmount();
  });

  it("disables pagination buttons during pending fetch", async () => {
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    global.fetch = vi.fn().mockReturnValue(fetchPromise);

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} initialData={mockData} initialDataUpdatedAt={Date.now()} />);

    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    await userEvent.click(screen.getByText("Selanjutnya"));

    await waitFor(() => expect(screen.getByText("Selanjutnya")).toBeDisabled());

    await act(async () => {
      resolveFetch!({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ data: [], nextCursor: null, hasMore: false }),
      });
      await fetchPromise;
    });
  });

  it("no create/edit/archive/restore buttons present", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    // Only check buttons and links, not status badges
    const buttons = screen.getAllByRole("button");
    const links = screen.queryAllByRole("link");
    const interactiveElements = [...buttons, ...links];
    
    for (const el of interactiveElements) {
      expect(el).not.toHaveTextContent(/tambah|buat|create|tambah kategori|edit|ubah|update|arsip|archive|hapus|delete/i);
    }
  });

  it("accessible labels on filter, search, pagination", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument();
      expect(screen.getByLabelText("Cari kategori")).toBeInTheDocument();
      expect(screen.getByLabelText("Halaman sebelumnya")).toBeInTheDocument();
      expect(screen.getByLabelText("Halaman selanjutnya")).toBeInTheDocument();
    });
  });

  it("background refetch updates data when stale", async () => {
    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => mockEmptyData };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CategoryTable authScope={authScope} outletId={outletId} initialData={mockEmptyData} initialDataUpdatedAt={Date.now() - 1000 * 60 * 10} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(0);
    });
  });

  it("provider boundary: same scope reuses QueryClient, changed scope creates new client and isolates data", async () => {
    const outlet1Data = { data: [{ id: "cat-1", name: "Outlet1 Cat", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };
    const outlet2Data = { data: [{ id: "cat-2", name: "Outlet2 Cat", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };

    let fetchCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      fetchCount++;
      const urlObj = new URL(url, "http://localhost");
      const outlet = urlObj.searchParams.get("outlet") ?? "";
      const body = outlet === "outlet-1" ? outlet1Data : outlet2Data;
      return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
    });

    function Wrapper({ outletId }: { outletId: string }) {
      return <CategoryListPage authScope={authScope} outletId={outletId} />;
    }

    const { unmount: unmount1, rerender } = render(<Wrapper outletId="outlet-1" />);
    await waitFor(() => expect(screen.getByText("Outlet1 Cat")).toBeInTheDocument());
    expect(fetchCount).toBe(1);

    rerender(<Wrapper outletId="outlet-1" />);
    await waitFor(() => expect(screen.getByText("Outlet1 Cat")).toBeInTheDocument());
    expect(fetchCount).toBe(1);

    unmount1();
    render(<Wrapper outletId="outlet-2" />);
    await waitFor(() => expect(screen.getByText("Outlet2 Cat")).toBeInTheDocument());
    expect(fetchCount).toBe(2);
    expect(screen.queryByText("Outlet1 Cat")).not.toBeInTheDocument();
  });

  it("provider boundary: pending result from old scope does not appear in new scope", async () => {
    let resolveOutlet1: (value: unknown) => void;
    let resolveOutlet2: (value: unknown) => void;

    const outlet1Promise = new Promise((resolve) => { resolveOutlet1 = resolve; });
    const outlet2Promise = new Promise((resolve) => { resolveOutlet2 = resolve; });

    global.fetch = vi.fn().mockImplementation(async (url) => {
      const urlObj = new URL(url, "http://localhost");
      const outlet = urlObj.searchParams.get("outlet") ?? "";
      if (outlet === "outlet-1") return outlet1Promise;
      return outlet2Promise;
    });

    function Wrapper({ outletId }: { outletId: string }) {
      return <CategoryListPage authScope={authScope} outletId={outletId} />;
    }

    const { unmount } = render(<Wrapper outletId="outlet-1" />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    unmount();
    render(<Wrapper outletId="outlet-2" />);
    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());

    resolveOutlet1!({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [{ id: "cat-1", name: "Outlet1 Late", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false }),
    });

    resolveOutlet2!({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ data: [{ id: "cat-2", name: "Outlet2 Data", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false }),
    });

    await waitFor(() => expect(screen.getByText("Outlet2 Data")).toBeInTheDocument());
    expect(screen.queryByText("Outlet1 Late")).not.toBeInTheDocument();
  });

  it("initialData cache key evidence: uses factory key with full scope and query params", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CategoryTable authScope={authScope} outletId={outletId} initialData={mockData} initialDataUpdatedAt={Date.now()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    expect(queries.length).toBeGreaterThan(0);

    const initialKey = categoryKeys().list(authScope, {
      outletId,
      filter: "all",
      search: undefined,
      limit: INITIAL_CATEGORY_LIMIT,
      cursor: undefined,
    });

    const matchingQuery = queries.find((q) => {
      const key = q.queryKey;
      return key.length === 3 && key[0] === "categories" && key[1] === "list" &&
        JSON.stringify(key[2]) === JSON.stringify(initialKey[2]);
    });

    expect(matchingQuery).toBeDefined();
    expect(matchingQuery!.state.data).toEqual(mockData);
    expect(matchingQuery!.state.dataUpdatedAt).toBeDefined();
  });

  it("initialData only for exact initial key: filter/search/page2 do not use SSR page1", async () => {
    const initialData = { data: [{ id: "cat-1", name: "SSR Page 1", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: "cursor-1", hasMore: true };
    const page2Data = { data: [{ id: "cat-2", name: "Page 2", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };
    const searchData = { data: [{ id: "cat-3", name: "Search Result", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };
    const filterData = { data: [{ id: "cat-4", name: "Active Only", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" }], nextCursor: null, hasMore: false };

    let requestCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url) => {
      requestCount++;
      const urlObj = new URL(url, "http://localhost");
      const cursor = urlObj.searchParams.get("cursor");
      const search = urlObj.searchParams.get("search");
      const filter = urlObj.searchParams.get("filter") ?? "all";

      if (filter === "active") {
        return { ok: true, headers: { get: () => "application/json" }, json: async () => filterData };
      }
      if (search) {
        return { ok: true, headers: { get: () => "application/json" }, json: async () => searchData };
      }
      if (cursor === "cursor-1") {
        return { ok: true, headers: { get: () => "application/json" }, json: async () => page2Data };
      }
      return { ok: true, headers: { get: () => "application/json" }, json: async () => initialData };
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CategoryTable authScope={authScope} outletId={outletId} initialData={initialData} initialDataUpdatedAt={Date.now()} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("SSR Page 1")).toBeInTheDocument());
    expect(requestCount).toBe(0);

    await userEvent.click(screen.getByText("Selanjutnya"));
    await waitFor(() => expect(screen.getByText("Page 2")).toBeInTheDocument());
    expect(requestCount).toBe(1);

    await userEvent.click(screen.getByText("Sebelumnya"));
    await waitFor(() => expect(screen.getByText("SSR Page 1")).toBeInTheDocument());
    expect(requestCount).toBe(1);

    const searchInput = screen.getByLabelText("Cari kategori") as HTMLInputElement;
    await userEvent.type(searchInput, "search", { delay: 0 });
    await waitFor(() => expect(screen.getByText("Search Result")).toBeInTheDocument(), { timeout: 5000 });
    expect(requestCount).toBe(2);

    const filterSelect = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
    await userEvent.selectOptions(filterSelect, "active");
    await waitFor(() => expect(screen.getByText("Active Only")).toBeInTheDocument());
    expect(requestCount).toBe(3);

    await userEvent.selectOptions(filterSelect, "all");
    await userEvent.clear(searchInput);
    await waitFor(() => expect(screen.getByText("SSR Page 1")).toBeInTheDocument());
    expect(requestCount).toBe(3);
  });

  it("permission false: Tambah Kategori button not rendered", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={false} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Tambah Kategori/i })).not.toBeInTheDocument();
  });

  it("permission true: Tambah Kategori button rendered", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Tambah Kategori/i })).toBeInTheDocument();
  });

  it("auth terminal state (401/403) does not show Tambah Kategori button", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "UNAUTHENTICATED", message: "Sesi berakhir" }),
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Tambah Kategori/i })).not.toBeInTheDocument();
  });

  // Create form tests
  it("create form opens with defaults using outletId prop", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId="outlet-42" canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
    const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
    const isActiveCheckbox = screen.getByLabelText("Aktif") as HTMLInputElement;

    expect(nameInput).toHaveValue("");
    expect(sortOrderInput).toHaveValue(0);
    expect(isActiveCheckbox).toBeChecked();
  });

  it("create form submit includes outletId from prop in payload", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Test", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId="outlet-99" canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Outlet");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockCreateCategoryAction).toHaveBeenCalled());
    const payload = mockCreateCategoryAction.mock.calls[0][0];
    expect(payload.outletId).toBe("outlet-99");
    expect(payload.name).toBe("Test Outlet");
  });

  it("create form shows validation error for blank name", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama kategori wajib diisi/i)).toBeInTheDocument());
    expect(mockCreateCategoryAction).not.toHaveBeenCalled();
  });

  it("create form shows validation error for name exceeding 80 chars", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
    // Bypass maxlength via controlled change
    act(() => {
      fireEvent.change(nameInput, { target: { value: "a".repeat(81) } });
    });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/maksimal 80 karakter/i)).toBeInTheDocument());
  });

  it("create form sortOrder blank becomes 0 on submit", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Test", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Sort");
    await userEvent.clear(screen.getByLabelText("Urutan"));
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockCreateCategoryAction).toHaveBeenCalled());
    const payload = mockCreateCategoryAction.mock.calls[0][0];
    expect(payload.sortOrder).toBe(0);
  });

  it("create form duplicate name shows field error and retains input", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValueOnce({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: "Nama kategori sudah digunakan di outlet ini.",
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Duplicate");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama kategori sudah digunakan/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Duplicate");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("create form thrown action shows domain error and clears pending", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockRejectedValueOnce(new Error("Network error"));

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Throw");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Simpan/i })).not.toBeDisabled();
  });

  it("create form success shows feedback, resets form, closes dialog", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Success", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Success Test");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kategori berhasil dibuat/i)).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen dialog - form should be reset
    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("");
    expect(screen.getByLabelText("Urutan")).toHaveValue(0);
    expect(screen.getByLabelText("Aktif")).toBeChecked();
  });

  // Lifecycle tests for tahap2
  it("confirmation: false -> dialog/input retained, action 0", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Confirm False");

    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Confirm False");
    expect(mockCreateCategoryAction).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("confirmation: true -> dialog closed/reset, action 0", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Confirm True");

    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn().mockReturnValue(true);
    window.confirm = confirmSpy;

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockCreateCategoryAction).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("pending close: Batal button rejected", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Pending");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    const saveButton = screen.getByRole("button", { name: /Menyimpan/i });
    expect(saveButton).toBeDisabled();

    const batalButton = screen.getByRole("button", { name: /Batal/i });
    await userEvent.click(batalButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      resolveAction!({ ok: true, data: { id: "cat-1", name: "Pending", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
      await actionPromise;
    });
  });

  it("pending close: Escape key rejected", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Pending Escape");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    const saveButton = screen.getByRole("button", { name: /Menyimpan/i });
    expect(saveButton).toBeDisabled();

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      resolveAction!({ ok: true, data: { id: "cat-2", name: "Pending Escape", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
      await actionPromise;
    });
  });

  it("pending close: outside click on overlay rejected", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Pending Outside");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    const saveButton = screen.getByRole("button", { name: /Menyimpan/i });
    expect(saveButton).toBeDisabled();

    const dialog = screen.getByRole("dialog");
    const overlay = dialog.parentElement!;
    await act(async () => {
      fireEvent.pointerDown(overlay, { target: overlay, pointerType: "mouse" });
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await act(async () => {
      resolveAction!({ ok: true, data: { id: "cat-3", name: "Pending Outside", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
      await actionPromise;
    });
  });

  it("pending close: clean close works (control case)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const batalButton = screen.getByRole("button", { name: /Batal/i });
    await userEvent.click(batalButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("success close bypasses dirty confirmation", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Success", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Success Close");

    const originalConfirm = window.confirm;
    window.confirm = vi.fn();

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("duplicate retains dirty protection after error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValueOnce({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: "Nama kategori sudah digunakan di outlet ini.",
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Duplicate");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama kategori sudah digunakan/i)).toBeInTheDocument());

    // Dialog still open, dirty protection still active
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(window.confirm).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Duplicate");

    window.confirm = originalConfirm;
  });

  it("thrown action retains dirty protection", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockRejectedValueOnce(new Error("Network error"));

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Throw");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument());

    // Dialog still open, dirty protection still active
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(window.confirm).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    window.confirm = originalConfirm;
  });

  it("success close without dirty confirmation after ok===true", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Success", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Success Close");

    const originalConfirm = window.confirm;
    window.confirm = vi.fn();

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.confirm).not.toHaveBeenCalled();

    window.confirm = originalConfirm;
  });

  it("concurrent submit: two submits in one act, action called once before resolve", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Concurrent");
    const form = screen.getByRole("dialog")!.querySelector("form")!;

    // Dispatch two submits in single act, without waiting for disabled between
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      // Flush validation microtasks while action still deferred
      await Promise.resolve();
    });

    // Action should be called exactly once before resolution
    expect(mockCreateCategoryAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction!({ ok: true, data: { id: "cat-1", name: "Concurrent", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
      await actionPromise;
    });

    // Pending should be released after resolution
    expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument();
  });

  it("focus: clean close returns to trigger", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    const addButton = screen.getByRole("button", { name: /Tambah Kategori/i });
    await userEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Kategori *");
    expect(nameInput).toHaveFocus();

    const batalButton = screen.getByRole("button", { name: /Batal/i });
    await userEvent.click(batalButton);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(addButton).toHaveFocus();
  });

  it("focus: dirty accept returns to trigger", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    const addButton = screen.getByRole("button", { name: /Tambah Kategori/i });
    await userEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Dirty Focus");

    const batalButton = screen.getByRole("button", { name: /Batal/i });
    await userEvent.click(batalButton);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(addButton).toHaveFocus();

    window.confirm = originalConfirm;
  });

  it("focus: success close returns to trigger", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Focus Test", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    const addButton = screen.getByRole("button", { name: /Tambah Kategori/i });
    await userEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Focus Test");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(addButton).toHaveFocus();
  });

  it("focus: success close returns to trigger while refetch pending (slow refresh)", async () => {
    let resolveRefetch: (value: unknown) => void;
    const refetchPromise = new Promise((resolve) => { resolveRefetch = resolve; });

    // Initial query succeeds
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    // createCategoryAction succeeds
    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Slow Refresh Focus", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    // But subsequent refetch (from invalidateQueries) is deferred
    let fetchCallCount = 0;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return { ok: true, headers: { get: () => "application/json" }, json: async () => mockEmptyData };
      }
      // Second call = refetch after create - defer it
      return refetchPromise;
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    expect(fetchCallCount).toBe(1);

    const addButton = screen.getByRole("button", { name: /Tambah Kategori/i });
    await userEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Slow Refresh Focus");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    // Wait for Dialog to close (create succeeded, invalidation triggered)
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // At this point, refetch is still pending (deferred)
    // Trigger button should have focus even though refresh is in flight
    expect(addButton).toHaveFocus();
    expect(addButton).not.toBeDisabled(); // isSubmitting should be false after finally block

    // Now resolve the deferred refetch
    await act(async () => {
      resolveRefetch!({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockEmptyData,
      });
      await refetchPromise;
    });
  });

  it("beforeunload: clean false, open+dirty true, closed/reset false, unmounted false", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Initially clean - no beforeunload handler
    expect(addEventListenerSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Make dirty
    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Dirty");

    // beforeunload should be attached
    expect(addEventListenerSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Dispatch actual beforeunload event - clean should be false (defaultPrevented = true when dirty)
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    // Close dialog via confirm accept - form resets, becomes clean
    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
    window.confirm = originalConfirm;

    // After close+reset, beforeunload should be removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Dialog is closed, form is clean - dispatch again should not prevent default
    const beforeUnloadEvent2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent2);
    expect(beforeUnloadEvent2.defaultPrevented).toBe(false);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("beforeunload: unmounted does not leak handler", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Dirty");

    unmount();

    // Dispatch after unmount - handler should be cleaned up
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(false);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("success feedback inline role=status, not toast", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Feedback Test", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Feedback Test");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kategori berhasil dibuat/i)).toBeInTheDocument());
  });

  // Edit tests
  describe("Edit Category", () => {
    const mockRow = {
      id: "cat-1",
      name: "Makanan",
      sortOrder: 0,
      isActive: true,
      deletedAt: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const mockArchivedRow = {
      id: "cat-2",
      name: "Minuman",
      sortOrder: 1,
      isActive: true,
      deletedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const mockDataWithArchived: PaginatedCategoriesResult = {
      data: [mockRow, mockArchivedRow],
      nextCursor: null,
      hasMore: false,
    };

    beforeEach(() => {
      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });
    });

    it("permission false: Edit not available", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockEmptyData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={false} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
    });

    it("permission true: Edit button rendered and opens edit dialog", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });
      global.fetch = fetchMock;

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);

      const editButton = await screen.findByRole("button", {
        name: "Edit Makanan",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const requestUrl = String(fetchMock.mock.calls[0][0]);
      expect(requestUrl).toContain("/api/v1/catalog/categories");
      expect(requestUrl).toContain("outlet=outlet-1");

      await userEvent.click(editButton);

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(screen.getByRole("heading", { name: "Edit Kategori" })).toBeInTheDocument();
      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      expect(nameInput).toHaveValue("Makanan");
    });

    it("archived row: Edit button rendered, shows archived notice", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockDataWithArchived,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await screen.findByRole("button", { name: "Edit Makanan" });
      const archivedEditButton = await screen.findByRole("button", { name: "Edit Minuman" });
      expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(2);

      await userEvent.click(archivedEditButton);
      const archivedDialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      expect(within(archivedDialog).getByText("Mengedit tidak memulihkan kategori arsip.")).toBeInTheDocument();
    });

    it("defaults: name/sortOrder/isActive from row snapshot", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
      const isActiveCheckbox = screen.getByLabelText("Aktif") as HTMLInputElement;

      expect(nameInput).toHaveValue("Makanan");
      expect(sortOrderInput).toHaveValue(0);
      expect(isActiveCheckbox).toBeChecked();
    });

    it("rowA -> close -> rowB uses rowB defaults", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockDataWithArchived,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const rowAEditButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(rowAEditButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Open second row
      const rowBEditButton = await screen.findByRole("button", { name: "Edit Minuman" });
      await userEvent.click(rowBEditButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
      const isActiveCheckbox = screen.getByLabelText("Aktif") as HTMLInputElement;

      expect(nameInput).toHaveValue("Minuman");
      expect(sortOrderInput).toHaveValue(1);
      expect(isActiveCheckbox).toBeChecked();
    });

    it("reopen uses fresh snapshot from current row", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Temp Edit");

      const originalConfirm = window.confirm;
      const confirmSpy = vi.fn().mockReturnValue(true);
      window.confirm = confirmSpy;
      try {
        await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
        expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
      } finally {
        window.confirm = originalConfirm;
      }

      // Reopen same row - should show original snapshot
      const editButton2 = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton2);
      const reopenDialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      expect(within(reopenDialog).getByLabelText("Nama Kategori *")).toHaveValue("Makanan");
    });

    it("background refetch does not change dialog input or expectedUpdatedAt", async () => {
      let fetchCount = 0;
      let resolveFetch: (value: unknown) => void;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
        }
        return fetchPromise;
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      expect(nameInput).toHaveValue("Makanan");

      // Trigger background refetch
      const filterSelect = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
      await userEvent.selectOptions(filterSelect, "active");

      await act(async () => {
        resolveFetch!({
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({ data: [makeRow("cat-active", "Aktif Saja", 0)], nextCursor: null, hasMore: false }),
        });
        await fetchPromise;
      });

      // Dialog input should remain unchanged
      expect(nameInput).toHaveValue("Makanan");
    });

    it("validation: blank name shows required error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Nama kategori wajib diisi/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
    });

    it("validation: name max 80 chars via controlled change", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      act(() => {
        fireEvent.change(nameInput, { target: { value: "a".repeat(81) } });
      });

      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/maksimal 80 karakter/i)).toBeInTheDocument());
    });

    it("validation: name 80 chars via typing is accepted", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "a".repeat(80));

      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalled());
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.name).toHaveLength(80);
      expect(screen.queryByText(/maksimal 80 karakter/i)).not.toBeInTheDocument();
    });

    it("validation: sortOrder rejects decimal", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
      act(() => {
        fireEvent.change(sortOrderInput, { target: { value: "1.5" } });
      });
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/bilangan bulat/i)).toBeInTheDocument());
    });

    it("validation: sortOrder rejects out-of-range", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
      act(() => {
        fireEvent.change(sortOrderInput, { target: { value: "10000" } });
      });
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/maksimal 9999/i)).toBeInTheDocument());
    });

    it("sortOrder blank becomes 0 on submit", async () => {
      // Test-local fixture: snapshot sortOrder is nonzero (5)
      const localFixture: PaginatedCategoriesResult = {
        data: [
          { id: "cat-9", name: "Urutan Lima", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-03-03T00:00:00.000Z" },
        ],
        nextCursor: null,
        hasMore: false,
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => localFixture,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Urutan Lima" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      expect(within(dialog).getByLabelText("Urutan")).toHaveValue(5);

      await userEvent.clear(within(dialog).getByLabelText("Urutan"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.sortOrder).toBe(0);
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-9");
      expect(payload.expectedUpdatedAt).toBe("2026-03-03T00:00:00.000Z");
      expect(payload.name).toBeUndefined();
      expect(payload.isActive).toBeUndefined();
    });

    it("no-op: snapshot sortOrder 0 and blank input -> action 0", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      expect(within(dialog).getByLabelText("Urutan")).toHaveValue(0);
      await userEvent.clear(within(dialog).getByLabelText("Urutan"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("changed fields only: exact payload sent", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      // Only change name
      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Updated Name");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalled());
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-1");
      expect(payload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(payload.name).toBe("Updated Name");
      expect(payload.sortOrder).toBeUndefined();
      expect(payload.isActive).toBeUndefined();
    });

    it("no-op: unchanged fields shows message, action 0", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      // No changes made
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
    });

    it("duplicate name: field error, input retained", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValueOnce({
        ok: false,
        code: "CATEGORY_NAME_CONFLICT",
        message: "Nama kategori sudah digunakan di outlet ini.",
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Duplicate");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Nama kategori sudah digunakan/i)).toBeInTheDocument());
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Duplicate");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("version conflict: inline error, input retained, pending released", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValueOnce({
        ok: false,
        code: "CATALOG_VERSION_CONFLICT",
        message: "Data katalog telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Updated Name");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Data katalog telah diperbarui/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      const conflictPayload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(conflictPayload.name).toBe("Updated Name");
      expect(conflictPayload.outletId).toBe(outletId);
      expect(conflictPayload.categoryId).toBe("cat-1");
      expect(conflictPayload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Updated Name");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Simpan" })).not.toBeDisabled();
      // No automatic retry and no automatic version swap
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      expect(mockUpdateCategoryAction.mock.calls[0][0].expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("not found: inline error, input retained", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValueOnce({
        ok: false,
        code: "CATEGORY_NOT_FOUND",
        message: "Kategori tidak ditemukan.",
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
      await userEvent.type(nameInput, "Updated Name");
      const retainedValue = nameInput.value;
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Kategori tidak ditemukan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      const notFoundPayload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(notFoundPayload.outletId).toBe(outletId);
      expect(notFoundPayload.categoryId).toBe("cat-1");
      expect(notFoundPayload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue(retainedValue);
      expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Simpan" })).not.toBeDisabled();
      // No automatic retry with a refreshed version
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
    });

    it("state conflict: inline error, input retained, pending released, no auto-retry", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValueOnce({
        ok: false,
        code: "CATALOG_STATE_CONFLICT",
        message: "Status kategori berubah. Muat ulang data terbaru.",
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "State Conflict");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Status katalog berubah|Status kategori berubah/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      const stateConflictPayload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(stateConflictPayload.name).toBe("State Conflict");
      expect(stateConflictPayload.outletId).toBe(outletId);
      expect(stateConflictPayload.categoryId).toBe("cat-1");
      expect(stateConflictPayload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("State Conflict");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Simpan" })).not.toBeDisabled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
    });

    it("thrown action: safe error, pending released", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockRejectedValueOnce(new Error("Network error"));

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Throw");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      const thrownPayload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(thrownPayload.outletId).toBe(outletId);
      expect(thrownPayload.categoryId).toBe("cat-1");
      expect(thrownPayload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("MakananTest Throw");
      expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Simpan/i })).not.toBeDisabled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
    });

    it("success: feedback shown, dialog closed, scoped refresh", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Updated Name");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui/i)).toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Reopen edit - form should be reset
      const editButton2 = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton2);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Makanan");
    });

    it("success with refresh failure: update success + reopen shows fresh snapshot", async () => {
      let fetchFail = false;
      let fetchCallCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
        }
        if (fetchFail) throw new Error("Refresh failed");
        return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
      });

      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      // Make refresh fail on second call
      fetchFail = true;

      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Updated Name");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui/i)).toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui, tetapi daftar belum diperbarui/i)).toBeInTheDocument());

      // Recovery: refresh failed -> restore successful current data before reopening
      fetchFail = false;
      const retryButton = screen.queryByRole("button", { name: /Coba Lagi/i });
      if (retryButton) {
        await userEvent.click(retryButton);
      }

      // Reopen edit - form should be reset
      const editButton2 = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton2);
      const reopenDialog = await screen.findByRole("dialog", { name: "Edit Kategori" });
      expect(within(reopenDialog).getByLabelText("Nama Kategori *")).toHaveValue("Makanan");
    });

    it("success with refresh failure: update success + warning visible", async () => {
      let fetchFail = false;
      let fetchCallCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
        }
        if (fetchFail) throw new Error("Refresh failed");
        return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
      });

      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      // Make refresh fail on second call
      fetchFail = true;

      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Refresh Fail");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui/i)).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui, tetapi daftar belum diperbarui/i)).toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
    });

    it("no-op: unchanged fields shows message, action 0", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      // No changes made
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
    });

    it("success close returns focus to trigger", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Focus Test");
      await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(editButton).toHaveFocus();
    });

    it("no-op: normalized whitespace name equals snapshot -> message, action 0", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      const nameInput = within(dialog).getByLabelText("Nama Kategori *") as HTMLInputElement;
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "   Makanan   ");
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.queryByText(/Kategori berhasil diperbarui/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Simpan" })).not.toBeDisabled();
    });

    it("changed fields only: zero and false values are included in payload", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockDataWithArchived,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Minuman" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      // sortOrder 1 -> 0, isActive true -> false, name unchanged
      await userEvent.clear(within(dialog).getByLabelText("Urutan"));
      await userEvent.type(within(dialog).getByLabelText("Urutan"), "0");
      await userEvent.click(within(dialog).getByLabelText("Aktif"));
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-2");
      expect(payload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(payload.sortOrder).toBe(0);
      expect(payload.isActive).toBe(false);
      expect(payload.name).toBeUndefined();
    });

    it("snapshot metadata stays authoritative after background refetch", async () => {
      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
        }
        return {
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => ({
            data: [{ id: "cat-1", name: "Makanan Baru", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-02-02T00:00:00.000Z" }],
            nextCursor: null,
            hasMore: false,
          }),
        };
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await screen.findByRole("dialog", { name: "Edit Kategori" });

      // Background refetch brings a newer updatedAt for the same row
      const filterSelect = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
      await userEvent.selectOptions(filterSelect, "active");
      await waitFor(() => expect(screen.getByText("Makanan Baru")).toBeInTheDocument());

      expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Makanan");

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Renamed");
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-1");
      expect(payload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(payload.name).toBe("Renamed");
    });

    it("success close returns focus to edit trigger while refetch pending (slow refresh)", async () => {
      let resolveRefetch: (value: unknown) => void;
      const refetchPromise = new Promise((resolve) => { resolveRefetch = resolve; });

      let fetchCallCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
        }
        return refetchPromise;
      });

      mockUpdateCategoryAction.mockResolvedValue({
        ok: true,
        data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
      await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Slow Refresh Focus");
      await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui/i)).toBeInTheDocument());
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Refetch still pending: trigger focusable, reopen blocked by inFlight guard
      expect(editButton).toHaveFocus();
      expect(editButton).not.toBeDisabled();
      await userEvent.click(editButton);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await act(async () => {
        resolveRefetch!({
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => mockData,
        });
        await refetchPromise;
      });
      expect(editButton).toHaveFocus();
    });

    it("close falls back to Tambah Kategori when edit trigger is gone", async () => {
      let mode: "initial" | "empty" = "initial";
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => (mode === "initial" ? mockData : mockEmptyData),
      }));

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      await screen.findByRole("dialog", { name: "Edit Kategori" });

      // Row disappears while the dialog is open -> stored trigger leaves the DOM
      mode = "empty";
      const filterSelect = screen.getByLabelText("Filter kategori") as HTMLSelectElement;
      await userEvent.selectOptions(filterSelect, "active");
      await waitFor(() => expect(screen.getByText("Tidak ada kategori ditemukan")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: "Edit Makanan" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await waitFor(() => expect(screen.getByRole("button", { name: "Tambah Kategori" })).toHaveFocus());
    });

    it("dirty reject: confirm false retains dialog/input, action 0, next submit uses snapshot metadata", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Rejected Rename");

      const originalConfirm = window.confirm;
      const confirmSpy = vi.fn().mockReturnValue(false);
      window.confirm = confirmSpy;
      try {
        await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
        expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
        expect(
          within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByLabelText("Nama Kategori *")
        ).toHaveValue("Rejected Rename");
        expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
      } finally {
        window.confirm = originalConfirm;
      }

      // Rejected close must not touch the snapshot: next submit still carries it
      const openDialog = screen.getByRole("dialog", { name: "Edit Kategori" });
      await userEvent.click(within(openDialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-1");
      expect(payload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(payload.name).toBe("Rejected Rename");
      expect(payload.sortOrder).toBeUndefined();
      expect(payload.isActive).toBeUndefined();
    });

    it("pending close: Batal button rejected while action pending", async () => {
      const { promise, resolve } = deferred<unknown>();
      mockUpdateCategoryAction.mockReturnValueOnce(promise);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Pending Batal");
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const pendingDialog = screen.getByRole("dialog", { name: "Edit Kategori" });
      expect(within(pendingDialog).getByRole("button", { name: /Menyimpan/i })).toBeDisabled();

      const batalButton = within(pendingDialog).getByRole("button", { name: "Batal" });
      expect(batalButton).toBeDisabled();
      fireEvent.click(batalButton);

      expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByLabelText("Nama Kategori *")
      ).toHaveValue("Pending Batal");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();

      await act(async () => {
        resolve({ ok: true, data: { id: "cat-1", name: "Pending Batal", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
        await promise;
      });
      await waitFor(() => expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument());
    });

    it("pending close: built-in X button rejected while action pending", async () => {
      const { promise, resolve } = deferred<unknown>();
      mockUpdateCategoryAction.mockReturnValueOnce(promise);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Pending X Close");
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const pendingDialog = screen.getByRole("dialog", { name: "Edit Kategori" });
      expect(within(pendingDialog).getByRole("button", { name: /Menyimpan/i })).toBeDisabled();

      const closeButton = within(pendingDialog).getByRole("button", { name: "Close" });
      expect(closeButton).toBeInTheDocument();
      await userEvent.click(closeButton);

      expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByLabelText("Nama Kategori *")
      ).toHaveValue("Pending X Close");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();

      await act(async () => {
        resolve({ ok: true, data: { id: "cat-1", name: "Pending X Close", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
        await promise;
      });
      await waitFor(() => expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument());
    });

    it("pending close: Escape key rejected while action pending", async () => {
      const { promise, resolve } = deferred<unknown>();
      mockUpdateCategoryAction.mockReturnValueOnce(promise);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Pending Escape");
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      expect(
        within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByRole("button", { name: /Menyimpan/i })
      ).toBeDisabled();

      await act(async () => {
        await userEvent.keyboard("{Escape}");
      });

      expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByLabelText("Nama Kategori *")
      ).toHaveValue("Pending Escape");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();

      await act(async () => {
        resolve({ ok: true, data: { id: "cat-1", name: "Pending Escape", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
        await promise;
      });
      await waitFor(() => expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument());
    });

    it("pending close: outside pointer on overlay rejected while action pending", async () => {
      const { promise, resolve } = deferred<unknown>();
      mockUpdateCategoryAction.mockReturnValueOnce(promise);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Pending Outside");
      await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const pendingDialog = screen.getByRole("dialog", { name: "Edit Kategori" });
      expect(within(pendingDialog).getByRole("button", { name: /Menyimpan/i })).toBeDisabled();

      // Real overlay element (sibling of the content inside the portal)
      const portal = pendingDialog.parentElement!;
      const overlay = portal.firstElementChild as HTMLElement;
      expect(overlay).not.toBeNull();
      expect(overlay).not.toBe(pendingDialog);

      await act(async () => {
        fireEvent.pointerDown(overlay, { target: overlay, pointerType: "mouse" });
        await Promise.resolve();
      });

      expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByLabelText("Nama Kategori *")
      ).toHaveValue("Pending Outside");
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();

      await act(async () => {
        resolve({ ok: true, data: { id: "cat-1", name: "Pending Outside", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
        await promise;
      });
      await waitFor(() => expect(screen.queryByRole("button", { name: /Menyimpan/i })).not.toBeInTheDocument());
    });

    it("concurrent submit: two submits in one act, action 1 before resolve, success close after", async () => {
      const { promise, resolve } = deferred<unknown>();
      mockUpdateCategoryAction.mockReturnValueOnce(promise);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Concurrent Edit");
      const form = dialog.querySelector("form")!;

      await act(async () => {
        fireEvent.submit(form);
        fireEvent.submit(form);
        await Promise.resolve();
      });

      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolve({ ok: true, data: { id: "cat-1", name: "Concurrent Edit", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
        await promise;
      });

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(screen.getByText(/Kategori berhasil diperbarui/i)).toBeInTheDocument());
      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
    });

    it("beforeunload: edit clean false, open+dirty true, confirm-accept close false", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });

      // Clean: dialog not open, no handler installed
      const cleanEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(cleanEvent);
      expect(cleanEvent.defaultPrevented).toBe(false);

      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      // Open but still pristine
      const pristineEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(pristineEvent);
      expect(pristineEvent.defaultPrevented).toBe(false);

      // Dirty edit form installs the guard
      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Dirty Edit");
      const dirtyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);

      // Confirm-accept close resets the form -> guard removed
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      try {
        await userEvent.click(within(screen.getByRole("dialog", { name: "Edit Kategori" })).getByRole("button", { name: "Batal" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      } finally {
        window.confirm = originalConfirm;
      }

      const afterCloseEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(afterCloseEvent);
      expect(afterCloseEvent.defaultPrevented).toBe(false);
    });

    it("beforeunload: edit unmounted while dirty does not prevent default", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const view = renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Unmount Dirty");
      const dirtyEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirtyEvent);
      expect(dirtyEvent.defaultPrevented).toBe(true);

      view.unmount();

      const unmountedEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unmountedEvent);
      expect(unmountedEvent.defaultPrevented).toBe(false);
    });

    it("scoped refresh: Edit submit refetches matching tenant/user/outlet variants only", async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
      });

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      }));

      // Per-query execution counter (authScope is not part of the request URL)
      const fetchStarts = new Map<string, number>();
      const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "fetch") {
          fetchStarts.set(event.query.queryHash, (fetchStarts.get(event.query.queryHash) ?? 0) + 1);
        }
      });

      const tableKey = categoryKeys().list(authScope, {
        outletId,
        filter: "all",
        search: undefined,
        limit: INITIAL_CATEGORY_LIMIT,
        cursor: undefined,
      });
      const variantFilterKey = categoryKeys().list(authScope, {
        outletId,
        filter: "active",
        search: undefined,
        limit: INITIAL_CATEGORY_LIMIT,
        cursor: undefined,
      });
      const variantSearchKey = categoryKeys().list(authScope, {
        outletId,
        filter: "all",
        search: "nasi",
        limit: INITIAL_CATEGORY_LIMIT,
        cursor: undefined,
      });
      const otherOutletKey = categoryKeys().list(authScope, {
        outletId: "outlet-2",
        filter: "all",
        search: undefined,
        limit: INITIAL_CATEGORY_LIMIT,
        cursor: undefined,
      });
      const otherTenantKey = categoryKeys().list(
        { tenantId: "tenant-2", userId: authScope.userId },
        { outletId, filter: "all", search: undefined, limit: INITIAL_CATEGORY_LIMIT, cursor: undefined }
      );
      const otherUserKey = categoryKeys().list(
        { tenantId: authScope.tenantId, userId: "user-2" },
        { outletId, filter: "all", search: undefined, limit: INITIAL_CATEGORY_LIMIT, cursor: undefined }
      );
      const unrelatedPrefixKey = ["other", "prefix", { authScope, outletId }] as const;
      const malformedKey = ["categories", "list", { authScope: null, outletId }] as const;

      // Active observers fed by the production fetchCategories boundary
      function Probe({ queryKey, outlet }: { queryKey: ReadonlyArray<unknown>; outlet: string }) {
        useQuery({
          queryKey,
          queryFn: () => fetchCategories({ outlet, filter: "all", limit: INITIAL_CATEGORY_LIMIT }),
          retry: false,
          staleTime: 1000 * 60 * 5,
          gcTime: 1000 * 60 * 10,
          refetchOnWindowFocus: false,
        });
        return null;
      }

      const tracked: Array<{ label: string; key: ReadonlyArray<unknown>; matching: boolean }> = [
        { label: "table-initial", key: tableKey, matching: true },
        { label: "matching-variant-filter-active", key: variantFilterKey, matching: true },
        { label: "matching-variant-search", key: variantSearchKey, matching: true },
        { label: "other-outlet", key: otherOutletKey, matching: false },
        { label: "other-tenant", key: otherTenantKey, matching: false },
        { label: "other-user", key: otherUserKey, matching: false },
        { label: "unrelated-prefix", key: unrelatedPrefixKey, matching: false },
        { label: "malformed-key", key: malformedKey, matching: false },
      ];

      render(
        <QueryClientProvider client={queryClient}>
          <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
          <Probe queryKey={variantFilterKey} outlet={outletId} />
          <Probe queryKey={variantSearchKey} outlet={outletId} />
          <Probe queryKey={otherOutletKey} outlet="outlet-2" />
          <Probe queryKey={otherTenantKey} outlet={outletId} />
          <Probe queryKey={otherUserKey} outlet={outletId} />
          <Probe queryKey={unrelatedPrefixKey} outlet={outletId} />
          <Probe queryKey={malformedKey} outlet={outletId} />
        </QueryClientProvider>
      );

      const findQuery = (key: ReadonlyArray<unknown>) =>
        queryClient.getQueryCache().getAll().find((q) => JSON.stringify(q.queryKey) === JSON.stringify(key));

      // Observers active + initial fetch finished for every tracked key
      await waitFor(() => {
        expect(screen.getByText("Makanan")).toBeInTheDocument();
        for (const entry of tracked) {
          const query = findQuery(entry.key);
          expect(query, entry.label).toBeDefined();
          expect(query!.state.status, entry.label).toBe("success");
          expect(query!.state.fetchStatus, entry.label).toBe("idle");
        }
      });

      const baseline = tracked.map((entry) => {
        const query = findQuery(entry.key)!;
        return { ...entry, hash: query.queryHash, count: fetchStarts.get(query.queryHash) ?? 0 };
      });

      // Real Edit dialog submit
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const editDialog = await screen.findByRole("dialog", { name: "Edit Kategori" });
      await userEvent.clear(within(editDialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(editDialog).getByLabelText("Nama Kategori *"), "Scoped Refresh");
      await userEvent.click(within(editDialog).getByRole("button", { name: "Simpan" }));

      await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1));
      const payload = mockUpdateCategoryAction.mock.calls[0][0];
      expect(payload.outletId).toBe(outletId);
      expect(payload.categoryId).toBe("cat-1");
      expect(payload.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(payload.name).toBe("Scoped Refresh");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Matching active variants refetch exactly once each
      await waitFor(() => {
        for (const entry of baseline.filter((e) => e.matching)) {
          expect(fetchStarts.get(entry.hash) ?? 0, entry.label).toBe(entry.count + 1);
        }
      });

      // Other outlet/tenant/user, unrelated prefix and malformed keys never refetch
      for (const entry of baseline.filter((e) => !e.matching)) {
        expect(fetchStarts.get(entry.hash) ?? 0, entry.label).toBe(entry.count);
      }

      expect(mockUpdateCategoryAction).toHaveBeenCalledTimes(1);
      unsubscribeCache();
    });

    it("single active dialog: create close -> edit -> dirty reject -> dirty accept -> clean create defaults", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      await screen.findByRole("button", { name: "Edit Makanan" });

      // Create opens alone and closes cleanly (pristine -> no confirmation)
      await userEvent.click(screen.getByRole("button", { name: "Tambah Kategori" }));
      let dialog = await screen.findByRole("dialog", { name: "Tambah Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(confirmSpy).not.toHaveBeenCalled();

      // Edit opens alone
      await userEvent.click(screen.getByRole("button", { name: "Edit Makanan" }));
      dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      await userEvent.clear(within(dialog).getByLabelText("Nama Kategori *"));
      await userEvent.type(within(dialog).getByLabelText("Nama Kategori *"), "Temp Switch");

      // Dirty reject keeps the single Edit dialog with its input
      confirmSpy.mockReturnValue(false);
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy).toHaveBeenCalledWith("Perubahan belum disimpan. Tutup dialog?");
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(screen.getByRole("dialog", { name: "Edit Kategori" })).toBeInTheDocument();
      expect(within(screen.getByRole("dialog")).getByLabelText("Nama Kategori *")).toHaveValue("Temp Switch");

      // Dirty accept closes it
      confirmSpy.mockReturnValue(true);
      await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(confirmSpy).toHaveBeenCalledTimes(2);

      // Create reopens alone with pristine defaults
      await userEvent.click(screen.getByRole("button", { name: "Tambah Kategori" }));
      dialog = await screen.findByRole("dialog", { name: "Tambah Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByLabelText("Nama Kategori *")).toHaveValue("");
      expect(within(dialog).getByLabelText("Urutan")).toHaveValue(0);
      expect(within(dialog).getByLabelText("Aktif")).toBeChecked();

      expect(mockCreateCategoryAction).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it("outside pointer control: clean edit dialog closes with the same overlay event sequence", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
      const editButton = await screen.findByRole("button", { name: "Edit Makanan" });
      await userEvent.click(editButton);
      const dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });

      // Same targeting as the pending-close outside test: overlay is the portal's first child
      const portal = dialog.parentElement!;
      const overlay = portal.firstElementChild as HTMLElement;
      expect(overlay).not.toBeNull();
      expect(overlay).not.toBe(dialog);

      await act(async () => {
        fireEvent.pointerDown(overlay, { target: overlay, pointerType: "mouse" });
        await Promise.resolve();
      });

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe("Archive / Restore Category", () => {
    const archivePayload = {
      outletId: "outlet-1",
      categoryId: "cat-1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    };

    const restorePayload = {
      outletId: "outlet-1",
      categoryId: "cat-4",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    };

    const renderMockedTable = () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });
      return renderWithProvider(
        <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
      );
    };

    it("permission false: archive/restore actions not rendered", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => mockData,
      });

      renderWithProvider(
        <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={false} />
      );
      await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

      expect(screen.queryByRole("button", { name: "Arsip Makanan" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pulihkan Dessert" })).not.toBeInTheDocument();
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("auth terminal (403): archive/restore actions not rendered", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: { get: () => "application/json" },
        json: async () => ({ code: "OUTLET_ACCESS_DENIED", message: "Forbidden" }),
      });

      renderWithProvider(
        <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
      );
      await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());

      expect(
        screen.queryByRole("button", { name: /Arsip |Pulihkan |Edit / })
      ).not.toBeInTheDocument();
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("deletedAt-based actions: Arsip on live rows, Pulihkan on archived row", async () => {
      renderMockedTable();
      await screen.findByRole("button", { name: "Arsip Makanan" });

      expect(screen.getAllByRole("button", { name: /^Arsip / })).toHaveLength(3);
      expect(screen.getByRole("button", { name: "Pulihkan Dessert" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Pulihkan Makanan" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Arsip Dessert" })).not.toBeInTheDocument();
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("archive confirmation: accessible title, category name, backend-matched impact copy", async () => {
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Arsip Makanan" }));

      const dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });
      expect(
        within(dialog).getByText(/Tandai kategori "Makanan" sebagai arsip\./)
      ).toBeInTheDocument();
      expect(within(dialog).getByText("Kategori ditandai arsip.")).toBeInTheDocument();
      expect(within(dialog).getByText("Item menu tidak dihapus.")).toBeInTheDocument();
      expect(within(dialog).getByText("Status Aktif kategori tidak berubah.")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Arsipkan" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Batal" })).toBeInTheDocument();
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("restore confirmation: accessible title, category name, backend-matched impact copy", async () => {
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Pulihkan Dessert" }));

      const dialog = await screen.findByRole("dialog", { name: "Pulihkan Kategori" });
      expect(
        within(dialog).getByText(/Batalkan arsip kategori "Dessert"\./)
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Arsip dibatalkan tanpa mengubah status Aktif.")
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText("Pemulihan dapat gagal karena konflik nama.")
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Pulihkan" })).toBeInTheDocument();
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("archive cancel: Batal closes confirmation, action 0, no feedback", async () => {
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Arsip Makanan" }));
      const dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
      expect(screen.queryByText("Kategori berhasil diarsipkan")).not.toBeInTheDocument();
      expect(screen.queryByText("Kategori berhasil dipulihkan")).not.toBeInTheDocument();
    });

    it("archive success: exact payload, archive 1 and restore 0, close with feedback", async () => {
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Arsip Makanan" }));
      const dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Arsipkan" }));

      await waitFor(() => expect(mockArchiveCategoryAction).toHaveBeenCalledTimes(1));
      expect(mockArchiveCategoryAction).toHaveBeenCalledWith(archivePayload);
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("Kategori berhasil diarsipkan")).toBeInTheDocument();
    });

    it("restore success: exact payload, restore 1 and archive 0, close with feedback", async () => {
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Pulihkan Dessert" }));
      const dialog = await screen.findByRole("dialog", { name: "Pulihkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Pulihkan" }));

      await waitFor(() => expect(mockRestoreCategoryAction).toHaveBeenCalledTimes(1));
      expect(mockRestoreCategoryAction).toHaveBeenCalledWith(restorePayload);
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText("Kategori berhasil dipulihkan")).toBeInTheDocument();
    });

    it("archive domain error: inline message, dialog and snapshot retained, pending released, no auto-retry", async () => {
      mockArchiveCategoryAction.mockResolvedValue({
        ok: false,
        code: "CATALOG_STATE_CONFLICT",
        message: "Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru.",
      });
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Arsip Makanan" }));
      const dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Arsipkan" }));

      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent(
          "Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru."
        )
      );
      expect(mockArchiveCategoryAction).toHaveBeenCalledTimes(1);
      expect(within(dialog).getByRole("button", { name: "Arsipkan" })).toBeEnabled();
      expect(screen.getByRole("dialog", { name: "Arsipkan Kategori" })).toBeInTheDocument();
      expect(screen.queryByText("Kategori berhasil diarsipkan")).not.toBeInTheDocument();

      await userEvent.click(within(dialog).getByRole("button", { name: "Arsipkan" }));
      await waitFor(() => expect(mockArchiveCategoryAction).toHaveBeenCalledTimes(2));
      expect(mockArchiveCategoryAction.mock.calls[0][0]).toEqual(archivePayload);
      expect(mockArchiveCategoryAction.mock.calls[1][0]).toEqual(archivePayload);
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("restore domain error: name conflict inline, dialog retained, restore 1 and archive 0", async () => {
      mockRestoreCategoryAction.mockResolvedValue({
        ok: false,
        code: "CATEGORY_NAME_CONFLICT",
        message: "Nama kategori sudah digunakan di outlet ini.",
      });
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Pulihkan Dessert" }));
      const dialog = await screen.findByRole("dialog", { name: "Pulihkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Pulihkan" }));

      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent(
          "Nama kategori sudah digunakan di outlet ini."
        )
      );
      expect(screen.getByRole("dialog", { name: "Pulihkan Kategori" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Pulihkan" })).toBeEnabled();
      expect(mockRestoreCategoryAction).toHaveBeenCalledTimes(1);
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(screen.queryByText("Kategori berhasil dipulihkan")).not.toBeInTheDocument();
    });

    it("thrown action: generic message, dialog retained, pending released", async () => {
      mockRestoreCategoryAction.mockRejectedValue(new Error("network down"));
      renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: "Pulihkan Dessert" }));
      const dialog = await screen.findByRole("dialog", { name: "Pulihkan Kategori" });

      await userEvent.click(within(dialog).getByRole("button", { name: "Pulihkan" }));

      await waitFor(() =>
        expect(within(dialog).getByRole("alert")).toHaveTextContent(
          "Terjadi kesalahan. Silakan coba lagi."
        )
      );
      expect(screen.getByRole("dialog", { name: "Pulihkan Kategori" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Pulihkan" })).toBeEnabled();
      expect(mockRestoreCategoryAction).toHaveBeenCalledTimes(1);
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
    });

    const modeCases = [
      {
        key: "archive",
        rowButtonName: "Arsip Makanan",
        rowName: "Makanan",
        categoryId: "cat-1",
        dialogName: "Arsipkan Kategori",
        confirmName: "Arsipkan",
        pendingName: "Mengarsipkan...",
        successText: "Kategori berhasil diarsipkan",
        action: () => mockArchiveCategoryAction,
        opposite: () => mockRestoreCategoryAction,
        successData: {
          id: "cat-1",
          name: "Makanan",
          sortOrder: 0,
          isActive: true,
          deletedAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        warningText: "Kategori berhasil diarsipkan, tetapi daftar belum diperbarui.",
        recoveryButtonName: "Pulihkan Makanan",
        removalFilter: "active",
        removalBefore: [
          { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
          { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        removalAfter: [
          { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        failureBefore: [
          { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        failureAfter: [
          { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
      {
        key: "restore",
        rowButtonName: "Pulihkan Dessert",
        rowName: "Dessert",
        categoryId: "cat-4",
        dialogName: "Pulihkan Kategori",
        confirmName: "Pulihkan",
        pendingName: "Memulihkan...",
        successText: "Kategori berhasil dipulihkan",
        action: () => mockRestoreCategoryAction,
        opposite: () => mockArchiveCategoryAction,
        successData: {
          id: "cat-4",
          name: "Dessert",
          sortOrder: 3,
          isActive: true,
          deletedAt: null,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        warningText: "Kategori berhasil dipulihkan, tetapi daftar belum diperbarui.",
        recoveryButtonName: "Arsip Dessert",
        removalFilter: "archived",
        removalBefore: [
          { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        removalAfter: [] as Array<{ id: string; name: string; sortOrder: number; isActive: boolean; deletedAt: string | null; updatedAt: string }>,
        failureBefore: [
          { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        failureAfter: [
          { id: "cat-4", name: "Dessert", sortOrder: 3, isActive: true, deletedAt: null, updatedAt: "2026-01-02T00:00:00.000Z" },
        ],
      },
    ];

    type ModeCase = (typeof modeCases)[number];

    const snapshotPayload = (c: ModeCase) => ({
      outletId: "outlet-1",
      categoryId: c.categoryId,
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    const openConfirmation = async (c: ModeCase) => {
      const view = renderMockedTable();
      await userEvent.click(await screen.findByRole("button", { name: c.rowButtonName }));
      const dialog = await screen.findByRole("dialog", { name: c.dialogName });
      return { dialog, view };
    };

    it.each(modeCases)(
      "pending state ($key): pending label shown, confirm and Batal disabled, action 1, opposite 0",
      async (c) => {
        const { promise, resolve } = deferred<unknown>();
        c.action().mockReturnValueOnce(promise);

        const { dialog } = await openConfirmation(c);
        await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

        await waitFor(() => expect(c.action()).toHaveBeenCalledTimes(1));
        const pendingDialog = screen.getByRole("dialog", { name: c.dialogName });
        expect(
          within(pendingDialog).getByRole("button", { name: c.pendingName })
        ).toBeDisabled();
        expect(
          within(pendingDialog).queryByRole("button", { name: c.confirmName })
        ).not.toBeInTheDocument();
        expect(within(pendingDialog).getByRole("button", { name: "Batal" })).toBeDisabled();
        expect(c.opposite()).not.toHaveBeenCalled();

        await act(async () => {
          resolve({ ok: true, data: c.successData });
          await promise;
        });
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(c.action()).toHaveBeenCalledTimes(1);
      }
    );

    const closeKinds = ["batal", "close-x", "escape", "outside-pointer"] as const;

    modeCases.forEach((c) => {
      closeKinds.forEach((kind) => {
        it(`pending close ${kind} (${c.key}): dialog and name retained, action 1, opposite 0, window.confirm 0`, async () => {
          const { promise, resolve } = deferred<unknown>();
          c.action().mockReturnValueOnce(promise);
          const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

          const { dialog } = await openConfirmation(c);
          await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

          await waitFor(() => expect(c.action()).toHaveBeenCalledTimes(1));
          const pendingDialog = screen.getByRole("dialog", { name: c.dialogName });
          expect(
            within(pendingDialog).getByRole("button", { name: c.pendingName })
          ).toBeDisabled();

          if (kind === "batal") {
            fireEvent.click(within(pendingDialog).getByRole("button", { name: "Batal" }));
          } else if (kind === "close-x") {
            const closeButton = within(pendingDialog).getByRole("button", { name: "Close" });
            expect(closeButton).toBeInTheDocument();
            await userEvent.click(closeButton);
          } else if (kind === "escape") {
            await act(async () => {
              await userEvent.keyboard("{Escape}");
            });
          } else {
            const portal = pendingDialog.parentElement!;
            const overlay = portal.firstElementChild as HTMLElement;
            expect(overlay).not.toBeNull();
            expect(overlay).not.toBe(pendingDialog);

            await act(async () => {
              fireEvent.pointerDown(overlay, { target: overlay, pointerType: "mouse" });
              await Promise.resolve();
            });
          }

          const retained = screen.getByRole("dialog", { name: c.dialogName });
          expect(retained).toBeInTheDocument();
          expect(within(retained).getByText(new RegExp(c.rowName))).toBeInTheDocument();
          expect(within(retained).getByRole("button", { name: c.pendingName })).toBeDisabled();
          expect(confirmSpy).not.toHaveBeenCalled();
          expect(c.action()).toHaveBeenCalledTimes(1);
          expect(c.opposite()).not.toHaveBeenCalled();

          confirmSpy.mockRestore();

          await act(async () => {
            resolve({ ok: true, data: c.successData });
            await promise;
          });
          await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
          expect(c.action()).toHaveBeenCalledTimes(1);
        });
      });
    });

    it.each(modeCases)(
      "outside pointer control ($key): same overlay/event sequence closes dialog when not pending",
      async (c) => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const { dialog } = await openConfirmation(c);

        const portal = dialog.parentElement!;
        const overlay = portal.firstElementChild as HTMLElement;
        expect(overlay).not.toBeNull();
        expect(overlay).not.toBe(dialog);

        await act(async () => {
          fireEvent.pointerDown(overlay, { target: overlay, pointerType: "mouse" });
          await Promise.resolve();
        });

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(confirmSpy).not.toHaveBeenCalled();
        expect(c.action()).not.toHaveBeenCalled();
        expect(c.opposite()).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
      }
    );

    it.each(modeCases)(
      "concurrent confirm ($key): two confirm clicks in one act, action 1 before resolve, success close after",
      async (c) => {
        const { promise, resolve } = deferred<unknown>();
        c.action().mockReturnValueOnce(promise);

        const { dialog } = await openConfirmation(c);
        const confirmButton = within(dialog).getByRole("button", { name: c.confirmName });

        await act(async () => {
          fireEvent.click(confirmButton);
          fireEvent.click(confirmButton);
          await Promise.resolve();
        });

        expect(c.action()).toHaveBeenCalledTimes(1);
        expect(c.opposite()).not.toHaveBeenCalled();

        await act(async () => {
          resolve({ ok: true, data: c.successData });
          await promise;
        });

        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByText(c.successText)).toBeInTheDocument());
        expect(c.action()).toHaveBeenCalledTimes(1);
        expect(c.opposite()).not.toHaveBeenCalled();
      }
    );

    it("beforeunload: archive confirmation open -> false, then closed -> false", async () => {
      const { dialog } = await openConfirmation(modeCases[0]);

      const openEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(openEvent);
      expect(openEvent.defaultPrevented).toBe(false);

      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      const closedEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(closedEvent);
      expect(closedEvent.defaultPrevented).toBe(false);
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it("beforeunload: restore confirmation open -> false, then unmounted -> false", async () => {
      const { view } = await openConfirmation(modeCases[1]);

      const openEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(openEvent);
      expect(openEvent.defaultPrevented).toBe(false);

      view.unmount();

      const unmountedEvent = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unmountedEvent);
      expect(unmountedEvent.defaultPrevented).toBe(false);
      expect(mockArchiveCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
    });

    it.each(modeCases)(
      "beforeunload transition ($key): dirty edit confirm-accept close -> confirmation open -> event not prevented",
      async (c) => {
        renderMockedTable();
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        await userEvent.click(await screen.findByRole("button", { name: "Edit Makanan" }));
        const editDialog = await screen.findByRole("dialog", { name: "Edit Kategori" });
        await userEvent.type(
          within(editDialog).getByLabelText("Nama Kategori *"),
          "Dirty Switch"
        );

        const dirtyEvent = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(dirtyEvent);
        expect(dirtyEvent.defaultPrevented).toBe(true);

        await userEvent.click(within(editDialog).getByRole("button", { name: "Batal" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(confirmSpy).toHaveBeenCalledTimes(1);

        const closedEvent = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(closedEvent);
        expect(closedEvent.defaultPrevented).toBe(false);

        await userEvent.click(await screen.findByRole("button", { name: c.rowButtonName }));
        await screen.findByRole("dialog", { name: c.dialogName });

        const openEvent = new Event("beforeunload", { cancelable: true });
        window.dispatchEvent(openEvent);
        expect(openEvent.defaultPrevented).toBe(false);

        expect(c.action()).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
      }
    );

    const errorKinds = [
      {
        kind: "CATALOG_VERSION_CONFLICT",
        thrown: false,
        message: "Data katalog telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
      },
      {
        kind: "CATEGORY_NOT_FOUND",
        thrown: false,
        message: "Kategori tidak ditemukan.",
      },
      {
        kind: "THROWN",
        thrown: true,
        message: "Terjadi kesalahan. Silakan coba lagi.",
      },
    ];

    modeCases.forEach((c) => {
      errorKinds.forEach((e) => {
        it(`error preservation (${c.key}, ${e.kind}): action 1, inline error, dialog/name retained, snapshot payload, pending released`, async () => {
          if (e.thrown) {
            c.action().mockRejectedValue(new Error("network down"));
          } else {
            c.action().mockResolvedValue({ ok: false, code: e.kind, message: e.message });
          }

          const { dialog } = await openConfirmation(c);
          await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

          await waitFor(() =>
            expect(
              within(screen.getByRole("dialog", { name: c.dialogName })).getByRole("alert")
            ).toHaveTextContent(e.message)
          );

          const retained = screen.getByRole("dialog", { name: c.dialogName });
          expect(retained).toBeInTheDocument();
          expect(within(retained).getByText(new RegExp(c.rowName))).toBeInTheDocument();
          expect(within(retained).getByRole("button", { name: c.confirmName })).toBeEnabled();
          expect(c.action()).toHaveBeenCalledTimes(1);
          expect(c.opposite()).not.toHaveBeenCalled();
          expect(c.action()).toHaveBeenCalledWith(snapshotPayload(c));
          expect(Object.keys(c.action().mock.calls[0][0])).toEqual([
            "outletId",
            "categoryId",
            "expectedUpdatedAt",
          ]);
          expect(screen.queryByText(c.successText)).not.toBeInTheDocument();
        });
      });
    });

    it.each(modeCases)(
      "scoped refresh ($key): confirmation submit refetches matching tenant/user/outlet variants only",
      async (c) => {
        const queryClient = new QueryClient({
          defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
        });

        global.fetch = vi.fn().mockImplementation(async () => ({
          ok: true,
          headers: { get: () => "application/json" },
          json: async () => mockData,
        }));

        const fetchStarts = new Map<string, number>();
        const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
          if (event.type === "updated" && event.action.type === "fetch") {
            fetchStarts.set(event.query.queryHash, (fetchStarts.get(event.query.queryHash) ?? 0) + 1);
          }
        });

        const tableKey = categoryKeys().list(authScope, {
          outletId,
          filter: "all",
          search: undefined,
          limit: INITIAL_CATEGORY_LIMIT,
          cursor: undefined,
        });
        const variantFilterKey = categoryKeys().list(authScope, {
          outletId,
          filter: "active",
          search: undefined,
          limit: INITIAL_CATEGORY_LIMIT,
          cursor: undefined,
        });
        const variantSearchKey = categoryKeys().list(authScope, {
          outletId,
          filter: "all",
          search: "nasi",
          limit: INITIAL_CATEGORY_LIMIT,
          cursor: undefined,
        });
        const otherOutletKey = categoryKeys().list(authScope, {
          outletId: "outlet-2",
          filter: "all",
          search: undefined,
          limit: INITIAL_CATEGORY_LIMIT,
          cursor: undefined,
        });
        const otherTenantKey = categoryKeys().list(
          { tenantId: "tenant-2", userId: authScope.userId },
          { outletId, filter: "all", search: undefined, limit: INITIAL_CATEGORY_LIMIT, cursor: undefined }
        );
        const otherUserKey = categoryKeys().list(
          { tenantId: authScope.tenantId, userId: "user-2" },
          { outletId, filter: "all", search: undefined, limit: INITIAL_CATEGORY_LIMIT, cursor: undefined }
        );
        const unrelatedPrefixKey = ["other", "prefix", { authScope, outletId }] as const;
        const malformedKey = ["categories", "list", { authScope: null, outletId }] as const;

        function Probe({ queryKey, outlet }: { queryKey: ReadonlyArray<unknown>; outlet: string }) {
          useQuery({
            queryKey,
            queryFn: () => fetchCategories({ outlet, filter: "all", limit: INITIAL_CATEGORY_LIMIT }),
            retry: false,
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 10,
            refetchOnWindowFocus: false,
          });
          return null;
        }

        const tracked: Array<{ label: string; key: ReadonlyArray<unknown>; matching: boolean }> = [
          { label: "table-initial", key: tableKey, matching: true },
          { label: "matching-variant-filter-active", key: variantFilterKey, matching: true },
          { label: "matching-variant-search", key: variantSearchKey, matching: true },
          { label: "other-outlet", key: otherOutletKey, matching: false },
          { label: "other-tenant", key: otherTenantKey, matching: false },
          { label: "other-user", key: otherUserKey, matching: false },
          { label: "unrelated-prefix", key: unrelatedPrefixKey, matching: false },
          { label: "malformed-key", key: malformedKey, matching: false },
        ];

        render(
          <QueryClientProvider client={queryClient}>
            <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
            <Probe queryKey={variantFilterKey} outlet={outletId} />
            <Probe queryKey={variantSearchKey} outlet={outletId} />
            <Probe queryKey={otherOutletKey} outlet="outlet-2" />
            <Probe queryKey={otherTenantKey} outlet={outletId} />
            <Probe queryKey={otherUserKey} outlet={outletId} />
            <Probe queryKey={unrelatedPrefixKey} outlet={outletId} />
            <Probe queryKey={malformedKey} outlet={outletId} />
          </QueryClientProvider>
        );

        const findQuery = (key: ReadonlyArray<unknown>) =>
          queryClient.getQueryCache().getAll().find((q) => JSON.stringify(q.queryKey) === JSON.stringify(key));

        await waitFor(() => {
          expect(screen.getByText("Makanan")).toBeInTheDocument();
          for (const entry of tracked) {
            const query = findQuery(entry.key);
            expect(query, entry.label).toBeDefined();
            expect(query!.state.status, entry.label).toBe("success");
            expect(query!.state.fetchStatus, entry.label).toBe("idle");
          }
        });

        const baseline = tracked.map((entry) => {
          const query = findQuery(entry.key)!;
          return { ...entry, hash: query.queryHash, count: fetchStarts.get(query.queryHash) ?? 0 };
        });

        await userEvent.click(await screen.findByRole("button", { name: c.rowButtonName }));
        const dialog = await screen.findByRole("dialog", { name: c.dialogName });
        await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

        await waitFor(() => expect(c.action()).toHaveBeenCalledTimes(1));
        expect(c.action()).toHaveBeenCalledWith(snapshotPayload(c));
        expect(Object.keys(c.action().mock.calls[0][0])).toEqual([
          "outletId",
          "categoryId",
          "expectedUpdatedAt",
        ]);
        expect(c.opposite()).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await waitFor(() => {
          for (const entry of baseline.filter((e) => e.matching)) {
            expect(fetchStarts.get(entry.hash) ?? 0, entry.label).toBe(entry.count + 1);
          }
        });

        for (const entry of baseline.filter((e) => !e.matching)) {
          expect(fetchStarts.get(entry.hash) ?? 0, entry.label).toBe(entry.count);
        }

        expect(c.action()).toHaveBeenCalledTimes(1);
        unsubscribeCache();
      }
    );

    it.each(modeCases)(
      "focus cancel ($key): Batal closes and returns focus to the clicked row trigger",
      async (c) => {
        renderMockedTable();
        await userEvent.click(await screen.findByRole("button", { name: c.rowButtonName }));
        const dialog = await screen.findByRole("dialog", { name: c.dialogName });

        await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        expect(screen.getByRole("button", { name: c.rowButtonName })).toHaveFocus();
        expect(c.action()).not.toHaveBeenCalled();
      }
    );

    it.each(modeCases)(
      "focus/lock ($key): success close focuses trigger, reopen rejected until slow refresh finishes",
      async (c) => {
        const { promise: refetchPromise, resolve: resolveRefetch } = deferred<unknown>();

        let fetchCallCount = 0;
        global.fetch = vi.fn().mockImplementation(async () => {
          fetchCallCount++;
          if (fetchCallCount === 1) {
            return { ok: true, headers: { get: () => "application/json" }, json: async () => mockData };
          }
          return refetchPromise;
        });

        renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
        await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());
        expect(fetchCallCount).toBe(1);

        const rowTrigger = await screen.findByRole("button", { name: c.rowButtonName });
        await userEvent.click(rowTrigger);
        const dialog = await screen.findByRole("dialog", { name: c.dialogName });
        await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

        await waitFor(() => expect(c.action()).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        expect(rowTrigger).toHaveFocus();
        expect(rowTrigger).not.toBeDisabled();

        await userEvent.click(rowTrigger);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(c.action()).toHaveBeenCalledTimes(1);

        await act(async () => {
          resolveRefetch({
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => mockData,
          });
          await refetchPromise;
        });
        await waitFor(() => expect(fetchCallCount).toBeGreaterThanOrEqual(2));

        await userEvent.click(screen.getByRole("button", { name: c.rowButtonName }));
        const reopened = await screen.findByRole("dialog", { name: c.dialogName });
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(within(reopened).getByText(new RegExp(c.rowName))).toBeInTheDocument();

        await userEvent.click(within(reopened).getByRole("button", { name: "Batal" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(c.action()).toHaveBeenCalledTimes(1);
        expect(c.opposite()).not.toHaveBeenCalled();
      }
    );

    it.each(modeCases)(
      "focus fallback ($key): filtered refresh removes row, focus falls back to Tambah Kategori",
      async (c) => {
        type FixtureRow = {
          id: string;
          name: string;
          sortOrder: number;
          isActive: boolean;
          deletedAt: string | null;
          updatedAt: string;
        };
        let rows: FixtureRow[] = c.removalBefore;

        global.fetch = vi.fn().mockImplementation(async (input: unknown) => {
          const url = new URL(String(input), "http://localhost");
          const filter = url.searchParams.get("filter") ?? "all";
          const body =
            filter === c.removalFilter
              ? { data: rows, nextCursor: null, hasMore: false }
              : mockData;
          return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
        });

        renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
        const filterSelect = (await screen.findByLabelText("Filter kategori")) as HTMLSelectElement;
        await userEvent.selectOptions(filterSelect, c.removalFilter);
        await screen.findByRole("button", { name: c.rowButtonName });

        await userEvent.click(screen.getByRole("button", { name: c.rowButtonName }));
        const dialog = await screen.findByRole("dialog", { name: c.dialogName });

        rows = c.removalAfter;

        await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));
        await waitFor(() => expect(c.action()).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await waitFor(() =>
          expect(screen.queryByRole("button", { name: c.rowButtonName })).not.toBeInTheDocument()
        );

        expect(screen.getByRole("button", { name: "Tambah Kategori" })).toHaveFocus();
        expect(c.opposite()).not.toHaveBeenCalled();
      }
    );

    it.each(modeCases)(
      "refresh failure ($key): success and warning visible, lock released, Coba Lagi recovery without repeat mutation",
      async (c) => {
        type FixtureRow = {
          id: string;
          name: string;
          sortOrder: number;
          isActive: boolean;
          deletedAt: string | null;
          updatedAt: string;
        };
        let rows: FixtureRow[] = c.failureBefore;
        let refreshFails = false;

        global.fetch = vi.fn().mockImplementation(async () => {
          if (refreshFails) {
            throw new Error("Refresh failed");
          }
          return {
            ok: true,
            headers: { get: () => "application/json" },
            json: async () => ({ data: rows, nextCursor: null, hasMore: false }),
          };
        });

        renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
        await screen.findByRole("button", { name: c.rowButtonName });

        refreshFails = true;
        await userEvent.click(screen.getByRole("button", { name: c.rowButtonName }));
        const dialog = await screen.findByRole("dialog", { name: c.dialogName });
        await userEvent.click(within(dialog).getByRole("button", { name: c.confirmName }));

        await waitFor(() => expect(screen.getByText(c.successText)).toBeInTheDocument());
        await waitFor(() => expect(screen.getByText(c.warningText)).toBeInTheDocument());
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByText("Gagal Memuat")).toBeInTheDocument());
        expect(c.action()).toHaveBeenCalledTimes(1);
        expect(c.opposite()).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Tambah Kategori" }));
        expect(screen.getAllByRole("dialog")).toHaveLength(1);
        expect(screen.getByRole("dialog", { name: "Tambah Kategori" })).toBeInTheDocument();
        await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batal" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(mockCreateCategoryAction).not.toHaveBeenCalled();

        refreshFails = false;
        rows = c.failureAfter;
        await userEvent.click(screen.getByRole("button", { name: "Coba Lagi" }));
        await waitFor(() =>
          expect(screen.getByRole("button", { name: c.recoveryButtonName })).toBeInTheDocument()
        );
        expect(c.action()).toHaveBeenCalledTimes(1);
        expect(c.opposite()).not.toHaveBeenCalled();
      }
    );

    it("single active dialog: create, edit, archive error, restore - one dialog per state, no leak", async () => {
      renderMockedTable();
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      await screen.findByRole("button", { name: "Edit Makanan" });

      await userEvent.click(screen.getByRole("button", { name: "Tambah Kategori" }));
      let dialog = await screen.findByRole("dialog", { name: "Tambah Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByLabelText("Nama Kategori *")).toHaveValue("");
      expect(within(dialog).getByLabelText("Urutan")).toHaveValue(0);
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: "Edit Makanan" }));
      dialog = await screen.findByRole("dialog", { name: "Edit Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(confirmSpy).not.toHaveBeenCalled();

      mockArchiveCategoryAction.mockResolvedValue({
        ok: false,
        code: "CATALOG_STATE_CONFLICT",
        message: "Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru.",
      });
      await userEvent.click(screen.getByRole("button", { name: "Arsip Makanan" }));
      dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByText(/Tandai kategori "Makanan" sebagai arsip\./)).toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Arsipkan" }));
      await waitFor(() =>
        expect(
          within(screen.getByRole("dialog", { name: "Arsipkan Kategori" })).getByRole("alert")
        ).toHaveTextContent("Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru.")
      );
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      await userEvent.click(
        within(screen.getByRole("dialog", { name: "Arsipkan Kategori" })).getByRole("button", {
          name: "Batal",
        })
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: "Pulihkan Dessert" }));
      dialog = await screen.findByRole("dialog", { name: "Pulihkan Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByText(/Batalkan arsip kategori "Dessert"\./)).toBeInTheDocument();
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await userEvent.click(screen.getByRole("button", { name: "Arsip Makanan" }));
      dialog = await screen.findByRole("dialog", { name: "Arsipkan Kategori" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(within(dialog).getByText(/Tandai kategori "Makanan" sebagai arsip\./)).toBeInTheDocument();
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(screen.queryByText("Kategori berhasil diarsipkan")).not.toBeInTheDocument();
      expect(mockCreateCategoryAction).not.toHaveBeenCalled();
      expect(mockUpdateCategoryAction).not.toHaveBeenCalled();
      expect(mockRestoreCategoryAction).not.toHaveBeenCalled();
      expect(mockArchiveCategoryAction).toHaveBeenCalledTimes(1);
      confirmSpy.mockRestore();
    });
  });
});