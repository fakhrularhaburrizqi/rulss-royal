import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MenuEditDialog } from "@/app/dashboard/menu/MenuEditDialog";
import { fetchCategories } from "@/lib/api/categories";
import { updateMenuItemAction } from "@/app/dashboard/menu-actions";
import type { MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem } from "@/lib/services/menu-item-query.service";

vi.mock("@/lib/api/categories", () => ({
  fetchCategories: vi.fn(),
}));

vi.mock("@/app/dashboard/menu-actions", () => ({
  updateMenuItemAction: vi.fn(),
}));

const mockedFetchCategories = vi.mocked(fetchCategories);
const mockedUpdateMenuItemAction = vi.mocked(updateMenuItemAction);

const authScope: MenuItemAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

const mockCategories = {
  data: [
    { id: "cat-1", name: "Makanan", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "cat-2", name: "Minuman", sortOrder: 1, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
  nextCursor: null,
  hasMore: false,
};

const mockMenuItem: ManagementMenuItemListItem = {
  id: "item-1",
  categoryId: "cat-1",
  name: "Nasi Goreng",
  description: "Enak sekali",
  price: 15000,
  imageUrl: null,
  imageAlt: null,
  sortOrder: 0,
  isActive: true,
  isSoldOut: false,
  deletedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
};

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("MenuEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCategories.mockResolvedValue(mockCategories);
    mockedUpdateMenuItemAction.mockResolvedValue({
      ok: true,
      data: {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng Updated",
        price: 18000,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when isOpen is true and populates default values from menuItem prop", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Edit Menu" })).toBeInTheDocument();

    expect(screen.getByLabelText("Nama Menu *")).toHaveValue("Nasi Goreng");
    expect(screen.getByLabelText("Harga (Rp) *")).toHaveValue(15000);
    expect(screen.getByLabelText("Deskripsi")).toHaveValue("Enak sekali");
    expect(screen.getByLabelText("Aktif")).toBeChecked();
    expect(screen.getByLabelText("Habis (Sold Out)")).not.toBeChecked();
  });

  it("fetches categories on open and selects current category", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(mockedFetchCategories).toHaveBeenCalledWith({ outlet: outletId, filter: "all", limit: 100 }));
    await waitFor(() => expect(screen.getByLabelText("Kategori *")).toHaveValue("cat-1"));
  });

  it("validation: blank name shows required error", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Menu *");
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama menu wajib diisi/i)).toBeInTheDocument());
    expect(mockedUpdateMenuItemAction).not.toHaveBeenCalled();
  });

  it("validation: invalid price shows error", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const priceInput = screen.getByLabelText("Harga (Rp) *");
    fireEvent.change(priceInput, { target: { value: "-500" } });
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Harga tidak boleh negatif/i)).toBeInTheDocument());
    expect(mockedUpdateMenuItemAction).not.toHaveBeenCalled();
  });

  it("successful submission calls updateMenuItemAction with menuItemId and expectedUpdatedAt", async () => {
    const onClose = vi.fn();
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={onClose}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Nama Menu *")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Menu *");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Nasi Goreng Spesial");

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockedUpdateMenuItemAction).toHaveBeenCalledTimes(1));
    const payload = mockedUpdateMenuItemAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      outletId: "outlet-1",
      menuItemId: "item-1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      name: "Nasi Goreng Spesial",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles duplicate menu name conflict error from server", async () => {
    mockedUpdateMenuItemAction.mockResolvedValueOnce({
      ok: false,
      code: "MENU_NAME_CONFLICT",
      message: "Nama menu sudah digunakan di outlet ini.",
    });

    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Nama Menu *")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama menu sudah digunakan/i)).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("handles version conflict error (CATALOG_VERSION_CONFLICT)", async () => {
    mockedUpdateMenuItemAction.mockResolvedValueOnce({
      ok: false,
      code: "CATALOG_VERSION_CONFLICT",
      message: "Data telah berubah.",
    });

    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Nama Menu *")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Data menu telah diubah oleh pengguna lain/i)).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dirty state confirmation when closing with unsaved changes", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={true}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    await waitFor(() => expect(screen.getByLabelText("Nama Menu *")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Menu *");
    await userEvent.type(nameInput, " Extra");

    const originalConfirm = window.confirm;
    const confirmSpy = vi.fn().mockReturnValue(false);
    window.confirm = confirmSpy;

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    window.confirm = originalConfirm;
  });

  it("does not render when isOpen is false", async () => {
    renderWithProvider(
      <MenuEditDialog
        isOpen={false}
        onClose={vi.fn()}
        outletId={outletId}
        authScope={authScope}
        menuItem={mockMenuItem}
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
