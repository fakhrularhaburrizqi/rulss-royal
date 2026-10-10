import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fetchMenuItems } from "@/lib/api/menu-items";
import { MenuItemTable } from "@/app/dashboard/menu/MenuItemTable";
import type { MenuItemAuthScope } from "@/lib/dashboard/menu-item-query-keys";
import type { ManagementMenuItemListItem, PaginatedMenuItemsResult } from "@/lib/services/menu-item-query.service";

vi.mock("@/lib/api/menu-items", () => ({
  fetchMenuItems: vi.fn(),
}));

const mockedFetchMenuItems = vi.mocked(fetchMenuItems);

const authScope: MenuItemAuthScope = { tenantId: "tenant-1", userId: "user-1" };
const outletId = "outlet-1";

function makeItem(
  overrides: Partial<ManagementMenuItemListItem> & { id: string; name: string }
): ManagementMenuItemListItem {
  return {
    categoryId: "cat-1",
    description: null,
    price: 15000,
    imageUrl: null,
    imageAlt: null,
    sortOrder: 0,
    isActive: true,
    isSoldOut: false,
    deletedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    category: { id: "cat-1", name: "Makanan", isActive: true, deletedAt: null },
    ...overrides,
  };
}

const mockData: PaginatedMenuItemsResult = {
  data: [
    makeItem({ id: "item-1", name: "Nasi Goreng", price: 12500 }),
    makeItem({
      id: "item-2",
      name: "Es Teh",
      price: 0,
      isActive: false,
      isSoldOut: true,
      categoryId: "cat-2",
      category: { id: "cat-2", name: "Minuman", isActive: true, deletedAt: null },
    }),
    makeItem({
      id: "item-3",
      name: "Kopi Susu",
      price: 1500000,
      deletedAt: "2026-01-01T00:00:00.000Z",
      category: { id: "cat-3", name: "Kopi", isActive: false, deletedAt: "2026-01-01T00:00:00.000Z" },
    }),
  ],
  nextCursor: "cursor-next",
  hasMore: true,
};

const mockEmptyData: PaginatedMenuItemsResult = { data: [], nextCursor: null, hasMore: false };

function renderWithProvider(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function apiError(status: number, code: string, message: string): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

describe("MenuItemTable DOM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchMenuItems.mockResolvedValue(mockData);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders filter select with all four options", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const select = screen.getByLabelText("Filter menu") as HTMLSelectElement;
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Semua", "Aktif", "Tidak Aktif", "Arsip"]);
    expect(select).not.toBeDisabled();
  });

  it("renders the five columns: Nama, Kategori, Harga, Status item, Sold-out", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual(["Nama", "Kategori", "Harga", "Status item", "Sold-out"]);
  });

  it("formats integer prices with the local rupiah formatter", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    expect(screen.getByText("Rp12.500")).toBeInTheDocument();
    expect(screen.getByText("Rp0")).toBeInTheDocument();
    expect(screen.getByText("Rp1.500.000")).toBeInTheDocument();
  });

  it("renders item status badges: Aktif, Tidak Aktif, Arsip", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const table = screen.getByRole("table");
    expect(within(table).getByText("Aktif")).toBeInTheDocument();
    expect(within(table).getByText("Tidak Aktif")).toBeInTheDocument();
    expect(within(table).getByText("Arsip")).toBeInTheDocument();
  });

  it("shows Habis for sold-out items and an accessible not-marked value otherwise", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const soldOutRow = screen.getByText("Es Teh").closest("tr");
    expect(within(soldOutRow as HTMLElement).getByText("Habis")).toBeInTheDocument();

    const freshRow = screen.getByText("Nasi Goreng").closest("tr");
    expect(within(freshRow as HTMLElement).queryByText("Habis")).not.toBeInTheDocument();
    expect(within(freshRow as HTMLElement).getByText("Tidak ditandai habis")).toBeInTheDocument();
    const archivedRow = screen.getByText("Kopi Susu").closest("tr");
    expect(within(archivedRow as HTMLElement).getByText("Tidak ditandai habis")).toBeInTheDocument();
  });

  it("marks unavailable categories separately from item status", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const archivedRow = screen.getByText("Kopi Susu").closest("tr");
    expect(within(archivedRow as HTMLElement).getByText("Kategori tidak tersedia")).toBeInTheDocument();
    expect(within(archivedRow as HTMLElement).getByText("Arsip")).toBeInTheDocument();

    const healthyRow = screen.getByText("Nasi Goreng").closest("tr");
    expect(within(healthyRow as HTMLElement).getByText("Makanan")).toBeInTheDocument();
    expect(within(healthyRow as HTMLElement).queryByText("Kategori tidak tersedia")).not.toBeInTheDocument();
  });

  it("shows loading skeleton on initial load without initialData", () => {
    mockedFetchMenuItems.mockImplementation(() => new Promise<PaginatedMenuItemsResult>(() => {}));

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-label", "Memuat menu");
    expect(screen.getByLabelText("Filter menu")).not.toBeDisabled();
    expect(screen.getByLabelText("Cari menu")).not.toBeDisabled();
  });

  it("shows empty state with five-column span", async () => {
    mockedFetchMenuItems.mockResolvedValue(mockEmptyData);

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => expect(screen.getByText("Tidak ada menu ditemukan")).toBeInTheDocument());
    expect(screen.getByText("Tidak ada menu ditemukan").closest("td")).toHaveAttribute("colspan", "5");
    expect(screen.getByText("Tidak ada data")).toBeInTheDocument();
  });

  it("shows error state with working retry for non-auth errors", async () => {
    let shouldFail = true;
    mockedFetchMenuItems.mockImplementation(async () => {
      if (shouldFail) throw apiError(500, "INTERNAL_ERROR", "server down");
      return mockData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Gagal Memuat" })).toBeInTheDocument();
      expect(screen.getByText("Gagal memuat menu. Silakan coba lagi.")).toBeInTheDocument();
    });

    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Coba Lagi" }));

    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());
    expect(screen.queryByText("Gagal Memuat")).not.toBeInTheDocument();
  });

  it("shows auth error without retry button for 401", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(401, "UNAUTHENTICATED", "Sesi berakhir");
    });

    renderWithProvider(
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={Date.now() - 1000 * 60 * 10}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Sesi Anda telah berakhir. Silakan masuk kembali.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Coba Lagi" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter menu")).toBeDisabled();
    expect(screen.getByLabelText("Cari menu")).toBeDisabled();
  });

  it("shows auth error without retry button for 403", async () => {
    mockedFetchMenuItems.mockImplementation(async () => {
      throw apiError(403, "OUTLET_ACCESS_DENIED", "Akses ditolak");
    });

    renderWithProvider(
      <MenuItemTable
        authScope={authScope}
        outletId={outletId}
        initialData={mockData}
        initialDataUpdatedAt={Date.now() - 1000 * 60 * 10}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
      expect(screen.getByText("Anda tidak memiliki akses ke menu di outlet ini.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Coba Lagi" })).not.toBeInTheDocument();
  });

  it("keeps controls available while results load after a filter change", async () => {
    mockedFetchMenuItems.mockImplementation(async (params) => {
      if (params.filter === "active") {
        return new Promise<PaginatedMenuItemsResult>(() => {});
      }
      return mockData;
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const select = screen.getByLabelText("Filter menu") as HTMLSelectElement;
    const input = screen.getByLabelText("Cari menu");

    fireEvent.change(select, { target: { value: "active" } });

    expect(select).toHaveValue("active");
    expect(select).not.toBeDisabled();
    expect(input).not.toBeDisabled();
    expect(screen.queryByRole("heading", { name: "Akses Ditolak" })).not.toBeInTheDocument();
  });

  it("has accessible labels on filter, search and pagination controls", async () => {
    mockedFetchMenuItems.mockResolvedValue(mockEmptyData);

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Tidak ada menu ditemukan")).toBeInTheDocument());

    expect(screen.getByLabelText("Filter menu")).toBeInTheDocument();
    expect(screen.getByLabelText("Cari menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Halaman selanjutnya" })).toBeDisabled();
  });

  it("shows row count with hasMore hint", async () => {
    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    expect(screen.getByText("Menampilkan 3 menu (lebih banyak tersedia)")).toBeInTheDocument();
  });

  it("disables pagination buttons when !hasMore", async () => {
    mockedFetchMenuItems.mockResolvedValue({
      data: [makeItem({ id: "item-1", name: "Nasi Goreng" })],
      nextCursor: null,
      hasMore: false,
    });

    renderWithProvider(<MenuItemTable authScope={authScope} outletId={outletId} />);
    await waitFor(() => expect(screen.getByText("Nasi Goreng")).toBeInTheDocument());

    const prevButton = screen.getByRole("button", { name: "Halaman sebelumnya" });
    const nextButton = screen.getByRole("button", { name: "Halaman selanjutnya" });

    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeDisabled();
  });
});
