import "server-only";

import { db } from "@/lib/db";
import { requireOrderContext } from "@/lib/order/context";
import { toOrderError } from "@/lib/order/errors";

export type DiningTableSummary = {
  id: string;
  code: string;
  capacity: number;
  isActive: boolean;
  updatedAt: string;
};

const MANAGEMENT_TABLE_SELECT = {
  id: true,
  code: true,
  capacity: true,
  isActive: true,
  updatedAt: true,
} as const;

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
