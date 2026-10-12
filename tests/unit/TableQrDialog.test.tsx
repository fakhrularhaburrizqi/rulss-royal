import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TableQrDialog } from "@/app/dashboard/meja/TableQrDialog";
import { generateTableTokenAction } from "@/app/dashboard/table-actions";
import type { DiningTableSummary } from "@/lib/services/dining-table.service";

vi.mock("@/app/dashboard/table-actions", () => ({
  generateTableTokenAction: vi.fn(),
}));

const mockedGenerateTableTokenAction = vi.mocked(generateTableTokenAction);
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

describe("TableQrDialog", () => {
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
    mockedGenerateTableTokenAction.mockResolvedValue({
      ok: true,
      data: { token: "secret-qr-token-xyz" },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders initial state with warning and generate button when isOpen is true", async () => {
    renderWithProvider(
      <TableQrDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "QR Code Meja: M01" })).toBeInTheDocument();
    expect(screen.getByText(/Menghasilkan QR baru akan membuat QR lama tidak berlaku/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate QR Baru/i })).toBeInTheDocument();
  });

  it("clicking 'Generate QR Baru' calls generateTableTokenAction with correct tableId and outletId", async () => {
    renderWithProvider(
      <TableQrDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Generate QR Baru/i }));

    await waitFor(() => expect(mockedGenerateTableTokenAction).toHaveBeenCalledTimes(1));
    expect(mockedGenerateTableTokenAction).toHaveBeenCalledWith({
      tableId: "table-1",
      outletId: "outlet-1",
    });
  });

  it("displays success state with public URL and placeholder after token generation", async () => {
    renderWithProvider(
      <TableQrDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Generate QR Baru/i }));

    await waitFor(() => expect(screen.getByText("QR Code (Siap Dicetak)")).toBeInTheDocument());
    const urlInput = screen.getByLabelText(/URL Publik Pelanggan/i) as HTMLInputElement;
    expect(urlInput.value).toContain("/p/table-1?token=secret-qr-token-xyz");
  });

  it("copies public URL to clipboard when 'Copy' button is clicked", async () => {
    renderWithProvider(
      <TableQrDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Generate QR Baru/i }));

    await waitFor(() => expect(screen.getByText("QR Code (Siap Dicetak)")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Copy/i }));

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("/p/table-1?token=secret-qr-token-xyz"));
    expect(screen.getByRole("button", { name: /Tersalin!/i })).toBeInTheDocument();
  });

  it("handles action failure gracefully", async () => {
    mockedGenerateTableTokenAction.mockResolvedValueOnce({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Gagal menghasilkan token.",
    });

    renderWithProvider(
      <TableQrDialog isOpen={true} onClose={vi.fn()} outletId={outletId} table={mockTable} />
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /Generate QR Baru/i }));

    await waitFor(() => expect(screen.getByText("Gagal menghasilkan token.")).toBeInTheDocument());
  });
});
