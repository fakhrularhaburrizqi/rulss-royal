import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";

export type PublicCatalogResult = {
  table: {
    id: string;
    code: string;
  };
  categories: Array<{
    id: string;
    name: string;
    sortOrder: number;
    updatedAt: string;
  }>;
  menuItems: Array<{
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
    imageAlt: string | null;
    sortOrder: number;
    isSoldOut: boolean;
    updatedAt: string;
  }>;
};

export async function getPublicCatalog(tableId: string, rawToken: string): Promise<PublicCatalogResult> {
  if (!tableId || typeof tableId !== "string" || !rawToken || typeof rawToken !== "string") {
    throw new OrderDomainError("INVALID_INPUT");
  }

  try {
    const table = await db.diningTable.findFirst({
      where: { id: tableId.trim() },
      select: {
        id: true,
        code: true,
        outletId: true,
        qrTokenHash: true,
        isActive: true,
      },
    });

    if (table === null || table.qrTokenHash === null) {
      throw new OrderDomainError("TABLE_NOT_FOUND");
    }

    const isValidToken = await bcrypt.compare(rawToken.trim(), table.qrTokenHash);
    if (!isValidToken) {
      throw new OrderDomainError("TOKEN_INVALID");
    }

    const [categories, menuItems] = await Promise.all([
      db.menuCategory.findMany({
        where: {
          outletId: table.outletId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          updatedAt: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.menuItem.findMany({
        where: {
          outletId: table.outletId,
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          categoryId: true,
          name: true,
          description: true,
          price: true,
          imageUrl: true,
          imageAlt: true,
          sortOrder: true,
          isSoldOut: true,
          updatedAt: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    return {
      table: {
        id: table.id,
        code: table.code,
      },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        updatedAt: c.updatedAt.toISOString(),
      })),
      menuItems: menuItems.map((m) => ({
        id: m.id,
        categoryId: m.categoryId,
        name: m.name,
        description: m.description,
        price: m.price,
        imageUrl: m.imageUrl,
        imageAlt: m.imageAlt,
        sortOrder: m.sortOrder,
        isSoldOut: m.isSoldOut,
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
