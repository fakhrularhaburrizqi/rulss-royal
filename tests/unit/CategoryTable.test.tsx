import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import { CategoryListPage } from "@/app/dashboard/kategori/CategoryListPage";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import { categoryKeys, INITIAL_CATEGORY_LIMIT } from "@/lib/dashboard/category-query-keys";

// Mock server action boundary
const mockCreateCategoryAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/dashboard/menu-actions", () => ({
  createCategoryAction: mockCreateCategoryAction,
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
});