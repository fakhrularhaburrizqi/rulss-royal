import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TableEditDialog } from "@/app/dashboard/meja/TableEditDialog";
import { updateTableAction } from "@/app/dashboard/table-actions";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

vi.mock("@/app/dashboard/table-actions", () => ({
  updateTableAction: vi.fn(),
}));

const mockedUpdateTableAction = vi.mocked(updateTableAction);
const outletId = "outlet-1";

const mockTable: DiningTableSummary = {
  id: "table-1",
  code: "M01",
  capacity: 4,
  isActive: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("TableEditDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpdateTableAction.mockResolvedValue({
      ok: true,
      data: {
        id: "table-1",
        code: "M02",
        capacity: 6,
        isActive: true,
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when isOpen is true with default values from table prop", async () => {
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Edit Meja" })).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/Kode Meja/i) as HTMLInputElement;
    const capacityInput = screen.getByLabelText(/Kapasitas/i) as HTMLInputElement;

    expect(codeInput).toHaveValue("M01");
    expect(capacityInput).toHaveValue(4);
  });

  it("validation: empty code shows required error", async () => {
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const codeInput = screen.getByLabelText(/Kode Meja/i);
    await userEvent.clear(codeInput);

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(screen.getByText(/Kode meja wajib diisi/i)).toBeInTheDocument());
    expect(mockedUpdateTableAction).not.toHaveBeenCalled();
  });

  it("validation: capacity below minimum (0) shows error", async () => {
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "0" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(screen.getByText(/Kapasitas minimal 1/i)).toBeInTheDocument());
    expect(mockedUpdateTableAction).not.toHaveBeenCalled();
  });

  it("validation: capacity above maximum (100) shows error", async () => {
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "100" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(screen.getByText(/Kapasitas maksimal 99/i)).toBeInTheDocument());
    expect(mockedUpdateTableAction).not.toHaveBeenCalled();
  });

  it("automatically transforms code input to uppercase as user types", async () => {
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const codeInput = screen.getByLabelText(/Kode Meja/i) as HTMLInputElement;
    await userEvent.clear(codeInput);
    await userEvent.type(codeInput, "m02");

    expect(codeInput.value).toBe("M02");
  });

  it("successful submission calls updateTableAction with tableId and expectedUpdatedAt", async () => {
    const onClose = vi.fn();
    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={onClose} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const codeInput = screen.getByLabelText(/Kode Meja/i);
    await userEvent.clear(codeInput);
    await userEvent.type(codeInput, "M02");

    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "6" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(mockedUpdateTableAction).toHaveBeenCalledTimes(1));
    const payload = mockedUpdateTableAction.mock.calls[0][0];
    expect(payload).toMatchObject({
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
      code: "M02",
      capacity: 6,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("handles table code conflict error from server", async () => {
    mockedUpdateTableAction.mockResolvedValueOnce({
      ok: false,
      code: "TABLE_CODE_CONFLICT",
      message: "Kode sudah ada.",
    });

    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const codeInput = screen.getByLabelText(/Kode Meja/i);
    await userEvent.clear(codeInput);
    await userEvent.type(codeInput, "M99");

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(screen.getByText(/Kode meja sudah digunakan di outlet ini/i)).toBeInTheDocument());
  });

  it("handles table version conflict error from server", async () => {
    mockedUpdateTableAction.mockResolvedValueOnce({
      ok: false,
      code: "TABLE_VERSION_CONFLICT",
      message: "Versi konflik.",
    });

    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "5" } });

    await userEvent.click(screen.getByRole("button", { name: /Simpan Perubahan/i }));

    await waitFor(() => expect(screen.getByText(/Data meja telah diubah oleh pengguna lain/i)).toBeInTheDocument());
  });

  it("prompts window.confirm when closing dirty form", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();

    renderWithProvider(
      <TableEditDialog isOpen={true} onClose={onClose} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const capacityInput = screen.getByLabelText(/Kapasitas/i);
    fireEvent.change(capacityInput, { target: { value: "5" } });

    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: /Batal/i }));
    expect(onClose).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
