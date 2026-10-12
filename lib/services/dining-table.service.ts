import "server-only";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { OrderDomainError, isTableCodeUniqueViolation, toOrderError } from "@/lib/order/errors";
import {
  generateTableTokenSchema,
  tableCreateSchema,
  tableDeactivateSchema,
  tableReactivateSchema,
  tableUpdateSchema,
} from "@/lib/validators/table.validator";

export type DiningTableSummary = {
  id: string;
  code: string;
  capacity: number;
  isActive: boolean;
  updatedAt: string;
};

const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 15000 } as const;

const TABLE_CREATED_ACTION = "table.created";
const TABLE_UPDATED_ACTION = "table.updated";
const TABLE_DEACTIVATED_ACTION = "table.deactivated";
const TABLE_REACTIVATED_ACTION = "table.reactivated";
const TABLE_TOKEN_GENERATED_ACTION = "table.token_generated";
const TABLE_ENTITY = "DiningTable";

const DEFAULT_TABLE_CAPACITY = 4;

const MANAGEMENT_TABLE_SELECT = {
  id: true,
  code: true,
  capacity: true,
  isActive: true,
  updatedAt: true,
} as const;

async function assertTableCodeAvailable(
  tx: Prisma.TransactionClient,
  outletId: string,
  code: string,
  excludeTableId: string | null
): Promise<void> {
  const duplicate = await tx.diningTable.findFirst({
    where: {
      outletId,
      code: {
        equals: code,
        mode: "insensitive",
      },
      ...(excludeTableId === null ? {} : { id: { not: excludeTableId } }),
    },
    select: { id: true },
  });

  if (duplicate !== null) {
    throw new OrderDomainError("TABLE_CODE_CONFLICT");
  }
}

function rethrowTableError(error: unknown): never {
  if (error instanceof OrderDomainError) {
    throw error;
  }
  if (isTableCodeUniqueViolation(error)) {
    throw new OrderDomainError("TABLE_CODE_CONFLICT");
  }
  throw toOrderError(error);
}

export async function listTablesForManagement(outletId: string): Promise<DiningTableSummary[]> {
  const context = await requireOrderContext(outletId, "tables.view");

  try {
    const rows = await db.diningTable.findMany({
      where: {
        outletId: context.outletId,
      },
      select: MANAGEMENT_TABLE_SELECT,
      orderBy: [{ code: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      capacity: row.capacity,
      isActive: row.isActive,
      updatedAt: row.updatedAt.toISOString(),
    }));
  } catch (error) {
    throw toOrderError(error);
  }
}

export async function createDiningTable(input: unknown): Promise<DiningTableSummary> {
  const parsed = tableCreateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const context = await requireOrderContext(parsed.data.outletId, "tables.manage");
  const tenantId = context.actor.tenantId;
  const outletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      await assertTableCodeAvailable(tx, outletId, parsed.data.code, null);

      const created = await tx.diningTable.create({
        data: {
          outletId,
          code: parsed.data.code,
          capacity: parsed.data.capacity ?? DEFAULT_TABLE_CAPACITY,
          isActive: parsed.data.isActive ?? true,
        },
      });

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId,
          userId: context.actor.userId,
          action: TABLE_CREATED_ACTION,
          entity: TABLE_ENTITY,
          entityId: created.id,
          before: Prisma.DbNull,
          after: {
            code: created.code,
            capacity: created.capacity,
            isActive: created.isActive,
            updatedAt: created.updatedAt.toISOString(),
          },
        },
      });

      return {
        id: created.id,
        code: created.code,
        capacity: created.capacity,
        isActive: created.isActive,
        updatedAt: created.updatedAt.toISOString(),
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowTableError(error);
  }
}

export async function updateDiningTable(input: unknown): Promise<DiningTableSummary> {
  const parsed = tableUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, tableId, expectedUpdatedAt, code, capacity } = parsed.data;

  const context = await requireOrderContext(outletId, "tables.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.diningTable.findFirst({
        where: {
          id: tableId,
          outletId: authorizedOutletId,
        },
        select: MANAGEMENT_TABLE_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("TABLE_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      if (code !== undefined) {
        await assertTableCodeAvailable(tx, authorizedOutletId, code, current.id);
      }

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updateData = {
        ...(code !== undefined ? { code } : {}),
        ...(capacity !== undefined ? { capacity } : {}),
        updatedAt: mutationTime,
      };

      const updated = await tx.diningTable.updateMany({
        where: {
          id: current.id,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: current.isActive,
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        code: code !== undefined ? code : current.code,
        capacity: capacity !== undefined ? capacity : current.capacity,
        isActive: current.isActive,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: TABLE_UPDATED_ACTION,
          entity: TABLE_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        code: afterSnapshot.code,
        capacity: afterSnapshot.capacity,
        isActive: afterSnapshot.isActive,
        updatedAt: afterSnapshot.updatedAt,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowTableError(error);
  }
}

export async function deactivateDiningTable(input: unknown): Promise<DiningTableSummary> {
  const parsed = tableDeactivateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, tableId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "tables.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.diningTable.findFirst({
        where: {
          id: tableId,
          outletId: authorizedOutletId,
        },
        select: MANAGEMENT_TABLE_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("TABLE_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      if (current.isActive === false) {
        throw new OrderDomainError("TABLE_STATE_CONFLICT");
      }

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updated = await tx.diningTable.updateMany({
        where: {
          id: current.id,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: {
          isActive: false,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: current.isActive,
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: false,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: TABLE_DEACTIVATED_ACTION,
          entity: TABLE_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        code: afterSnapshot.code,
        capacity: afterSnapshot.capacity,
        isActive: afterSnapshot.isActive,
        updatedAt: afterSnapshot.updatedAt,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowTableError(error);
  }
}

export async function reactivateDiningTable(input: unknown): Promise<DiningTableSummary> {
  const parsed = tableReactivateSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, tableId, expectedUpdatedAt } = parsed.data;

  const context = await requireOrderContext(outletId, "tables.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.diningTable.findFirst({
        where: {
          id: tableId,
          outletId: authorizedOutletId,
        },
        select: MANAGEMENT_TABLE_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("TABLE_NOT_FOUND");
      }

      if (current.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      if (current.isActive === true) {
        throw new OrderDomainError("TABLE_STATE_CONFLICT");
      }

      await assertTableCodeAvailable(tx, authorizedOutletId, current.code, current.id);

      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updated = await tx.diningTable.updateMany({
        where: {
          id: current.id,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: {
          isActive: true,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: current.isActive,
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: true,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: TABLE_REACTIVATED_ACTION,
          entity: TABLE_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return {
        id: current.id,
        code: afterSnapshot.code,
        capacity: afterSnapshot.capacity,
        isActive: afterSnapshot.isActive,
        updatedAt: afterSnapshot.updatedAt,
      };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowTableError(error);
  }
}

export async function generateQrToken(input: unknown): Promise<string> {
  const parsed = generateTableTokenSchema.safeParse(input);
  if (!parsed.success) {
    throw new OrderDomainError("INVALID_INPUT");
  }

  const { outletId, tableId } = parsed.data;

  const context = await requireOrderContext(outletId, "tables.manage");
  const tenantId = context.actor.tenantId;
  const authorizedOutletId = context.outletId;

  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.diningTable.findFirst({
        where: {
          id: tableId,
          outletId: authorizedOutletId,
        },
        select: MANAGEMENT_TABLE_SELECT,
      });

      if (current === null) {
        throw new OrderDomainError("TABLE_NOT_FOUND");
      }

      const rawToken = crypto.randomBytes(16).toString("hex");
      const tokenHash = await bcrypt.hash(rawToken, 12);
      const mutationTime = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));

      const updated = await tx.diningTable.updateMany({
        where: {
          id: current.id,
          outletId: authorizedOutletId,
          updatedAt: current.updatedAt,
        },
        data: {
          qrTokenHash: tokenHash,
          updatedAt: mutationTime,
        },
      });

      if (updated.count !== 1) {
        throw new OrderDomainError("TABLE_VERSION_CONFLICT");
      }

      const beforeSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: current.isActive,
        updatedAt: current.updatedAt.toISOString(),
      };

      const afterSnapshot = {
        code: current.code,
        capacity: current.capacity,
        isActive: current.isActive,
        updatedAt: mutationTime.toISOString(),
      };

      await tx.activityLog.create({
        data: {
          tenantId,
          outletId: authorizedOutletId,
          userId: context.actor.userId,
          action: TABLE_TOKEN_GENERATED_ACTION,
          entity: TABLE_ENTITY,
          entityId: current.id,
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return rawToken;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    rethrowTableError(error);
  }
}
