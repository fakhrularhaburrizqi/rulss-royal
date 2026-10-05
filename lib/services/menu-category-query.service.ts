import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, toOrderError } from "@/lib/order/errors";
import { catalogListQuerySchema } from "@/lib/validators/category-query";

export type ManagementCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  updatedAt: string;
};

export type PaginatedCategoriesResult = {
  readonly data: readonly ManagementCategory[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

interface ListCategoriesOptions {
  readonly outletId: string;
  readonly cursor: { v: 1; sortOrder: number; name: string; id: string; outletId: string; filter: string; search: string | undefined } | null;
  readonly limit: number;
  readonly filter: "all" | "active" | "inactive" | "archived";
  readonly search: string | undefined;
}

function normalizeOutletId(outletId: string): string {
  if (typeof outletId !== "string") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  const normalized = outletId.trim();
  if (normalized === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  return normalized;
}

function validateInput(input: unknown): ListCategoriesOptions {
  const parsed = catalogListQuerySchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }
  const { outlet, limit, filter, search, cursor } = parsed.data;
  let cursorPayload: ListCategoriesOptions["cursor"] = null;
  if (cursor !== undefined && cursor !== null) {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    cursorPayload = decoded as ListCategoriesOptions["cursor"];
  }
  return {
    outletId: outlet,
    limit,
    filter,
    search,
    cursor: cursorPayload,
  };
}

function buildWhereClause(
  tenantId: string,
  outletId: string,
  filter: "all" | "active" | "inactive" | "archived",
  search: string | undefined,
  cursor: { v: 1; sortOrder: number; name: string; id: string; outletId: string; filter: string; search: string | undefined } | null
): Prisma.MenuCategoryWhereInput {
  const where: Prisma.MenuCategoryWhereInput = {
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
      { sortOrder: { gt: cursor.sortOrder } },
      {
        sortOrder: cursor.sortOrder,
        name: { gt: cursor.name },
      },
      {
        sortOrder: cursor.sortOrder,
        name: cursor.name,
        id: { gt: cursor.id },
      },
    ];
  }

  return where;
}

export async function listMenuCategoriesPaginated(
  input: unknown
): Promise<PaginatedCategoriesResult> {
  const options = validateInput(input);
  const normalizedOutletId = normalizeOutletId(options.outletId);

  const context = await requireOrderContext(normalizedOutletId, "menu.view");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  const { cursor, limit, filter, search } = options;

  try {
    const where = buildWhereClause(tenantId, authorizedOutletId, filter, search, cursor);

    const categories = await db.menuCategory.findMany({
      where,
      select: { id: true, name: true, sortOrder: true, isActive: true, deletedAt: true, updatedAt: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      take: limit + 1,
    });

    const hasMore = categories.length > limit;
    const data = hasMore ? categories.slice(0, limit) : categories;

    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = Buffer.from(JSON.stringify({
        v: 1,
        sortOrder: lastItem.sortOrder,
        name: lastItem.name,
        id: lastItem.id,
        outletId: authorizedOutletId,
        filter,
        search: search ?? undefined,
      })).toString("base64url");
    }

    return {
      data: data.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        deletedAt: row.deletedAt === null ? null : row.deletedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
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