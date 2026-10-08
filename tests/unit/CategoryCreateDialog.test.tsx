import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryTable } from "@/app/dashboard/kategori/CategoryTable";
import type { CategoryAuthScope } from "@/lib/dashboard/category-query-keys";
import type { PaginatedCategoriesResult } from "@/lib/services/menu-category-query.service";
import { createCategoryAction, updateCategoryAction } from "@/app/dashboard/menu-actions";

const authScope: CategoryAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

const mockEmptyData: PaginatedCategoriesResult = { data: [], nextCursor: null, hasMore: false };

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

describe("CategoryCreateDialog", () => {
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

  it("permission false: Tambah Kategori button not rendered", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={false} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Tambah Kategori/i })).not.toBeInTheDocument();
  });

  it("permission true: Tambah Kategori button rendered and opens dialog", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    const addButton = screen.getByRole("button", { name: /Tambah Kategori/i });
    expect(addButton).toBeInTheDocument();

    await userEvent.click(addButton);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Tambah Kategori" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nama Kategori *")).toBeInTheDocument();
  });

  it("defaults: name empty, sortOrder 0, isActive true", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("validation: blank name shows required error", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama kategori wajib diisi/i)).toBeInTheDocument());
    expect(mockCreateCategoryAction).not.toHaveBeenCalled();
  });

  it("validation: name max 80 chars via controlled change", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
    // Bypass maxlength via controlled change to test validator
    act(() => {
      fireEvent.change(nameInput, { target: { value: "a".repeat(81) } });
    });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/maksimal 80 karakter/i)).toBeInTheDocument());
  });

  it("validation: name 80 chars via typing is accepted", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;
    await userEvent.type(nameInput, "a".repeat(80));

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockCreateCategoryAction).toHaveBeenCalled());
    const payload = mockCreateCategoryAction.mock.calls[0][0];
    expect(payload.name).toHaveLength(80);
    expect(screen.queryByText(/maksimal 80 karakter/i)).not.toBeInTheDocument();
  });

  it("sortOrder blank becomes 0 via clear and submit", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;

    await userEvent.type(nameInput, "Test");
    await userEvent.clear(sortOrderInput);
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockCreateCategoryAction).toHaveBeenCalled());
    const payload = mockCreateCategoryAction.mock.calls[0][0];
    expect(payload.sortOrder).toBe(0);
  });

  it("sortOrder rejects decimal", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;

    await userEvent.type(nameInput, "Test Decimal");
    // Bypass number input via controlled change for decimal test
    act(() => {
      fireEvent.change(sortOrderInput, { target: { value: "1.5" } });
    });
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/bilangan bulat/i)).toBeInTheDocument());
  });

  it("sortOrder rejects out-of-range", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const sortOrderInput = screen.getByLabelText("Urutan") as HTMLInputElement;
    const nameInput = screen.getByLabelText("Nama Kategori *") as HTMLInputElement;

    await userEvent.type(nameInput, "Test Range");
    act(() => {
      fireEvent.change(sortOrderInput, { target: { value: "10000" } });
    });
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/maksimal 9999/i)).toBeInTheDocument());
  });

  it("payload includes outletId from prop, not user input", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId="outlet-42" canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Outlet");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockCreateCategoryAction).toHaveBeenCalled());
    const payload = mockCreateCategoryAction.mock.calls[0][0];
    expect(payload.outletId).toBe("outlet-42");
    expect(payload.name).toBe("Test Outlet");
  });

  it("duplicate name: CATEGORY_NAME_CONFLICT -> name field error, input retained, dialog stays open", async () => {
    mockCreateCategoryAction.mockResolvedValueOnce({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: "Nama kategori sudah digunakan di outlet ini.",
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Duplicate");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Nama kategori sudah digunakan/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Duplicate");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("other server error: domain error shown, input retained", async () => {
    mockCreateCategoryAction.mockResolvedValueOnce({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Terjadi kesalahan. Silakan coba lagi.",
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Error");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Test Error");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("thrown/rejected action: domain error shown, pending cleared", async () => {
    mockCreateCategoryAction.mockRejectedValueOnce(new Error("Network error"));

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Test Throw");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Terjadi kesalahan/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Simpan/i })).not.toBeDisabled();
  });

  it("success: feedback shown after dialog closes, form reset", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("confirmation: false -> dialog/input retained, action 0", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("pending close: built-in X button rejected", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    // Spy on window.confirm to verify it's not called during pending
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText("Nama Kategori *"), "Pending X Close");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    const saveButton = screen.getByRole("button", { name: /Menyimpan/i });
    expect(saveButton).toBeDisabled();

    // Click the actual built-in X button (Radix Dialog renders this with accessible name "Close")
    const closeButton = screen.getByRole("button", { name: /Close/i });
    await userEvent.click(closeButton);

    // Dialog should stay open
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Input should be retained
    expect(screen.getByLabelText("Nama Kategori *")).toHaveValue("Pending X Close");
    // Confirm should not be called (no dirty confirmation during pending)
    expect(confirmSpy).not.toHaveBeenCalled();
    // Action should still be exactly 1 call
    expect(mockCreateCategoryAction).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();

    await act(async () => {
      resolveAction!({ ok: true, data: { id: "cat-4", name: "Pending X Close", sortOrder: 0, isActive: true, deletedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } });
      await actionPromise;
    });
  });

  it("pending close: clean X button works (control case)", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    // Dialog is clean (no input), X button should close it
    const closeButton = screen.getByRole("button", { name: /Close/i });
    await userEvent.click(closeButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pending close: clean close works (control case)", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
    await waitFor(() => expect(screen.getByLabelText("Filter kategori")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Tambah Kategori/i }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const batalButton = screen.getByRole("button", { name: /Batal/i });
    await userEvent.click(batalButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("success close bypasses dirty confirmation", async () => {
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("beforeunload: clean false, open+dirty true, closed/reset false, unmounted false", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("concurrent submit: two submits in one act, action called once before resolve", async () => {
    let resolveAction: (value: unknown) => void;
    const actionPromise = new Promise((resolve) => { resolveAction = resolve; });
    mockCreateCategoryAction.mockReturnValueOnce(actionPromise);

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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

  it("duplicate retains dirty protection after error", async () => {
    mockCreateCategoryAction.mockResolvedValueOnce({
      ok: false,
      code: "CATEGORY_NAME_CONFLICT",
      message: "Nama kategori sudah digunakan di outlet ini.",
    });

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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
    mockCreateCategoryAction.mockRejectedValueOnce(new Error("Network error"));

    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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
    renderWithProvider(
      <CategoryTable authScope={authScope} outletId={outletId} canManageCatalog={true} />
    );
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
});