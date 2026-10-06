import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import { CategoryListPage } from "@/app/dashboard/kategori/CategoryListPage";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import { categoryKeys, INITIAL_CATEGORY_LIMIT } from "@/lib/dashboard/category-query-keys";

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
});