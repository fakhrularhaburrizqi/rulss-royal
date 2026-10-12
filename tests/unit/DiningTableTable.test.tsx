import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DiningTableTable } from "@/app/dashboard/meja/DiningTableTable";
import { useDiningTablesQuery } from "@/app/dashboard/meja/useDiningTablesQuery";

const mockCreateTableAction = vi.hoisted(() => vi.fn());
const mockUpdateTableAction = vi.hoisted(() => vi.fn());
const mockDeactivateTableAction = vi.hoisted(() => vi.fn());
const mockReactivateTableAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/dashboard/table-actions", () => ({
  createTableAction: mockCreateTableAction,
  updateTableAction: mockUpdateTableAction,
  deactivateTableAction: mockDeactivateTableAction,
  reactivateTableAction: mockReactivateTableAction,
}));

vi.mock("@/app/dashboard/meja/useDiningTablesQuery", () => ({
  useDiningTablesQuery: vi.fn(),
}));

const mockedUseDiningTablesQuery = vi.mocked(useDiningTablesQuery);
const authScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("DiningTableTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state correctly", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    expect(screen.getByText("Memuat data meja...")).toBeInTheDocument();
  });

  it("renders error state correctly", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error("Gagal mengambil data"),
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    expect(screen.getByText("Gagal mengambil data")).toBeInTheDocument();
  });

  it("renders empty state correctly when tables list is empty", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    expect(screen.getByText("Belum ada meja terdaftar.")).toBeInTheDocument();
  });

  it("renders table columns and rows correctly with active and inactive status badges", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [
        { id: "t-1", code: "M01", capacity: 4, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "t-2", code: "M02", capacity: 2, isActive: false, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    expect(screen.getByText("Kode Meja")).toBeInTheDocument();
    expect(screen.getByText("Kapasitas")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Aksi")).toBeInTheDocument();

    expect(screen.getByText("M01")).toBeInTheDocument();
    expect(screen.getByText("4 orang")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();

    expect(screen.getByText("M02")).toBeInTheDocument();
    expect(screen.getByText("2 orang")).toBeInTheDocument();
    expect(screen.getByText("Tidak Aktif")).toBeInTheDocument();
  });

  it("shows 'Tambah Meja' button when canManageTables is true and opens create dialog", async () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    const addButton = screen.getByRole("button", { name: /Tambah Meja/i });
    expect(addButton).toBeInTheDocument();

    await userEvent.click(addButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Tambah Meja Baru" })).toBeInTheDocument();
  });

  it("hides 'Tambah Meja' button when canManageTables is false", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={false} />
    );

    expect(screen.queryByRole("button", { name: /Tambah Meja/i })).not.toBeInTheDocument();
  });

  it("shows 'Edit' button per row and opens edit dialog when canManageTables is true", async () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [
        { id: "t-1", code: "M01", capacity: 4, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    const editButton = screen.getByRole("button", { name: /Edit/i });
    expect(editButton).toBeInTheDocument();

    await userEvent.click(editButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Edit Meja" })).toBeInTheDocument();
  });

  it("shows 'QR' button per row and opens QR dialog when canManageTables is true", async () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [
        { id: "t-1", code: "M01", capacity: 4, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={true} />
    );

    const qrButton = screen.getByRole("button", { name: /^QR$/i });
    expect(qrButton).toBeInTheDocument();

    await userEvent.click(qrButton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /QR Code Meja: M01/i })).toBeInTheDocument();
  });

  it("hides 'Edit' button when canManageTables is false", () => {
    mockedUseDiningTablesQuery.mockReturnValue({
      data: [
        { id: "t-1", code: "M01", capacity: 4, isActive: true, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProvider(
      <DiningTableTable authScope={authScope} outletId={outletId} canManageTables={false} />
    );

    expect(screen.queryByRole("button", { name: /Edit/i })).not.toBeInTheDocument();
  });
});
