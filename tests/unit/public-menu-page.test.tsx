import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PublicMenuPage from "@/app/p/[tableId]/page";
import { getPublicCatalog } from "@/lib/services/public-menu.service";

vi.mock("@/lib/services/public-menu.service", () => ({
  getPublicCatalog: vi.fn(),
}));

const mockedGetPublicCatalog = vi.mocked(getPublicCatalog);

describe("PublicMenuPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders error message when token is missing from searchParams", async () => {
    const ui = await PublicMenuPage({
      params: Promise.resolve({ tableId: "table-1" }),
      searchParams: Promise.resolve({}),
    });

    render(ui);

    expect(screen.getByText("Akses Ditolak")).toBeInTheDocument();
    expect(screen.getByText(/Token akses tidak ditemukan/i)).toBeInTheDocument();
    expect(mockedGetPublicCatalog).not.toHaveBeenCalled();
  });

  it("renders error message when getPublicCatalog throws an error", async () => {
    mockedGetPublicCatalog.mockRejectedValueOnce(new Error("Token invalid"));

    const ui = await PublicMenuPage({
      params: Promise.resolve({ tableId: "table-1" }),
      searchParams: Promise.resolve({ token: "invalid-token" }),
    });

    render(ui);

    expect(screen.getByText("Sesi Tidak Valid")).toBeInTheDocument();
    expect(screen.getByText(/Sesi meja tidak valid atau kadaluarsa/i)).toBeInTheDocument();
  });

  it("successfully renders header with table code", async () => {
    mockedGetPublicCatalog.mockResolvedValueOnce({
      table: { id: "table-1", code: "M01" },
      categories: [
        { id: "cat-1", name: "Makanan", sortOrder: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      menuItems: [
        {
          id: "item-1",
          categoryId: "cat-1",
          name: "Nasi Goreng",
          description: "Lezat",
          price: 15000,
          imageUrl: null,
          imageAlt: null,
          sortOrder: 0,
          isSoldOut: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const ui = await PublicMenuPage({
      params: Promise.resolve({ tableId: "table-1" }),
      searchParams: Promise.resolve({ token: "valid-token" }),
    });

    render(ui);

    expect(screen.getByText("Menu Warungku")).toBeInTheDocument();
    expect(screen.getByText("Meja: M01")).toBeInTheDocument();
  });

  it("renders menu list grouped by categories", async () => {
    mockedGetPublicCatalog.mockResolvedValueOnce({
      table: { id: "table-1", code: "M01" },
      categories: [
        { id: "cat-1", name: "Makanan", sortOrder: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "cat-2", name: "Minuman", sortOrder: 1, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      menuItems: [
        {
          id: "item-1",
          categoryId: "cat-1",
          name: "Nasi Goreng",
          description: null,
          price: 15000,
          imageUrl: null,
          imageAlt: null,
          sortOrder: 0,
          isSoldOut: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "item-2",
          categoryId: "cat-2",
          name: "Es Teh",
          description: null,
          price: 5000,
          imageUrl: null,
          imageAlt: null,
          sortOrder: 0,
          isSoldOut: false,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const ui = await PublicMenuPage({
      params: Promise.resolve({ tableId: "table-1" }),
      searchParams: Promise.resolve({ token: "valid-token" }),
    });

    render(ui);

    expect(screen.getByText("Makanan")).toBeInTheDocument();
    expect(screen.getByText("Nasi Goreng")).toBeInTheDocument();
    expect(screen.getByText("Minuman")).toBeInTheDocument();
    expect(screen.getByText("Es Teh")).toBeInTheDocument();
  });

  it("ensures menu item with isSoldOut: true shows 'Habis' indicator", async () => {
    mockedGetPublicCatalog.mockResolvedValueOnce({
      table: { id: "table-1", code: "M01" },
      categories: [
        { id: "cat-1", name: "Makanan", sortOrder: 0, updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      menuItems: [
        {
          id: "item-1",
          categoryId: "cat-1",
          name: "Bakso",
          description: null,
          price: 12000,
          imageUrl: null,
          imageAlt: null,
          sortOrder: 0,
          isSoldOut: true,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const ui = await PublicMenuPage({
      params: Promise.resolve({ tableId: "table-1" }),
      searchParams: Promise.resolve({ token: "valid-token" }),
    });

    render(ui);

    expect(screen.getByText("Bakso")).toBeInTheDocument();
    expect(screen.getByText("Habis")).toBeInTheDocument();
  });
});
