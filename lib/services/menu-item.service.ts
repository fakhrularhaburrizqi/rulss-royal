import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, isCatalogNameUniqueViolation, toOrderError } from "@/lib/order/errors";
import {
  menuItemArchiveSchema,
  menuItemCreateSchema,
  menuItemRestoreSchema,
  menuItemSoldOutSchema,
  menuItemUpdateSchema,
} from "@/lib/validators/menu.validator";

export type MenuItemSummary = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  isActive: boolean;
  isSoldOut: boolean;
  deletedAt: string | null;
  updatedAt: string;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const MENU_ITEM_CREATED_ACTION = "menu.menuitem.created";
const MENU_ITEM_UPDATED_ACTION = "menu.menuitem.updated";
const MENU_ITEM_ARCHIVED_ACTION = "menu.menuitem.archived";
const MENU_ITEM_RESTORED_ACTION = "menu.menuitem.restored";
const MENU_ITEM_SOLD_OUT_ACTION = "menu.menuitem.soldout.changed";
const MENU_ITEM_ENTITY = "MenuItem";

const CATEGORY_AVAILABILITY_SELECT = {
  id: true,
  isActive: true,
  deletedAt: true,
} as const;

const MENU_ITEM_CURRENT_SELECT = {
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

async function assertCategoryAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  outletId: string,
  categoryId: string
): Promise<void> {
  const category = await tx.menuCategory.findFirst({
    where: {
      id: categoryId,
      tenantId,
      outletId,
    },
    select: CATEGORY_AVAILABILITY_SELECT,
  });

  if (category === null) {
    throw new OrderDomainError("CATEGORY_NOT_FOUND");
  }

  if (!category.isActive || category.deletedAt !== null) {
    throw new OrderDomainError("CATEGORY_NOT_AVAILABLE");
  }
}

async function assertMenuItemNameAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  outletId: string,
  normalizedName: string,
  excludeMenuItemId: string | null
): Promise<void> {
  const duplicate = await tx.menuItem.findFirst({
    where: {
      tenantId,
      outletId,
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
      ...(excludeMenuItemId === null ? {} : { id: { not: excludeMenuItemId } }),
    },
    select: { id: true },
  });

  if (duplicate !== null) {
    throw new OrderDomainError("MENU_NAME_CONFLICT");
  }
}

function rethrowMenuItemError(error: unknown): never {
  if (error instanceof OrderDomainError) {
    throw error;
  }
  if (isCatalogNameUniqueViolation(error)) {
    throw new OrderDomainError("MENU_NAME_CONFLICT");
  }
  throw toOrderError(error);
}

type MenuItemRow = {
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
  deletedAt: Date | null;
  updatedAt: Date;
};

function toMenuItemSummary(row: MenuItemRow): MenuItemSummary {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    price: row.price,
    isActive: row.isActive,
    isSoldOut: row.isSoldOut,
    deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildMenuItemSnapshot(row: MenuItemRow) {
  return {
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
  };
}

function assertMenuItemVersion(current: MenuItemRow, expectedUpdatedAt: string): void {
  if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
  }
}

function menuItemGuardWhere(
  current: MenuItemRow,
  tenantId: string,
  outletId: string
): { id: string; tenantId: string; outletId: string; updatedAt: Date } {
  return {
    id: current.id,
    tenantId,
    outletId,
    updatedAt: current.updatedAt,
  };
}

function mutationTimeFor(current: MenuItemRow): Date {
  return new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
}

export async function createMenuItem(input: unknown): Promise<MenuItemSummary> {
  const parsed = menuItemCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const context = await requireOrderContext(parsed.data.outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const outletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      await assertCategoryAvailable(tx, tenantId, outletId, parsed.data.categoryId);

      await assertMenuItemNameAvailable(tx, tenantId, outletId, parsed.data.name, null);

      const created = await tx.menuItem.create({
        data: {
          tenantId,
          outletId,
          categoryId: parsed.data.categoryId,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          price: parsed.data.price,
          imageUrl: parsed.data.imageUrl ?? null,
          imageAlt: parsed.data.imageAlt ?? null,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
          isSoldOut: parsed.data.isSoldOut ?? false,
        },
      });

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId,
          userId: context.actor.userId,
          action: MENU_ITEM_CREATED_ACTION,
          entity: MENU_ITEM_ENTITY,
          entityId: created.id,
          before: Prisma.DbNull,
          after: {
            categoryId: created.categoryId,
            name: created.name,
            description: created.description,
            price: created.price,
            imageUrl: created.imageUrl,
            imageAlt: created.imageAlt,
            sortOrder: created.sortOrder,
            isActive: created.isActive,
            isSoldOut: created.isSoldOut,
            deletedAt: null,
            updatedAt: created.updatedAt.toISOString(),
          },
        },
      });

      return {
        id: created.id,
        categoryId: created.categoryId,
        name: created.name,
        price: created.price,
        isActive: created.isActive,
        isSoldOut: created.isSoldOut,
        deletedAt: created.deletedAt === null ? null : created.deletedAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowMenuItemError(error);
  }
}

export async function updateMenuItem(input: unknown): Promise<MenuItemSummary> {
  const parsed = menuItemUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const {
    outletId,
    menuItemId,
    expectedUpdatedAt,
    categoryId,
    name,
    price,
    description,
    imageUrl,
    imageAlt,
    sortOrder,
    isActive,
    isSoldOut,
  } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: {
          id: menuItemId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: MENU_ITEM_CURRENT_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("MENU_ITEM_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      if (categoryId !== undefined && categoryId !== current.categoryId) {
        await assertCategoryAvailable(tx, tenantId, authorizedOutletId, categoryId);
      }

      if (name !== undefined) {
        await assertMenuItemNameAvailable(tx, tenantId, authorizedOutletId, name, current.id);
      }

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updateData = {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(price !== undefined ? { price } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        ...(imageAlt !== undefined ? { imageAlt } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(isSoldOut !== undefined ? { isSoldOut } : {}),
        updatedAt: mutationTime,
      };

      const updated = await tx.menuItem.updateMany({
        where: {
          id: current.id,
          tenantId,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        categoryId: current.categoryId,
        name: current.name,
        description: current.description,
        price: current.price,
        imageUrl: current.imageUrl,
        imageAlt: current.imageAlt,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        isSoldOut: current.isSoldOut,
        deletedAt: current.deletedAt === null ? null : current.deletedAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        categoryId: categoryId !== undefined ? categoryId : current.categoryId,
        name: name !== undefined ? name : current.name,
        description: description !== undefined ? description : current.description,
        price: price !== undefined ? price : current.price,
        imageUrl: imageUrl !== undefined ? imageUrl : current.imageUrl,
        imageAlt: imageAlt !== undefined ? imageAlt : current.imageAlt,
        sortOrder: sortOrder !== undefined ? sortOrder : current.sortOrder,
        isActive: isActive !== undefined ? isActive : current.isActive,
        isSoldOut: isSoldOut !== undefined ? isSoldOut : current.isSoldOut,
        deletedAt: beforeSnapshot.deletedAt,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: MENU_ITEM_UPDATED_ACTION,
          entity: MENU_ITEM_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        categoryId: afterSnapshot.categoryId,
        name: afterSnapshot.name,
        price: afterSnapshot.price,
        isActive: afterSnapshot.isActive,
        isSoldOut: afterSnapshot.isSoldOut,
        deletedAt: afterSnapshot.deletedAt,
        updatedAt: afterSnapshot.updatedAt,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowMenuItemError(error);
  }
}

export async function archiveMenuItem(input: unknown): Promise<MenuItemSummary> {
  const parsed = menuItemArchiveSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, menuItemId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: {
          id: menuItemId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: MENU_ITEM_CURRENT_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("MENU_ITEM_NOT_FOUND");
      }

      assertMenuItemVersion(current, expectedUpdatedAt);

      if (current.deletedAt !== null) {
        throw new OrderDomainError("CATALOG_STATE_CONFLICT");
      }

      const mutationTime = mutationTimeFor(current);

      const updated = await tx.menuItem.updateMany({
        where: menuItemGuardWhere(current, tenantId, authorizedOutletId),
        data: {
          deletedAt: mutationTime,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = buildMenuItemSnapshot(current);
      const afterSnapshot = {
        ...beforeSnapshot,
        deletedAt: mutationTime.toISOString(),
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: MENU_ITEM_ARCHIVED_ACTION,
          entity: MENU_ITEM_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return toMenuItemSummary({ ...current, deletedAt: mutationTime, updatedAt: mutationTime });
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowMenuItemError(error);
  }
}

export async function restoreMenuItem(input: unknown): Promise<MenuItemSummary> {
  const parsed = menuItemRestoreSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, menuItemId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: {
          id: menuItemId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: MENU_ITEM_CURRENT_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("MENU_ITEM_NOT_FOUND");
      }

      assertMenuItemVersion(current, expectedUpdatedAt);

      if (current.deletedAt === null) {
        throw new OrderDomainError("CATALOG_STATE_CONFLICT");
      }

      await assertMenuItemNameAvailable(tx, tenantId, authorizedOutletId, current.name, current.id);

      const mutationTime = mutationTimeFor(current);

      const updated = await tx.menuItem.updateMany({
        where: menuItemGuardWhere(current, tenantId, authorizedOutletId),
        data: {
          deletedAt: null,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = buildMenuItemSnapshot(current);
      const afterSnapshot = {
        ...beforeSnapshot,
        deletedAt: null,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: MENU_ITEM_RESTORED_ACTION,
          entity: MENU_ITEM_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return toMenuItemSummary({ ...current, deletedAt: null, updatedAt: mutationTime });
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowMenuItemError(error);
  }
}

export async function setMenuItemSoldOut(input: unknown): Promise<MenuItemSummary> {
  const parsed = menuItemSoldOutSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, menuItemId, expectedUpdatedAt, isSoldOut } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuItem.findFirst({
        where: {
          id: menuItemId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: MENU_ITEM_CURRENT_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("MENU_ITEM_NOT_FOUND");
      }

      assertMenuItemVersion(current, expectedUpdatedAt);

      if (current.isSoldOut === isSoldOut) {
        return toMenuItemSummary(current);
      }

      const mutationTime = mutationTimeFor(current);

      const updated = await tx.menuItem.updateMany({
        where: menuItemGuardWhere(current, tenantId, authorizedOutletId),
        data: {
          isSoldOut,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = buildMenuItemSnapshot(current);
      const afterSnapshot = {
        ...beforeSnapshot,
        isSoldOut,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: MENU_ITEM_SOLD_OUT_ACTION,
          entity: MENU_ITEM_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return toMenuItemSummary({ ...current, isSoldOut, updatedAt: mutationTime });
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowMenuItemError(error);
  }
}
