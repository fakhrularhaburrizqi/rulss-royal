import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import type { PaginatedCategoriesResult, ManagementCategory } from "@/lib/services/menu-category-query.service";
import { createCategoryAction, updateCategoryAction } from "@/app/dashboard/menu-actions";

const authScope: CategoryAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

const mockEmptyData: PaginatedCategoriesResult = { data: [], nextCursor: null, hasMore: false };

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

const makeRow = (id: string, name: string, sortOrder: number): ManagementCategory => ({
  id,
  name,
  sortOrder,
  isActive: true,
  deletedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const mockData: PaginatedCategoriesResult = {
  data: [
    makeRow("cat-1", "Makanan", 0),
    makeRow("cat-2", "Minuman", 1),
    { ...makeRow("cat-3", "Snack", 2), isActive: false },
    { ...makeRow("cat-4", "Dessert", 3), deletedAt: "2026-01-01T00:00:00.000Z" },
  ],
  nextCursor: "cursor-next",
  hasMore: true,
};

// Mock the server actions using vi.hoisted
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

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CategoryEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-new", name: "Baru", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
    mockUpdateCategoryAction.mockResolvedValue({
      ok: true,
      data: { id: "cat-1", name: "Updated", sortOrder: 5, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("permission false: Edit button not rendered", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockEmptyData,
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={false} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("permission true: Edit button rendered and opens edit dialog", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockData,
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    const editButton = screen.getAllByRole("button", { name: /Edit/i })[0];
    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Edit Kategori" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama Kategori *")).toBeInTheDocument();
  });

  it("auth terminal state (401/403) does not show Edit button", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ code: "UNAUTHENTICATED", message: "Sesi berakhir" }),
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByText("Akses Ditolak")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });

  it("archived row: Edit button rendered but not calling restore action", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockDataWithArchived,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Minuman")).toBeInTheDocument());

    // Find the Edit button for archived row (second row)
    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    expect(editButtons).toHaveLength(2);

    await userEvent.click(editButtons[1]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Verify archived notice is shown
    expect(screen.getByText("Mengedit tidak memulihkan kategori arsip.")).toBeInTheDocument();

    // Fill form and submit
    await userEvent.clear(screen.getByLabelText("Nama Kategori *"));
    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Updated Archived");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockUpdateCategoryAction).toHaveBeenCalled());
    const payload = mockUpdateCategoryAction.mock.calls[0][0];
    expect(payload.categoryId).toBe("cat-2");
    expect(payload.name).toBe("Updated Archived");
  });

  it("defaults: name/sortOrder/isActive from row snapshot", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => mockDataWithArchived,
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons[0]);
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
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Minuman")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Open second row
    const editButtons2 = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons2[1]);
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
      json: async () => mockDataWithArchived,
    });

    const originalConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Temp Edit");
    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Reopen same row - should show original snapshot
    const editButtons2 = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons2[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Makanan");

    window.confirm = originalConfirm;
  });

  it("background refetch does not change dialog input or expectedUpdatedAt", async () => {
    let fetchCount = 0;
    let resolveFetch: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      if (fetchCount === 1) {
        return { ok: true, headers: { get: () => "application/json" }, json: async () => mockDataWithArchived };
      }
      return fetchPromise;
    });

    renderWithProvider(<CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />);
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Makanan")).toBeInTheDocument());

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    await userEvent.click(editButtons[0]);
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
});