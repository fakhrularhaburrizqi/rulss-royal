import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getPublicCatalog } from "@/lib/services/public-menu.service";
import { OrderDomainError } from "@/lib/order/errors";

vi.mock("@/lib/db", () => ({
  db: {
    diningTable: { findFirst: vi.fn() },
    menuCategory: { findMany: vi.fn() },
    menuItem: { findMany: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
  },
}));

const mockedFindTable = vi.mocked(db.diningTable.findFirst);
const mockedFindCategories = vi.mocked(db.menuCategory.findMany);
const mockedFindMenuItems = vi.mocked(db.menuItem.findMany);
const mockedBcryptCompare = vi.mocked(bcrypt.compare);

describe("public-menu.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successfully returns catalog for valid token and table", async () => {
    mockedFindTable.mockResolvedValueOnce({
      id: "table-1",
      code: "M01",
      outletId: "outlet-1",
      qrTokenHash: "$2a$12$hashedtoken",
      isActive: true,
    } as any);

    mockedBcryptCompare.mockResolvedValueOnce(true as never);

    mockedFindCategories.mockResolvedValueOnce([
      { id: "cat-1", name: "Makanan", sortOrder: 0, updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ] as any);

    mockedFindMenuItems.mockResolvedValueOnce([
      {
        id: "item-1",
        categoryId: "cat-1",
        name: "Nasi Goreng",
        description: "Enak",
        price: 15000,
        imageUrl: null,
        imageAlt: null,
        sortOrder: 0,
        isSoldOut: false,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ] as any);

    const result = await getPublicCatalog("table-1", "secret-token");

    expect(result.table).toEqual({ id: "table-1", code: "M01" });
    expect(result.categories).toHaveLength(1);
    expect(result.menuItems).toHaveLength(1);
    expect(result.menuItems[0].name).toBe("Nasi Goreng");
  });

  it("throws TABLE_NOT_FOUND when table does not exist or has null hash", async () => {
    mockedFindTable.mockResolvedValueOnce(null);

    await expect(getPublicCatalog("table-99", "token")).rejects.toThrowError(
      expect.objectContaining({ code: "TABLE_NOT_FOUND" })
    );

    mockedFindTable.mockResolvedValueOnce({
      id: "table-1",
      code: "M01",
      outletId: "outlet-1",
      qrTokenHash: null,
      isActive: true,
    } as any);

    await expect(getPublicCatalog("table-1", "token")).rejects.toThrowError(
      expect.objectContaining({ code: "TABLE_NOT_FOUND" })
    );
  });

  it("throws TOKEN_INVALID when token comparison fails", async () => {
    mockedFindTable.mockResolvedValueOnce({
      id: "table-1",
      code: "M01",
      outletId: "outlet-1",
      qrTokenHash: "$2a$12$hashedtoken",
      isActive: true,
    } as any);

    mockedBcryptCompare.mockResolvedValueOnce(false as never);

    await expect(getPublicCatalog("table-1", "wrong-token")).rejects.toThrowError(
      expect.objectContaining({ code: "TOKEN_INVALID" })
    );
  });

  it("queries categories and menu items filtering by isActive: true and deletedAt: null", async () => {
    mockedFindTable.mockResolvedValueOnce({
      id: "table-1",
      code: "M01",
      outletId: "outlet-1",
      qrTokenHash: "$2a$12$hashedtoken",
      isActive: true,
    } as any);

    mockedBcryptCompare.mockResolvedValueOnce(true as never);
    mockedFindCategories.mockResolvedValueOnce([]);
    mockedFindMenuItems.mockResolvedValueOnce([]);

    await getPublicCatalog("table-1", "secret-token");

    expect(mockedFindCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outletId: "outlet-1",
          isActive: true,
          deletedAt: null,
        }),
      })
    );

    expect(mockedFindMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          outletId: "outlet-1",
          isActive: true,
          deletedAt: null,
        }),
      })
    );
  });

  it("applies sort order in query options", async () => {
    mockedFindTable.mockResolvedValueOnce({
      id: "table-1",
      code: "M01",
      outletId: "outlet-1",
      qrTokenHash: "$2a$12$hashedtoken",
      isActive: true,
    } as any);

    mockedBcryptCompare.mockResolvedValueOnce(true as never);
    mockedFindCategories.mockResolvedValueOnce([]);
    mockedFindMenuItems.mockResolvedValueOnce([]);

    await getPublicCatalog("table-1", "secret-token");

    expect(mockedFindCategories).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    );

    expect(mockedFindMenuItems).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    );
  });

  it("throws INVALID_INPUT for missing or malformed parameters", async () => {
    await expect(getPublicCatalog("", "token")).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
    await expect(getPublicCatalog("table-1", "")).rejects.toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" })
    );
  });
});
