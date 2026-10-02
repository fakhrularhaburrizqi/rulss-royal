import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, isCatalogNameUniqueViolation, toOrderError } from "@/lib/order/errors";
import {
  categoryArchiveSchema,
  categoryCreateSchema,
  categoryRestoreSchema,
  categoryUpdateSchema,
} from "@/lib/validators/menu.validator";

export type CategorySummary = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  updatedAt: string;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const CATEGORY_CREATED_ACTION = "menu.category.created";
const CATEGORY_UPDATED_ACTION = "menu.category.updated";
const CATEGORY_ARCHIVED_ACTION = "menu.category.archived";
const CATEGORY_RESTORED_ACTION = "menu.category.restored";
const CATEGORY_ENTITY = "MenuCategory";

const CATEGORY_SUMMARY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  isActive: true,
  deletedAt: true,
  updatedAt: true,
} as const;

async function assertCategoryNameAvailable(
  tx: Prisma.TransactionClient,
  tenantId: string,
  outletId: string,
  normalizedName: string,
  excludeCategoryId: string | null
): Promise<void> {
  const duplicate = await tx.menuCategory.findFirst({
    where: {
      tenantId,
      outletId,
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
      ...(excludeCategoryId === null ? {} : { id: { not: excludeCategoryId } }),
    },
    select: { id: true },
  });

  if (duplicate !== null) {
    throw new OrderDomainError("CATEGORY_NAME_CONFLICT");
  }
}

function rethrowCategoryError(error: unknown): never {
  if (error instanceof OrderDomainError) {
    throw error;
  }
  if (isCatalogNameUniqueViolation(error)) {
    throw new OrderDomainError("CATEGORY_NAME_CONFLICT");
  }
  throw toOrderError(error);
}

export async function createMenuCategory(input: unknown): Promise<CategorySummary> {
  const parsed = categoryCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const context = await requireOrderContext(parsed.data.outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const outletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      await assertCategoryNameAvailable(tx, tenantId, outletId, parsed.data.name, null);

      const created = await tx.menuCategory.create({
        data: {
          tenantId,
          outletId,
          name: parsed.data.name,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        },
      });

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId,
          userId: context.actor.userId,
          action: CATEGORY_CREATED_ACTION,
          entity: CATEGORY_ENTITY,
          entityId: created.id,
          before: Prisma.DbNull,
          after: {
            name: created.name,
            sortOrder: created.sortOrder,
            isActive: created.isActive,
            deletedAt: null,
            updatedAt: created.updatedAt.toISOString(),
          },
        },
      });

      return {
        id: created.id,
        name: created.name,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
        deletedAt: created.deletedAt === null ? null : created.deletedAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function updateMenuCategory(input: unknown): Promise<CategorySummary> {
  const parsed = categoryUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, categoryId, expectedUpdatedAt, name, sortOrder, isActive } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuCategory.findFirst({
        where: {
          id: categoryId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
          deletedAt: true,
          updatedAt: true,
        },
      });

      if (current === null) {
        throw new OrderDomainError("CATEGORY_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      if (name !== undefined) {
        await assertCategoryNameAvailable(tx, tenantId, authorizedOutletId, name, current.id);
      }

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updateData = {
        ...(name !== undefined ? { name } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        updatedAt: mutationTime,
      };

      const updated = await tx.menuCategory.updateMany({
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
        name: current.name,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        deletedAt: current.deletedAt === null ? null : current.deletedAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        name: name !== undefined ? name : current.name,
        sortOrder: sortOrder !== undefined ? sortOrder : current.sortOrder,
        isActive: isActive !== undefined ? isActive : current.isActive,
        deletedAt: beforeSnapshot.deletedAt,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: CATEGORY_UPDATED_ACTION,
          entity: CATEGORY_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        ...afterSnapshot,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function archiveMenuCategory(input: unknown): Promise<CategorySummary> {
  const parsed = categoryArchiveSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, categoryId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuCategory.findFirst({
        where: {
          id: categoryId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: CATEGORY_SUMMARY_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("CATEGORY_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      if (current.deletedAt !== null) {
        throw new OrderDomainError("CATALOG_STATE_CONFLICT");
      }

      const menuItemCount = await tx.menuItem.count({
        where: {
          tenantId,
          outletId: authorizedOutletId,
          categoryId: current.id,
          deletedAt: null,
        },
      });

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updated = await tx.menuCategory.updateMany({
        where: {
          id: current.id,
          tenantId,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: {
          deletedAt: mutationTime,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        name: current.name,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        deletedAt: null,
        updatedAt: current.updatedAt.toISOString(),
        menuItemCount,
      };

      const afterSnapshot = {
        name: current.name,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        deletedAt: mutationTime.toISOString(),
        updatedAt: mutationTime.toISOString(),
        menuItemCount,
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: CATEGORY_ARCHIVED_ACTION,
          entity: CATEGORY_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        name: afterSnapshot.name,
        sortOrder: afterSnapshot.sortOrder,
        isActive: afterSnapshot.isActive,
        deletedAt: afterSnapshot.deletedAt,
        updatedAt: afterSnapshot.updatedAt,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowCategoryError(error);
  }
}

export async function restoreMenuCategory(input: unknown): Promise<CategorySummary> {
  const parsed = categoryRestoreSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, categoryId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "menu.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.menuCategory.findFirst({
        where: {
          id: categoryId,
          tenantId,
          outletId: authorizedOutletId,
        },
        select: CATEGORY_SUMMARY_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("CATEGORY_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      if (current.deletedAt === null) {
        throw new OrderDomainError("CATALOG_STATE_CONFLICT");
      }

      await assertCategoryNameAvailable(tx, tenantId, authorizedOutletId, current.name, current.id);

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updated = await tx.menuCategory.updateMany({
        where: {
          id: current.id,
          tenantId,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: {
          deletedAt: null,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("CATALOG_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        name: current.name,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        deletedAt: current.deletedAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        name: current.name,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
        deletedAt: null,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: CATEGORY_RESTORED_ACTION,
          entity: CATEGORY_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        ...afterSnapshot,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowCategoryError(error);
  }
}
