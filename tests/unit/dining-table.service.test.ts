import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  listTablesForManagement,
  type DiningTableSummary,
} from "@/lib/services/dining-table.service";

vi.mock("@/lib/order/context", () => ({
  requireOrderContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    diningTable: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    customerOrder: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

type FindManyArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
  orderBy: Array<Record<string, string>>;
};

const mockedRequireOrderContext = vi.mocked(requireOrderContext);
const mockedFindMany = db.diningTable.findMany as unknown as Mock;
const mockedTransaction = db.$transaction as unknown as Mock;

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const UPDATED_AT_ISO = "2026-10-01T10:00:00.000Z";
const INACTIVE_UPDATED_AT_ISO = "2026-09-15T12:00:00.000Z";

function activeRow(): Record<string, unknown> {
  return {
    id: "table-1",
    code: "T01",
    capacity: 4,
    isActive: true,
    updatedAt: new Date(UPDATED_AT_ISO),
  };
}

function inactiveRow(): Record<string, unknown> {
  return {
    id: "table-2",
    code: "T02",
    capacity: 2,
    isActive: false,
    updatedAt: new Date(INACTIVE_UPDATED_AT_ISO),
  };
}

function firstFindManyArgs(mock: Mock): FindManyArgs {
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0]?.[0] as FindManyArgs;
}

async function captureError(promise: Promise<unknown>): Promise<OrderDomainError | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error as OrderDomainError;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedFindMany.mockResolvedValue([]);
});

describe("listTablesForManagement - authorization and isolation", () => {
  it("calls requireOrderContext with the raw input outletId and tables.view", async () => {
    await listTablesForManagement("  outlet-raw  ");

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("  outlet-raw  ", "tables.view");
  });

  it("finishes the context before running any query", async () => {
    const callOrder: string[] = [];
    mockedRequireOrderContext.mockImplementation(async (outletId: string) => {
      callOrder.push(`context:${outletId}`);
      return contextResult;
    });
    mockedFindMany.mockImplementation(async () => {
      callOrder.push("query");
      return [];
    });

    await listTablesForManagement("  outlet-raw  ");

    expect(callOrder).toEqual(["context:  outlet-raw  ", "query"]);
  });

  it("queries with the normalized context outletId and never with the raw input", async () => {
    await listTablesForManagement("  outlet-raw  ");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.where.outletId).toBe(contextResult.outletId);
    expect(args.where.outletId).toBe("outlet-ctx");
    expect(args.where.outletId).not.toBe("outlet-raw");
    expect(args.where.outletId).not.toBe("  outlet-raw  ");
  });

  it("queries with exactly the authorized outletId filter", async () => {
    await listTablesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.where).toEqual({ outletId: "outlet-ctx" });
    expect(Object.keys(args.where)).toEqual(["outletId"]);
  });

  it("never filters by tenantId, isActive, deletedAt or any invented field", async () => {
    await listTablesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.where).not.toHaveProperty("tenantId");
    expect(args.where).not.toHaveProperty("userId");
    expect(args.where).not.toHaveProperty("isActive");
    expect(args.where).not.toHaveProperty("deletedAt");
    expect(args.where).not.toHaveProperty("id");
    expect(args.where).not.toHaveProperty("code");
    expect(args.where).not.toHaveProperty("qrTokenHash");
  });

  it("accepts only outletId; caller-supplied actor, tenant, user or permission are ignored", async () => {
    expect(listTablesForManagement).toHaveLength(1);

    const callWithExtraArgs = listTablesForManagement as unknown as (
      outletId: string,
      extra?: unknown
    ) => Promise<DiningTableSummary[]>;

    await callWithExtraArgs("outlet-raw", {
      actor: { userId: "evil-user", tenantId: "evil-tenant" },
      tenantId: "evil-tenant",
      userId: "evil-user",
      permission: "tables.manage",
      outletId: "evil-outlet",
    });

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "tables.view");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.where).toEqual({ outletId: "outlet-ctx" });
    expect(args.where).not.toHaveProperty("tenantId");
    expect(args.where).not.toHaveProperty("userId");
  });
});

describe("listTablesForManagement - query shape", () => {
  it("selects exactly the five DTO fields", async () => {
    await listTablesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.select).toEqual({
      id: true,
      code: true,
      capacity: true,
      isActive: true,
      updatedAt: true,
    });
    expect(Object.keys(args.select)).toHaveLength(5);
  });

  it("never selects qrTokenHash, outletId, createdAt, orders or other internal fields", async () => {
    await listTablesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.select).not.toHaveProperty("qrTokenHash");
    expect(args.select).not.toHaveProperty("outletId");
    expect(args.select).not.toHaveProperty("createdAt");
    expect(args.select).not.toHaveProperty("orders");
    expect(args.select).not.toHaveProperty("tenantId");
    expect(args.select).not.toHaveProperty("deletedAt");
    expect(args).not.toHaveProperty("include");
    expect(args).not.toHaveProperty("cursor");
    expect(args).not.toHaveProperty("skip");
    expect(args).not.toHaveProperty("take");
  });

  it("orders by code ascending and then id ascending", async () => {
    await listTablesForManagement("outlet-1");

    const args = firstFindManyArgs(mockedFindMany);
    expect(args.orderBy).toEqual([{ code: "asc" }, { id: "asc" }]);
    expect(Object.keys(args)).toEqual(["where", "select", "orderBy"]);
  });

  it("never filters isActive so active and inactive rows stay visible", async () => {
    mockedFindMany.mockResolvedValue([activeRow(), inactiveRow()]);

    const result = await listTablesForManagement("outlet-1");

    expect(firstFindManyArgs(mockedFindMany).where).not.toHaveProperty("isActive");
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.isActive)).toEqual([true, false]);
  });
});

describe("listTablesForManagement - output", () => {
  it("forwards an active row with an ISO updatedAt", async () => {
    mockedFindMany.mockResolvedValue([activeRow()]);

    const result = await listTablesForManagement("outlet-1");

    expect(result).toEqual([
      {
        id: "table-1",
        code: "T01",
        capacity: 4,
        isActive: true,
        updatedAt: UPDATED_AT_ISO,
      },
    ]);
    expect(result[0]?.updatedAt).toBe(UPDATED_AT_ISO);
  });

  it("forwards an inactive row unchanged", async () => {
    mockedFindMany.mockResolvedValue([inactiveRow()]);

    const result = await listTablesForManagement("outlet-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "table-2",
      code: "T02",
      capacity: 2,
      isActive: false,
      updatedAt: INACTIVE_UPDATED_AT_ISO,
    });
    expect(result[0]?.isActive).toBe(false);
  });

  it("maps the updatedAt Date to an ISO string", async () => {
    mockedFindMany.mockResolvedValue([activeRow()]);

    const result = await listTablesForManagement("outlet-1");

    expect(typeof result[0]?.updatedAt).toBe("string");
    expect(result[0]?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result[0]?.updatedAt).toBe((activeRow().updatedAt as Date).toISOString());
  });

  it("returns no Date object in the DTO", async () => {
    mockedFindMany.mockResolvedValue([activeRow(), inactiveRow()]);

    const result = await listTablesForManagement("outlet-1");

    for (const row of result) {
      for (const value of Object.values(row)) {
        expect(value).not.toBeInstanceOf(Date);
      }
    }
  });

  it("returns no internal field in the DTO", async () => {
    mockedFindMany.mockResolvedValue([activeRow()]);

    const dto = (await listTablesForManagement("outlet-1"))[0];

    expect(dto).toBeDefined();
    expect(dto).not.toHaveProperty("outletId");
    expect(dto).not.toHaveProperty("tenantId");
    expect(dto).not.toHaveProperty("createdAt");
    expect(dto).not.toHaveProperty("qrTokenHash");
    expect(dto).not.toHaveProperty("deletedAt");
    expect(dto).not.toHaveProperty("orders");
    expect(Object.keys(dto ?? {}).sort()).toEqual([
      "capacity",
      "code",
      "id",
      "isActive",
      "updatedAt",
    ]);
  });

  it("returns an empty array for an empty result instead of an error", async () => {
    mockedFindMany.mockResolvedValue([]);

    const result = await listTablesForManagement("outlet-1");

    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it("serializes the result with JSON.stringify without a Date object", async () => {
    mockedFindMany.mockResolvedValue([activeRow(), inactiveRow()]);

    const result = await listTablesForManagement("outlet-1");
    const json = JSON.stringify(result);

    expect(JSON.parse(json)).toEqual(result);
    expect(json).toContain(`"updatedAt":"${UPDATED_AT_ISO}"`);
    expect(json).toContain('"isActive":false');
    expect(json).not.toContain("qrTokenHash");
    expect(json).not.toContain("outletId");
    expect(json).not.toContain("tenantId");
  });
});

describe("listTablesForManagement - error handling", () => {
  it("keeps the domain error from requireOrderContext and never queries the database", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(listTablesForManagement("outlet-1"));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(error?.message).toBe(getOrderErrorMessage("OUTLET_ACCESS_DENIED"));
    expect(mockedFindMany).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("maps a query failure to INTERNAL_ERROR without leaking database details", async () => {
    mockedFindMany.mockRejectedValue(new Error("password authentication failed"));

    const error = await captureError(listTablesForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("authentication");
    expect(error?.message).not.toContain("prisma");
    expect(error?.message).not.toContain("query");
  });

  it("maps an invalid updatedAt Date to INTERNAL_ERROR without leaking the mapping error", async () => {
    mockedFindMany.mockResolvedValue([{ ...activeRow(), updatedAt: new Date("not-a-date") }]);

    const error = await captureError(listTablesForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("toISOString");
    expect(error?.message).not.toContain("RangeError");
    expect(error?.message).not.toContain("Invalid time value");
  });

  it("maps a non-Date updatedAt to INTERNAL_ERROR without leaking the mapping error", async () => {
    mockedFindMany.mockResolvedValue([{ ...activeRow(), updatedAt: "2026-10-01T10:00:00.000Z" }]);

    const error = await captureError(listTablesForManagement("outlet-1"));

    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("toISOString");
    expect(error?.message).not.toContain("TypeError");
  });

  it("does not fall back to a query without the outlet filter", async () => {
    mockedFindMany.mockRejectedValue(new Error("boom"));

    const error = await captureError(listTablesForManagement("outlet-1"));

    expect(error?.code).toBe("INTERNAL_ERROR");
    expect(mockedFindMany).toHaveBeenCalledTimes(1);
    expect(firstFindManyArgs(mockedFindMany).where).toEqual({ outletId: "outlet-ctx" });
  });
});

describe("listTablesForManagement - read-only surface", () => {
  it("never creates, updates, deletes, upserts or opens a transaction", async () => {
    mockedFindMany.mockResolvedValue([activeRow()]);

    await listTablesForManagement("outlet-1");

    expect(db.diningTable.create).not.toHaveBeenCalled();
    expect(db.diningTable.createMany).not.toHaveBeenCalled();
    expect(db.diningTable.update).not.toHaveBeenCalled();
    expect(db.diningTable.updateMany).not.toHaveBeenCalled();
    expect(db.diningTable.upsert).not.toHaveBeenCalled();
    expect(db.diningTable.delete).not.toHaveBeenCalled();
    expect(db.diningTable.deleteMany).not.toHaveBeenCalled();
    expect(db.customerOrder.findMany).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
  });

  it("is a server-only read module without mutation, relation or token usage", async () => {
    const modulePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../lib/services/dining-table.service.ts"
    );
    const source = readFileSync(modulePath, "utf8");

    expect(source.split(/\r?\n/, 1)[0].replace(/;/, "")).toBe('import "server-only"');
    expect(source).not.toMatch(
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/
    );
    expect(source).not.toContain("$transaction");
    expect(source).not.toContain("qrTokenHash");
    expect(source).not.toContain("customerOrder");
    expect(source).not.toContain("activityLog");
    expect(source).not.toContain("include:");
    expect(source).not.toMatch(/\bdeletedAt\b|\btenantId\b/);
  });
});
