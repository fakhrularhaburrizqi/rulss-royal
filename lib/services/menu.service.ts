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
