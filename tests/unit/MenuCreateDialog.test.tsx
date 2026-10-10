import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MenuCreateDialog } from "@/app/dashboard/menu/MenuCreateDialog";
import { fetchCategories } from "@/lib/api/categories";
import { createMenuItemAction } from "@/app/dashboard/menu-actions";
import type { MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";

vi.mock("@/lib/api/categories", () => ({
  fetchCategories: vi.fn(),
}));

vi.mock("@/app/dashboard/menu-actions", () => ({
  createMenuItemAction: vi.fn(),
}));

const mockedFetchCategories = vi.mocked(fetchCategories);
const mockedCreateMenuItemAction = vi.mocked(createMenuItemAction);

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

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("MenuCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchCategories.mockResolvedValue(mockCategories);
    mockedCreateMenuItemAction.mockResolvedValue({
      ok: true,
      data: {
        id: "item-new",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        price: 15000,
        isActive: true,
        isSoldOut: false,
        deletedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when isOpen is true and fetches active categories", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Tambah Menu Baru" })).toBeInTheDocument();
    expect(mockedFetchCategories).toHaveBeenCalledWith({ outlet: outletId, filter: "active", limit: 100 });
    await waitFor(() => expect(screen.getByRole("option", { name: "Makanan" })).toBeInTheDocument());
  });

  it("has correct default values", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Menu *") as HTMLInputElement;
    const priceInput = screen.getByLabelText("Harga (Rp) *") as HTMLInputElement;
    const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
    const isActiveCheckbox = screen.getByLabelText("Aktif") as HTMLInputElement;
    const isSoldOutCheckbox = screen.getByLabelText("Habis (Sold Out)") as HTMLInputElement;

    expect(nameInput).toHaveValue("");
    expect(priceInput).toHaveValue(0);
    expect(sortOrderInput).toHaveValue(0);
    expect(isActiveCheckbox).toBeChecked();
    expect(isSoldOutCheckbox).not.toBeChecked();
  });

  it("validation: blank name shows required error", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama menu wajib diisi/i)).toBeInTheDocument());
    expect(mockedCreateMenuItemAction).not.toHaveBeenCalled();
  });

  it("validation: blank category shows required error", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Menu *"), "Nasi Goreng");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/ID wajib diisi/i)).toBeInTheDocument());
    expect(mockedCreateMenuItemAction).not.toHaveBeenCalled();
  });

  it("validation: negative price shows error", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const priceInput = screen.getByLabelText("Harga (Rp) *");
    fireEvent.change(priceInput, { target: { value: "-1000" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Harga tidak boleh negatif/i)).toBeInTheDocument());
    expect(mockedCreateMenuItemAction).not.toHaveBeenCalled();
  });

  it("validation: decimal price shows integer error", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const priceInput = screen.getByLabelText("Harga (Rp) *");
    fireEvent.change(priceInput, { target: { value: "15000.5" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Harga harus bilangan bulat/i)).toBeInTheDocument());
    expect(mockedCreateMenuItemAction).not.toHaveBeenCalled();
  });

  it("successful submission calls createMenuItemAction with correct payload", async () => {
    const onClose = vi.fn();
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={onClose} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("option", { name: "Makanan" })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText("Kategori *"), "cat-1");
    await userEvent.type(screen.getByLabelText("Nama Menu *"), "Nasi Goreng");
    const priceInput = screen.getByLabelText("Harga (Rp) *");
    fireEvent.change(priceInput, { target: { value: "15000" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockedCreateMenuItemAction).toHaveBeenCalledTimes(1));
    const payload = mockedCreateMenuItemAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      outletId: "outlet-1",
      categoryId: "cat-1",
      name: "Nasi Goreng",
      price: 15000,
      isActive: true,
      isSoldOut: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles duplicate menu name conflict error from server", async () => {
    mockedCreateMenuItemAction.mockResolvedValueOnce({
      ok: false,
      code: "MENU_NAME_CONFLICT",
      message: "Nama menu sudah digunakan di outlet ini.",
    });

    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("option", { name: "Makanan" })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText("Kategori *"), "cat-1");
    await userEvent.type(screen.getByLabelText("Nama Menu *"), "Nasi Goreng");
    const priceInput = screen.getByLabelText("Harga (Rp) *");
    fireEvent.change(priceInput, { target: { value: "15000" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama menu sudah digunakan/i)).toBeInTheDocument());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dirty state confirmation when closing with unsaved changes", async () => {
    renderWithProvider(
      <MenuCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Menu *"), "Unsaved Menu");

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
      <MenuCreateDialog isOpen={false} onClose={vi.fn()} outletId={outletId} authScope={authScope} />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
