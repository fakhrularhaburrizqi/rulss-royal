import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  MENU_ITEM_CURSOR_VERSION,
  decodeMenuItemCursor,
  encodeMenuItemCursor,
  validateMenuItemCursorBinding,
  type MenuItemCursorFilter,
  type MenuItemCursorPayload,
} from "@/lib/menu-item-cursor";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";
import { menuItemListQuerySchema } from "@/lib/validators/menu-item-query";

export type ManagementMenuItemCategory = {
  id: string;
  name: string;
  isActive: boolean;
  deletedAt: string | null;
};

export type ManagementMenuItemListItem = {
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
  category: ManagementMenuItemCategory;
};

export type PaginatedMenuItemsResult = {
  readonly data: readonly ManagementMenuItemListItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

interface ListMenuItemsOptions {
  readonly outletId: string;
  readonly cursor: MenuItemCursorPayload | null;
  readonly limit: number;
  readonly filter: MenuItemCursorFilter;
  readonly search: string | undefined;
}

const MANAGEMENT_ITEM_LIST_SELECT = {
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
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
      deletedAt: true,
    },
  },
} as const;

type MenuItemListRow = Prisma.MenuItemGetPayload<{
  select: typeof MANAGEMENT_ITEM_LIST_SELECT;
}>;

function validateInput(input: unknown): ListMenuItemsOptions {
  const parsed = menuItemListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, limit, filter, search, cursor } = parsed.data;

  let cursorPayload: MenuItemCursorPayload | null = null;
  if (cursor !== undefined) {
    cursorPayload = decodeMenuItemCursor(cursor);
    if (cursorPayload === null) {
      throw new OrderDomainError("INVALID_INPUT");
    }
    const bindingValid = validateMenuItemCursorBinding(cursorPayload, {
      outletId,
      filter,
      search,
    });
    if (!bindingValid) {
      throw new OrderDomainError("INVALID_INPUT");
    }
  }

  return {
    outletId,
    limit,
    filter,
    search,
    cursor: cursorPayload,
  };
}

function buildWhereClause(
  tenantId: string,
  outletId: string,
  filter: MenuItemCursorFilter,
  search: string | undefined,
  cursor: MenuItemCursorPayload | null
): Prisma.MenuItemWhereInput {
  const where: Prisma.MenuItemWhereInput = {
    tenantId,
    outletId,
  };

  switch (filter) {
    case "active":
      where.isActive = true;
      where.deletedAt = null;
      break;
    case "inactive":
      where.isActive = false;
      where.deletedAt = null;
      break;
    case "archived":
      where.deletedAt = { not: null };
      break;
    case "all":
    default:
      break;
  }

  if (search !== undefined) {
    where.name = {
      contains: search.trim(),
      mode: "insensitive",
    };
  }

  if (cursor !== null) {
    where.OR = [
      { categoryId: { gt: cursor.categoryId } },
      {
        categoryId: cursor.categoryId,
        sortOrder: { gt: cursor.sortOrder },
      },
      {
        categoryId: cursor.categoryId,
        sortOrder: cursor.sortOrder,
        name: { gt: cursor.name },
      },
      {
        categoryId: cursor.categoryId,
        sortOrder: cursor.sortOrder,
        name: cursor.name,
        id: { gt: cursor.id },
      },
    ];
  }

  return where;
}

function mapRow(row: MenuItemListRow): ManagementMenuItemListItem {
  const category: MenuItemListRow["category"] | null | undefined = row.category;
  if (category === null || category === undefined) {
    throw new OrderDomainError("INTERNAL_ERROR");
  }
  return {
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
    category: {
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      deletedAt: category.deletedAt === null ? null : category.deletedAt.toISOString(),
    },
  };
}

export async function listMenuItemsPaginated(
  input: unknown
): Promise<PaginatedMenuItemsResult> {
  const options = validateInput(input);

  const context = await requireOrderContext(options.outletId, "menu.view");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  const { cursor, limit, filter, search } = options;

  try {
    const where = buildWhereClause(tenantId, authorizedOutletId, filter, search, cursor);

    const rows = await db.menuItem.findMany({
      where,
      select: MANAGEMENT_ITEM_LIST_SELECT,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = encodeMenuItemCursor({
        v: MENU_ITEM_CURSOR_VERSION,
        categoryId: lastItem.categoryId,
        sortOrder: lastItem.sortOrder,
        name: lastItem.name,
        id: lastItem.id,
        outletId: authorizedOutletId,
        filter,
        search,
      });
    }

    return {
      data: data.map((row) => mapRow(row)),
      nextCursor,
      hasMore,
    };
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw toOrderError(error);
  }
}
