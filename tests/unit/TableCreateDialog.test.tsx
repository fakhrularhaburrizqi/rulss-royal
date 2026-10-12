import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TableCreateDialog } from "@/app/dashboard/meja/TableCreateDialog";
import { createTableAction } from "@/app/dashboard/table-actions";

vi.mock("@/app/dashboard/table-actions", () => ({
  createTableAction: vi.fn(),
}));

const mockedCreateTableAction = vi.mocked(createTableAction);
const outletId = "outlet-1";

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("TableCreateDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateTableAction.mockResolvedValue({
      ok: true,
      data: {
        id: "table-new",
        code: "M01",
        capacity: 4,
        isActive: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when isOpen is true with correct default values", async () => {
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Tambah Meja Baru" })).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/Kode Meja/i) as HTMLInputElement;
    const capacityInput = screen.getByLabelText(/Kapasitas/i) as HTMLInputElement;
    const isActiveCheckbox = screen.getByLabelText(/Aktif/i) as HTMLInputElement;

    expect(codeInput).toHaveValue("");
    expect(capacityInput).toHaveValue(4);
    expect(isActiveCheckbox).toBeChecked();
  });

  it("validation: blank code shows required error", async () => {
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kode meja wajib diisi/i)).toBeInTheDocument());
    expect(mockedCreateTableAction).not.toHaveBeenCalled();
  });

  it("validation: capacity below minimum (0) shows error", async () => {
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Kode Meja/i), "M01");
    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "0" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kapasitas minimal 1/i)).toBeInTheDocument());
    expect(mockedCreateTableAction).not.toHaveBeenCalled();
  });

  it("validation: capacity above maximum (100) shows error", async () => {
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Kode Meja/i), "M01");
    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "100" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kapasitas maksimal 99/i)).toBeInTheDocument());
    expect(mockedCreateTableAction).not.toHaveBeenCalled();
  });

  it("automatically transforms code input to uppercase as user types", async () => {
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const codeInput = screen.getByLabelText(/Kode Meja/i) as HTMLInputElement;
    await userEvent.type(codeInput, "m02");

    expect(codeInput.value).toBe("M02");
  });

  it("successful submission calls createTableAction with correct payload and closes dialog", async () => {
    const onClose = vi.fn();
    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={onClose} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Kode Meja/i), "m01");
    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "6" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(mockedCreateTableAction).toHaveBeenCalledTimes(1));
    const payload = mockedCreateTableAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      outletId: "outlet-1",
      code: "M01",
      capacity: 6,
      isActive: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles table code conflict error from server", async () => {
    mockedCreateTableAction.mockResolvedValueOnce({
      ok: false,
      code: "TABLE_CODE_CONFLICT",
      message: "Kode meja sudah terdaftar.",
    });

    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={vi.fn()} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Kode Meja/i), "M01");
    await userEvent.click(screen.getByRole("button", { name: /Simpan/i }));

    await waitFor(() => expect(screen.getByText(/Kode meja sudah digunakan di outlet ini/i)).toBeInTheDocument());
  });

  it("prompts window.confirm when closing dirty form", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();

    renderWithProvider(
      <TableCreateDialog isOpen={true} onClose={onClose} outletId={outletId} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/Kode Meja/i), "M01");

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
