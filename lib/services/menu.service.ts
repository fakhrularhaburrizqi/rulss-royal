import "server-only";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { toOrderError } from "@/lib/order/errors";

export type ActiveMenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type OrderableMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  sortOrder: number;
};

const CATEGORY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
} as const;

const ITEM_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  price: true,
  sortOrder: true,
} as const;

export type ManagementCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  updatedAt: string;
};

export type ManagementMenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
  isActive: boolean;
  isSoldOut: boolean;
  deletedAt: string | null;
  updatedAt: string;
};

const MANAGEMENT_CATEGORY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  deletedAt: true,
  updatedAt: true,
} as const;

const MANAGEMENT_ITEM_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  price: true,
  imageUrl: true,
  imageAlt: true,
  sortOrder: true,
  isActive: true,
  isSoldOut: true,
  deletedAt: true,
  updatedAt: true,
} as const;

export async function listActiveCategories(outletId: string): Promise<ActiveMenuCategory[]> {
  const context = await requireOrderContext(outletId, "menu.view");

  try {
    return await db.menuCategory.findMany({
      where: {
        tenantId: context.actor.tenantId,
        outletId: context.outletId,
        isActive: true,
        deletedAt: null,
      },
      select: CATEGORY_SELECT,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    throw toOrderError(error);
  }
}

export async function listOrderableMenuItems(outletId: string): Promise<OrderableMenuItem[]> {
  const context = await requireOrderContext(outletId, "menu.view");

  try {
    return await db.menuItem.findMany({
      where: {
        tenantId: context.actor.tenantId,
        outletId: context.outletId,
        isActive: true,
        deletedAt: null,
        isSoldOut: false,
        category: {
          isActive: true,
          deletedAt: null,
        },
      },
      select: ITEM_SELECT,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
  } catch (error) {
    throw toOrderError(error);
  }
}

export async function listMenuCategoriesForManagement(
  outletId: string
): Promise<ManagementCategory[]> {
  const context = await requireOrderContext(outletId, "menu.view");

  try {
    const rows = await db.menuCategory.findMany({
      where: {
        tenantId: context.actor.tenantId,
        outletId: context.outletId,
      },
      select: MANAGEMENT_CATEGORY_SELECT,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    throw toOrderError(error);
  }
}

export async function listMenuItemsForManagement(outletId: string): Promise<ManagementMenuItem[]> {
  const context = await requireOrderContext(outletId, "menu.view");

  try {
    const rows = await db.menuItem.findMany({
      where: {
        tenantId: context.actor.tenantId,
        outletId: context.outletId,
      },
      select: MANAGEMENT_ITEM_SELECT,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description,
      price: row.price,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      isSoldOut: row.isSoldOut,
      deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    throw toOrderError(error);
  }
}
