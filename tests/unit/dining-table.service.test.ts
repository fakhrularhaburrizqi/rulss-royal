import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { db } from "@/lib/db";
import { requireOrderContext, type OrderContext } from "@/lib/order/context";
import { OrderDomainError, getOrderErrorMessage } from "@/lib/order/errors";
import {
  createDiningTable,
  deactivateDiningTable,
  generateQrToken,
  listTablesForManagement,
  reactivateDiningTable,
  updateDiningTable,
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

const tx = {
  diningTable: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
};

const contextResult: OrderContext = {
  actor: { userId: "user-1", tenantId: "tenant-ctx" },
  outletId: "outlet-ctx",
};

const UPDATED_AT_ISO = "2026-10-01T10:00:00.000Z";
const INACTIVE_UPDATED_AT_ISO = "2026-09-15T12:00:00.000Z";

const CURRENT_UPDATED_AT = "2026-10-01T10:00:00.000Z";
const CURRENT_UPDATED_AT_MS = Date.parse(CURRENT_UPDATED_AT);
const STALE_UPDATED_AT = "2026-09-01T00:00:00.000Z";

const createdRow = {
  id: "table-9",
  code: "T09",
  capacity: 4,
  isActive: true,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const currentRow = {
  id: "table-1",
  code: "T01",
  capacity: 2,
  isActive: true,
  updatedAt: new Date(CURRENT_UPDATED_AT),
};

const inactiveCurrentRow = {
  ...currentRow,
  isActive: false,
};

function createInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", code: "T09", ...overrides };
}

function updateInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: CURRENT_UPDATED_AT,
    capacity: 4,
    ...overrides,
  };
}

function stateInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: CURRENT_UPDATED_AT,
    ...overrides,
  };
}

function deactivateInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return stateInput(overrides);
}

function reactivateInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return stateInput(overrides);
}

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

async function expectDomainError(
  promise: Promise<unknown>,
  code: Parameters<typeof getOrderErrorMessage>[0]
): Promise<OrderDomainError | null> {
  const error = await captureError(promise);
  expect(error).toBeInstanceOf(OrderDomainError);
  expect(error?.code).toBe(code);
  expect(error?.message).toBe(getOrderErrorMessage(code));
  return error;
}

type FindFirstArgs = {
  where: Record<string, unknown>;
  select: Record<string, boolean>;
};

type MutationArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

function findFirstArgsAt(index: number): FindFirstArgs {
  return tx.diningTable.findFirst.mock.calls[index]?.[0] as FindFirstArgs;
}

function createArgs(): { data: Record<string, unknown> } {
  return tx.diningTable.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
}

function updateArgsAt(index: number): MutationArgs {
  return tx.diningTable.updateMany.mock.calls[index]?.[0] as MutationArgs;
}

function updateArgs(): MutationArgs {
  expect(tx.diningTable.updateMany).toHaveBeenCalledTimes(1);
  return updateArgsAt(0);
}

function logArgs(): { data: Record<string, unknown> } {
  return tx.activityLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
}

type PrismaLikeError = Error & { code: string; meta?: Record<string, unknown> };

function prismaError(code: string, meta?: Record<string, unknown>): PrismaLikeError {
  const error = new Error(`simulated prisma ${code}`) as PrismaLikeError;
  error.code = code;
  if (meta !== undefined) {
    error.meta = meta;
  }
  return error;
}

function isDuplicateQuery(args: { where: Record<string, unknown> }): boolean {
  return typeof args.where.code === "object" && args.where.code !== null;
}

function mockCurrentThen(current: unknown, duplicate: unknown = null): void {
  tx.diningTable.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) =>
    isDuplicateQuery(args) ? duplicate : current
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRequireOrderContext.mockResolvedValue(contextResult);
  mockedFindMany.mockResolvedValue([]);
  mockedTransaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) =>
    run(tx)
  );
  tx.diningTable.findFirst.mockResolvedValue(null);
  tx.diningTable.create.mockResolvedValue(createdRow);
  tx.diningTable.updateMany.mockResolvedValue({ count: 1 });
  tx.activityLog.create.mockResolvedValue({ id: "log-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("is a server-only module without hard deletes, relation queries or token usage", async () => {
    const modulePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../lib/services/dining-table.service.ts"
    );
    const source = readFileSync(modulePath, "utf8");

    expect(source.split(/\r?\n/, 1)[0].replace(/;/, "")).toBe('import "server-only"');
    expect(source).not.toMatch(/\.(delete|deleteMany)\s*\(/);
    expect(source).not.toContain("customerOrder");
    expect(source).not.toContain("include:");
    expect(source).not.toContain("deletedAt");
  });
});

describe("createDiningTable - input and authorization", () => {
  it("maps an invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(createDiningTable({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
    expect(tx.diningTable.create).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied id, timestamps, tenant, user, permission or qrTokenHash fields", async () => {
    for (const foreign of [
      { id: "table-evil" },
      { createdAt: new Date().toISOString() },
      { updatedAt: new Date().toISOString() },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "tables.manage" },
      { qrTokenHash: "token-evil" },
    ]) {
      await expectDomainError(createDiningTable(createInput(foreign)), "INVALID_INPUT");
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.create).not.toHaveBeenCalled();
  });

  it("authorizes with the parsed outletId and tables.manage", async () => {
    await createDiningTable(createInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "tables.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(createDiningTable(createInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
    expect(tx.diningTable.create).not.toHaveBeenCalled();
  });
});

describe("createDiningTable - duplicate protection", () => {
  it("queries duplicates case-insensitively scoped to the authorized outlet only", async () => {
    await createDiningTable(createInput({ outletId: "  outlet-raw  ", code: "  t09  " }));

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(findFirstArgsAt(0).where).toEqual({
      outletId: "outlet-ctx",
      code: { equals: "T09", mode: "insensitive" },
    });
    expect(findFirstArgsAt(0).where.outletId).not.toBe("outlet-1");
    expect(findFirstArgsAt(0).where.outletId).not.toBe("outlet-raw");
    expect(findFirstArgsAt(0).where).not.toHaveProperty("tenantId");
  });

  it("does not filter isActive and never selects qrTokenHash in the duplicate query", async () => {
    await createDiningTable(createInput());

    const args = findFirstArgsAt(0);
    expect(args.where).not.toHaveProperty("isActive");
    expect(args.where).not.toHaveProperty("deletedAt");
    expect(args.where).not.toHaveProperty("id");
    expect(args.select).toEqual({ id: true });
    expect(args.select).not.toHaveProperty("qrTokenHash");
  });

  it("maps an active duplicate row to TABLE_CODE_CONFLICT without creating anything", async () => {
    tx.diningTable.findFirst.mockResolvedValue({ id: "table-other", isActive: true });

    await expectDomainError(createDiningTable(createInput()), "TABLE_CODE_CONFLICT");

    expect(tx.diningTable.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an inactive duplicate row to TABLE_CODE_CONFLICT because inactive rows stay visible", async () => {
    tx.diningTable.findFirst.mockResolvedValue({ id: "table-inactive", isActive: false });

    await expectDomainError(createDiningTable(createInput()), "TABLE_CODE_CONFLICT");

    expect(tx.diningTable.create).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a code unique violation race to TABLE_CODE_CONFLICT for both target shapes", async () => {
    tx.diningTable.create
      .mockRejectedValueOnce(prismaError("P2002", { target: ["outletId", "code"] }))
      .mockRejectedValueOnce(prismaError("P2002", { target: "diningtable_outletid_code_key" }));

    await expectDomainError(createDiningTable(createInput()), "TABLE_CODE_CONFLICT");
    await expectDomainError(createDiningTable(createInput()), "TABLE_CODE_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("createDiningTable - create payload", () => {
  it("creates a minimum payload with capacity 4 and isActive true", async () => {
    await createDiningTable(createInput());

    expect(createArgs().data).toEqual({
      outletId: "outlet-ctx",
      code: "T09",
      capacity: 4,
      isActive: true,
    });
  });

  it("keeps an explicit capacity of 1 and isActive false", async () => {
    await createDiningTable(createInput({ capacity: 1, isActive: false }));

    expect(createArgs().data).toEqual({
      outletId: "outlet-ctx",
      code: "T09",
      capacity: 1,
      isActive: false,
    });
  });

  it("forwards a lowercase code to the database as uppercase", async () => {
    await createDiningTable(createInput({ code: "  vip-01  " }));

    expect(findFirstArgsAt(0).where.code).toEqual({ equals: "VIP-01", mode: "insensitive" });
    expect(createArgs().data.code).toBe("VIP-01");
  });

  it("writes only outletId, code, capacity and isActive without qrTokenHash or caller ids", async () => {
    await createDiningTable(createInput());

    const data = createArgs().data;
    expect(Object.keys(data).sort()).toEqual(["capacity", "code", "isActive", "outletId"]);
    expect(data).not.toHaveProperty("qrTokenHash");
    expect(data).not.toHaveProperty("id");
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
    expect(data).not.toHaveProperty("tenantId");
    expect(JSON.stringify(data)).not.toContain("qrTokenHash");
  });

  it("uses the actor tenant and user only in the activity log", async () => {
    await createDiningTable(createInput());

    const data = createArgs().data;
    expect(data).not.toHaveProperty("tenantId");
    expect(data).not.toHaveProperty("userId");
    expect(logArgs().data.tenantId).toBe("tenant-ctx");
    expect(logArgs().data.outletId).toBe("outlet-ctx");
    expect(logArgs().data.userId).toBe("user-1");
  });
});

describe("createDiningTable - activity log and output", () => {
  it("writes the activity log with the exact action, entity, actor and snapshots", async () => {
    await createDiningTable(createInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "table.created",
      entity: "DiningTable",
      entityId: "table-9",
      before: Prisma.DbNull,
      after: {
        code: "T09",
        capacity: 4,
        isActive: true,
        updatedAt: CURRENT_UPDATED_AT,
      },
    });
  });

  it("returns a summary with an ISO updatedAt and only the DTO fields", async () => {
    const result = await createDiningTable(createInput());

    expect(result).toEqual({
      id: "table-9",
      code: "T09",
      capacity: 4,
      isActive: true,
      updatedAt: CURRENT_UPDATED_AT,
    });
    expect(typeof result.updatedAt).toBe("string");
    expect(result.updatedAt).not.toBeInstanceOf(Date);
    expect(Object.keys(result).sort()).toEqual(["capacity", "code", "id", "isActive", "updatedAt"]);
    expect(result).not.toHaveProperty("outletId");
    expect(result).not.toHaveProperty("qrTokenHash");
    expect(result).not.toHaveProperty("createdAt");
  });

  it("runs the duplicate check, then create, then the activity log", async () => {
    const callOrder: string[] = [];
    tx.diningTable.findFirst.mockImplementation(async () => {
      callOrder.push("duplicate");
      return null;
    });
    tx.diningTable.create.mockImplementation(async () => {
      callOrder.push("create");
      return createdRow;
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await createDiningTable(createInput());

    expect(callOrder).toEqual(["duplicate", "create", "activityLog"]);
  });
});

describe("createDiningTable - error mapping", () => {
  it("maps a qrTokenHash unique violation to INTERNAL_ERROR without leaking the target", async () => {
    tx.diningTable.create.mockRejectedValueOnce(prismaError("P2002", { target: ["qrTokenHash"] }));

    const error = await expectDomainError(createDiningTable(createInput()), "INTERNAL_ERROR");

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("qrTokenHash");
    expect(error?.message).not.toContain("P2002");
    expect(error?.message).not.toContain("simulated prisma");
  });

  it("maps an unrelated unique target to INTERNAL_ERROR without leaking it", async () => {
    tx.diningTable.create.mockRejectedValueOnce(prismaError("P2002", { target: ["id"] }));

    const error = await expectDomainError(createDiningTable(createInput()), "INTERNAL_ERROR");

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("id");
    expect(error?.message).not.toContain("simulated prisma");
  });

  it("maps an activity log failure to INTERNAL_ERROR and never reports success", async () => {
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(createDiningTable(createInput()), "INTERNAL_ERROR");

    expect(error).not.toBeNull();
    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("activity log");
    expect(error?.message).not.toContain("insert");
  });
});

describe("createDiningTable - transaction", () => {
  it("opens a single transaction with maxWait 5000 and timeout 15000", async () => {
    await createDiningTable(createInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });
});

describe("updateDiningTable - input and authorization", () => {
  it("maps an invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(updateDiningTable({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied actor, tenant, isActive, qrTokenHash or a payload without changes", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { isActive: false },
      { permission: "tables.manage" },
      { qrTokenHash: "token-evil" },
      { code: undefined, capacity: undefined },
    ]) {
      await expectDomainError(updateDiningTable(updateInput(foreign)), "INVALID_INPUT");
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("authorizes with the parsed outletId and tables.manage", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "tables.manage");
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(updateDiningTable(updateInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("maps a missing row or a row from another outlet to TABLE_NOT_FOUND", async () => {
    tx.diningTable.findFirst.mockResolvedValue(null);

    await expectDomainError(updateDiningTable(updateInput({ code: "T02" })), "TABLE_NOT_FOUND");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("updateDiningTable - current row and version check", () => {
  it("loads the current row scoped to id and the authorized outletId only", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ outletId: "  outlet-raw  " }));

    const args = findFirstArgsAt(0);
    expect(args.where).toEqual({ id: "table-1", outletId: "outlet-ctx" });
    expect(Object.keys(args.where).sort()).toEqual(["id", "outletId"]);
    expect(args.where.outletId).not.toBe("outlet-1");
    expect(args.where.outletId).not.toBe("outlet-raw");
    expect(args.where).not.toHaveProperty("tenantId");
    expect(args.where).not.toHaveProperty("code");
    expect(args.where).not.toHaveProperty("qrTokenHash");
  });

  it("selects exactly the five summary fields without qrTokenHash", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput());

    const args = findFirstArgsAt(0);
    expect(args.select).toEqual({
      id: true,
      code: true,
      capacity: true,
      isActive: true,
      updatedAt: true,
    });
    expect(args.select).not.toHaveProperty("qrTokenHash");
    expect(args.select).not.toHaveProperty("outletId");
    expect(args.select).not.toHaveProperty("createdAt");
  });

  it("rejects a stale expectedUpdatedAt before any duplicate check, write or log", async () => {
    mockCurrentThen(currentRow, null);

    await expectDomainError(
      updateDiningTable(updateInput({ expectedUpdatedAt: STALE_UPDATED_AT, code: "T02" })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("updateDiningTable - duplicate protection", () => {
  it("excludes the current row from the case-insensitive duplicate check when code is supplied", async () => {
    mockCurrentThen(currentRow, null);

    await updateDiningTable(updateInput({ code: "  t02  " }));

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(2);
    const duplicate = findFirstArgsAt(1);
    expect(duplicate.where).toEqual({
      outletId: "outlet-ctx",
      code: { equals: "T02", mode: "insensitive" },
      id: { not: "table-1" },
    });
    expect(duplicate.select).toEqual({ id: true });
    expect(duplicate.where).not.toHaveProperty("isActive");
    expect(duplicate.select).not.toHaveProperty("qrTokenHash");
  });

  it("maps an inactive duplicate row to TABLE_CODE_CONFLICT without writing or logging", async () => {
    mockCurrentThen(currentRow, { id: "table-inactive", isActive: false });

    await expectDomainError(updateDiningTable(updateInput({ code: "T02" })), "TABLE_CODE_CONFLICT");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("skips the duplicate query entirely when code is absent", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput());

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(updateArgs().data).not.toHaveProperty("code");
    expect(updateArgs().data.capacity).toBe(4);
  });

  it("forwards a lowercase code to the database and the activity log as uppercase", async () => {
    mockCurrentThen(currentRow, null);

    await updateDiningTable(updateInput({ code: "  t02  " }));

    expect(findFirstArgsAt(1).where.code).toEqual({ equals: "T02", mode: "insensitive" });
    expect(updateArgs().data.code).toBe("T02");
    expect((logArgs().data.after as Record<string, unknown>).code).toBe("T02");
  });
});

describe("updateDiningTable - update payload", () => {
  it("writes an explicit capacity of 1", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ capacity: 1 }));

    expect(updateArgs().data.capacity).toBe(1);
  });

  it("mutates only the supplied fields", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ capacity: 1 }));
    await updateDiningTable(updateInput({ code: "T02", capacity: undefined }));

    expect(Object.keys(updateArgsAt(0).data).sort()).toEqual(["capacity", "updatedAt"]);
    expect(Object.keys(updateArgsAt(1).data).sort()).toEqual(["code", "updatedAt"]);
  });

  it("never writes isActive, keeping the persisted value untouched", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ code: "T02", capacity: 1 }));

    expect(updateArgs().data).not.toHaveProperty("isActive");
    expect(Object.keys(updateArgs().data).sort()).toEqual(["capacity", "code", "updatedAt"]);
    const after = logArgs().data.after as Record<string, unknown>;
    const before = logArgs().data.before as Record<string, unknown>;
    expect(after.isActive).toBe(true);
    expect(after.isActive).toBe(before.isActive);
    expect(after.isActive).toBe(currentRow.isActive);
  });

  it("never selects or writes qrTokenHash", async () => {
    mockCurrentThen(currentRow, null);

    await updateDiningTable(updateInput({ code: "T02" }));

    expect(findFirstArgsAt(0).select).not.toHaveProperty("qrTokenHash");
    expect(updateArgs().data).not.toHaveProperty("qrTokenHash");
    expect(JSON.stringify(findFirstArgsAt(0))).not.toContain("qrTokenHash");
    expect(JSON.stringify(updateArgs())).not.toContain("qrTokenHash");
    expect(JSON.stringify(logArgs())).not.toContain("qrTokenHash");
  });

  it("guards the write with id, authorized outletId and the current updatedAt", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ capacity: 1 }));

    expect(updateArgs().where).toEqual({
      id: "table-1",
      outletId: "outlet-ctx",
      updatedAt: new Date(CURRENT_UPDATED_AT),
    });
    expect(Object.keys(updateArgs().where).sort()).toEqual(["id", "outletId", "updatedAt"]);
    expect(updateArgs().where).not.toHaveProperty("tenantId");
    expect(updateArgs().where.outletId).not.toBe("outlet-1");
  });

  it("writes mutationTime as updatedAt and reuses it for the log and the result", async () => {
    mockCurrentThen(currentRow);

    const result = await updateDiningTable(updateInput({ capacity: 1 }));

    const written = updateArgs().data.updatedAt as Date;
    expect(written).toBeInstanceOf(Date);
    expect(written.getTime()).toBeGreaterThan(CURRENT_UPDATED_AT_MS);
    expect(result.updatedAt).toBe(written.toISOString());
    expect((logArgs().data.after as Record<string, unknown>).updatedAt).toBe(written.toISOString());
    expect(result.updatedAt).not.toBeInstanceOf(Date);
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not ahead of the row", async () => {
    mockCurrentThen(currentRow);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS - 1000);
    await updateDiningTable(updateInput({ capacity: 1 }));
    expect(updateArgsAt(0).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS + 1);
    await updateDiningTable(updateInput({ capacity: 1 }));
    expect(updateArgsAt(1).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));
  });

  it("uses Date.now when it is ahead of the current row", async () => {
    mockCurrentThen(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await updateDiningTable(updateInput({ capacity: 1 }));

    const expected = new Date(CURRENT_UPDATED_AT_MS + 5000);
    expect(updateArgs().data.updatedAt).toEqual(expected);
    expect(result.updatedAt).toBe(expected.toISOString());
    expect((logArgs().data.after as Record<string, unknown>).updatedAt).toBe(
      expected.toISOString()
    );
  });
});

describe("updateDiningTable - activity log and output", () => {
  it("writes primitive before and after snapshots with the exact action and entity", async () => {
    mockCurrentThen(currentRow, null);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    await updateDiningTable(updateInput({ code: "T02", capacity: 4 }));

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "table.updated",
      entity: "DiningTable",
      entityId: "table-1",
      before: {
        code: "T01",
        capacity: 2,
        isActive: true,
        updatedAt: CURRENT_UPDATED_AT,
      },
      after: {
        code: "T02",
        capacity: 4,
        isActive: true,
        updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
      },
    });

    const before = logArgs().data.before as Record<string, unknown>;
    const after = logArgs().data.after as Record<string, unknown>;
    for (const value of [...Object.values(before), ...Object.values(after)]) {
      expect(["string", "number", "boolean"]).toContain(typeof value);
    }
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("returns the updated summary built without a refetch", async () => {
    mockCurrentThen(currentRow, null);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await updateDiningTable(updateInput({ code: "T02", capacity: 4 }));

    expect(result).toEqual({
      id: "table-1",
      code: "T02",
      capacity: 4,
      isActive: true,
      updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
    });
    expect(Object.keys(result).sort()).toEqual(["capacity", "code", "id", "isActive", "updatedAt"]);
    expect(result.isActive).toBe(currentRow.isActive);
    expect(result).not.toHaveProperty("outletId");
    expect(result).not.toHaveProperty("qrTokenHash");
    expect(result).not.toHaveProperty("createdAt");
  });
});

describe("updateDiningTable - error mapping", () => {
  it("maps a lost update race with count 0 to TABLE_VERSION_CONFLICT without logging", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValueOnce({ count: 0 });

    await expectDomainError(
      updateDiningTable(updateInput({ capacity: 1 })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an impossible count greater than 1 to TABLE_VERSION_CONFLICT without logging", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValueOnce({ count: 2 });

    await expectDomainError(
      updateDiningTable(updateInput({ capacity: 1 })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a code unique violation during the write to TABLE_CODE_CONFLICT", async () => {
    mockCurrentThen(currentRow, null);
    tx.diningTable.updateMany.mockRejectedValueOnce(
      prismaError("P2002", { target: ["outletId", "code"] })
    );

    await expectDomainError(updateDiningTable(updateInput({ code: "T02" })), "TABLE_CODE_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a qrTokenHash unique violation to INTERNAL_ERROR without leaking the target", async () => {
    mockCurrentThen(currentRow, null);
    tx.diningTable.updateMany.mockRejectedValueOnce(
      prismaError("P2002", { target: ["qrTokenHash"] })
    );

    const error = await expectDomainError(
      updateDiningTable(updateInput({ code: "T02" })),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("qrTokenHash");
    expect(error?.message).not.toContain("P2002");
    expect(error?.message).not.toContain("simulated prisma");
  });

  it("maps an unknown database error to INTERNAL_ERROR without leaking details", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockRejectedValueOnce(new Error("password authentication failed"));

    const error = await expectDomainError(
      updateDiningTable(updateInput({ capacity: 1 })),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("authentication");
    expect(error?.message).not.toContain("query");
    expect(error?.message).not.toContain("prisma");
  });
});

describe("updateDiningTable - transaction and call order", () => {
  it("finds the row, checks the duplicate when code is supplied, updates, then logs", async () => {
    const callOrder: string[] = [];
    tx.diningTable.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        if (isDuplicateQuery(args)) {
          callOrder.push("duplicate");
          return null;
        }
        callOrder.push("find");
        return currentRow;
      }
    );
    tx.diningTable.updateMany.mockImplementation(async () => {
      callOrder.push("update");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await updateDiningTable(updateInput({ code: "T02" }));

    expect(callOrder).toEqual(["find", "duplicate", "update", "activityLog"]);
  });

  it("skips the duplicate step in the call order when code is absent", async () => {
    const callOrder: string[] = [];
    tx.diningTable.findFirst.mockImplementation(async () => {
      callOrder.push("find");
      return currentRow;
    });
    tx.diningTable.updateMany.mockImplementation(async () => {
      callOrder.push("update");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await updateDiningTable(updateInput({ capacity: 1 }));

    expect(callOrder).toEqual(["find", "update", "activityLog"]);
  });

  it("opens a single transaction with maxWait 5000 and timeout 15000", async () => {
    mockCurrentThen(currentRow);

    await updateDiningTable(updateInput({ capacity: 1 }));

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });

  it("never retries the transaction after a conflict", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(
      updateDiningTable(updateInput({ capacity: 1 })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("deactivateDiningTable - input and authorization", () => {
  it("maps an invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(deactivateDiningTable({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied state, code, capacity, tenant, user or qrTokenHash fields", async () => {
    for (const foreign of [
      { isActive: false },
      { code: "T02" },
      { capacity: 4 },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { qrTokenHash: "token-evil" },
    ]) {
      await expectDomainError(deactivateDiningTable(deactivateInput(foreign)), "INVALID_INPUT");
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(deactivateDiningTable(deactivateInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("maps a missing row or a row from another outlet to TABLE_NOT_FOUND", async () => {
    tx.diningTable.findFirst.mockResolvedValue(null);

    await expectDomainError(deactivateDiningTable(deactivateInput()), "TABLE_NOT_FOUND");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("authorizes with the parsed outletId and tables.manage and looks the row up by authorized outlet", async () => {
    mockCurrentThen(currentRow);

    await deactivateDiningTable(deactivateInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "tables.manage");

    const args = findFirstArgsAt(0);
    expect(args.where).toEqual({ id: "table-1", outletId: "outlet-ctx" });
    expect(args.where.outletId).not.toBe("outlet-1");
    expect(args.where).not.toHaveProperty("tenantId");
    expect(args.select).toEqual({
      id: true,
      code: true,
      capacity: true,
      isActive: true,
      updatedAt: true,
    });
    expect(args.select).not.toHaveProperty("qrTokenHash");
  });
});

describe("deactivateDiningTable - version and state checks", () => {
  it("rejects a stale token on an active row before any state check or write", async () => {
    mockCurrentThen(currentRow);

    await expectDomainError(
      deactivateDiningTable(deactivateInput({ expectedUpdatedAt: STALE_UPDATED_AT })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("rejects a stale token on an already inactive row with TABLE_VERSION_CONFLICT", async () => {
    mockCurrentThen(inactiveCurrentRow);

    await expectDomainError(
      deactivateDiningTable(deactivateInput({ expectedUpdatedAt: STALE_UPDATED_AT })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an already inactive row with a matching token to TABLE_STATE_CONFLICT without any write", async () => {
    mockCurrentThen(inactiveCurrentRow);

    await expectDomainError(deactivateDiningTable(deactivateInput()), "TABLE_STATE_CONFLICT");

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("deactivateDiningTable - mutation", () => {
  it("deactivates an active row writing only isActive false and updatedAt", async () => {
    mockCurrentThen(currentRow);

    await deactivateDiningTable(deactivateInput());

    const data = updateArgs().data;
    expect(Object.keys(data).sort()).toEqual(["isActive", "updatedAt"]);
    expect(data.isActive).toBe(false);
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("code");
    expect(data).not.toHaveProperty("capacity");
    expect(data).not.toHaveProperty("qrTokenHash");
    expect(JSON.stringify(updateArgs())).not.toContain("qrTokenHash");
  });

  it("keeps code and capacity untouched in the written payload and the result", async () => {
    mockCurrentThen(currentRow);

    const result = await deactivateDiningTable(deactivateInput());

    expect(updateArgs().data).not.toHaveProperty("code");
    expect(updateArgs().data).not.toHaveProperty("capacity");
    expect(result.code).toBe(currentRow.code);
    expect(result.capacity).toBe(currentRow.capacity);
    expect(result.isActive).toBe(false);
  });

  it("guards the write with id, authorized outletId and the current updatedAt", async () => {
    mockCurrentThen(currentRow);

    await deactivateDiningTable(deactivateInput());

    expect(updateArgs().where).toEqual({
      id: "table-1",
      outletId: "outlet-ctx",
      updatedAt: new Date(CURRENT_UPDATED_AT),
    });
    expect(updateArgs().where).not.toHaveProperty("tenantId");
    expect(updateArgs().where.outletId).not.toBe("outlet-1");
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not ahead of the row", async () => {
    mockCurrentThen(currentRow);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS - 1000);
    await deactivateDiningTable(deactivateInput());
    expect(updateArgsAt(0).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS + 1);
    await deactivateDiningTable(deactivateInput());
    expect(updateArgsAt(1).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));
  });

  it("uses Date.now when it is ahead of the current row", async () => {
    mockCurrentThen(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await deactivateDiningTable(deactivateInput());

    const expected = new Date(CURRENT_UPDATED_AT_MS + 5000);
    expect(updateArgs().data.updatedAt).toEqual(expected);
    expect(result.updatedAt).toBe(expected.toISOString());
  });
});

describe("deactivateDiningTable - activity log and output", () => {
  it("writes the activity log with the exact action, entity, actor and snapshots", async () => {
    mockCurrentThen(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    await deactivateDiningTable(deactivateInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "table.deactivated",
      entity: "DiningTable",
      entityId: "table-1",
      before: {
        code: "T01",
        capacity: 2,
        isActive: true,
        updatedAt: CURRENT_UPDATED_AT,
      },
      after: {
        code: "T01",
        capacity: 2,
        isActive: false,
        updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
      },
    });
  });

  it("returns a summary with isActive false and only the DTO fields", async () => {
    mockCurrentThen(currentRow);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await deactivateDiningTable(deactivateInput());

    expect(result).toEqual({
      id: "table-1",
      code: "T01",
      capacity: 2,
      isActive: false,
      updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
    });
    expect(Object.keys(result).sort()).toEqual(["capacity", "code", "id", "isActive", "updatedAt"]);
    expect(result.updatedAt).not.toBeInstanceOf(Date);
    expect(result).not.toHaveProperty("qrTokenHash");
    expect(result).not.toHaveProperty("outletId");
  });

  it("finds the row, updates, then logs without any duplicate query", async () => {
    const callOrder: string[] = [];
    tx.diningTable.findFirst.mockImplementation(async () => {
      callOrder.push("find");
      return currentRow;
    });
    tx.diningTable.updateMany.mockImplementation(async () => {
      callOrder.push("update");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await deactivateDiningTable(deactivateInput());

    expect(callOrder).toEqual(["find", "update", "activityLog"]);
    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("deactivateDiningTable - errors and transaction", () => {
  it("maps a lost update race with count 0 to TABLE_VERSION_CONFLICT without logging", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValueOnce({ count: 0 });

    await expectDomainError(deactivateDiningTable(deactivateInput()), "TABLE_VERSION_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an impossible count greater than 1 to TABLE_VERSION_CONFLICT without logging", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValueOnce({ count: 2 });

    await expectDomainError(deactivateDiningTable(deactivateInput()), "TABLE_VERSION_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an unknown update error to INTERNAL_ERROR without leaking details", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockRejectedValueOnce(new Error("password authentication failed"));

    const error = await expectDomainError(
      deactivateDiningTable(deactivateInput()),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("authentication");
    expect(error?.message).not.toContain("query");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an activity log failure to INTERNAL_ERROR without leaking details", async () => {
    mockCurrentThen(currentRow);
    tx.activityLog.create.mockRejectedValue(new Error("activity log insert failed"));

    const error = await expectDomainError(
      deactivateDiningTable(deactivateInput()),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("activity log");
    expect(error?.message).not.toContain("insert");
  });

  it("opens a single transaction with maxWait 5000 and timeout 15000", async () => {
    mockCurrentThen(currentRow);

    await deactivateDiningTable(deactivateInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });

  it("never retries the transaction after a conflict", async () => {
    mockCurrentThen(currentRow);
    tx.diningTable.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(deactivateDiningTable(deactivateInput()), "TABLE_VERSION_CONFLICT");

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe("reactivateDiningTable - input and authorization", () => {
  it("maps an invalid payload to INVALID_INPUT without touching context or the database", async () => {
    const error = await expectDomainError(reactivateDiningTable({}), "INVALID_INPUT");

    expect(error).not.toBeNull();
    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied state, code, capacity, tenant, user or qrTokenHash fields", async () => {
    for (const foreign of [
      { isActive: true },
      { code: "T02" },
      { capacity: 4 },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { qrTokenHash: "token-evil" },
    ]) {
      await expectDomainError(reactivateDiningTable(reactivateInput(foreign)), "INVALID_INPUT");
    }

    expect(mockedRequireOrderContext).not.toHaveBeenCalled();
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("keeps the context error and never opens a transaction", async () => {
    const domainError = new OrderDomainError("OUTLET_ACCESS_DENIED");
    mockedRequireOrderContext.mockRejectedValue(domainError);

    const error = await captureError(reactivateDiningTable(reactivateInput()));

    expect(error).toBe(domainError);
    expect(error?.code).toBe("OUTLET_ACCESS_DENIED");
    expect(mockedTransaction).not.toHaveBeenCalled();
    expect(tx.diningTable.findFirst).not.toHaveBeenCalled();
  });

  it("maps a missing row or a row from another outlet to TABLE_NOT_FOUND", async () => {
    tx.diningTable.findFirst.mockResolvedValue(null);

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_NOT_FOUND");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("authorizes with the parsed outletId and tables.manage and looks the row up by authorized outlet", async () => {
    mockCurrentThen(inactiveCurrentRow);

    await reactivateDiningTable(reactivateInput({ outletId: "  outlet-raw  " }));

    expect(mockedRequireOrderContext).toHaveBeenCalledTimes(1);
    expect(mockedRequireOrderContext).toHaveBeenCalledWith("outlet-raw", "tables.manage");

    const args = findFirstArgsAt(0);
    expect(args.where).toEqual({ id: "table-1", outletId: "outlet-ctx" });
    expect(args.where.outletId).not.toBe("outlet-1");
    expect(args.where).not.toHaveProperty("tenantId");
    expect(args.select).toEqual({
      id: true,
      code: true,
      capacity: true,
      isActive: true,
      updatedAt: true,
    });
    expect(args.select).not.toHaveProperty("qrTokenHash");
  });
});

describe("reactivateDiningTable - version and state checks", () => {
  it("rejects a stale token on an inactive row before any duplicate check or write", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    await expectDomainError(
      reactivateDiningTable(reactivateInput({ expectedUpdatedAt: STALE_UPDATED_AT })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("rejects a stale token on an already active row with TABLE_VERSION_CONFLICT", async () => {
    mockCurrentThen(currentRow, null);

    await expectDomainError(
      reactivateDiningTable(reactivateInput({ expectedUpdatedAt: STALE_UPDATED_AT })),
      "TABLE_VERSION_CONFLICT"
    );

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an already active row with a matching token to TABLE_STATE_CONFLICT without any write", async () => {
    mockCurrentThen(currentRow, null);

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_STATE_CONFLICT");

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
    expect(mockedTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("reactivateDiningTable - duplicate protection", () => {
  it("rechecks the code case-insensitively scoped to the authorized outlet, excluding the current row", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    await reactivateDiningTable(reactivateInput());

    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(2);
    const duplicate = findFirstArgsAt(1);
    expect(duplicate.where).toEqual({
      outletId: "outlet-ctx",
      code: { equals: "T01", mode: "insensitive" },
      id: { not: "table-1" },
    });
    expect(Object.keys(duplicate.where).sort()).toEqual(["code", "id", "outletId"]);
    expect(duplicate.select).toEqual({ id: true });
    expect(duplicate.where).not.toHaveProperty("isActive");
    expect(duplicate.select).not.toHaveProperty("qrTokenHash");
  });

  it("maps an active duplicate code to TABLE_CODE_CONFLICT without writing or logging", async () => {
    mockCurrentThen(inactiveCurrentRow, { id: "table-other", isActive: true });

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_CODE_CONFLICT");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps an inactive duplicate code to TABLE_CODE_CONFLICT without writing or logging", async () => {
    mockCurrentThen(inactiveCurrentRow, { id: "table-inactive", isActive: false });

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_CODE_CONFLICT");

    expect(tx.diningTable.updateMany).not.toHaveBeenCalled();
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("reactivateDiningTable - mutation", () => {
  it("reactivates an inactive row writing only isActive true and updatedAt", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    await reactivateDiningTable(reactivateInput());

    const data = updateArgs().data;
    expect(Object.keys(data).sort()).toEqual(["isActive", "updatedAt"]);
    expect(data.isActive).toBe(true);
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect(data).not.toHaveProperty("code");
    expect(data).not.toHaveProperty("capacity");
    expect(data).not.toHaveProperty("qrTokenHash");
    expect(JSON.stringify(updateArgs())).not.toContain("qrTokenHash");
  });

  it("keeps code and capacity untouched in the written payload and the result", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    const result = await reactivateDiningTable(reactivateInput());

    expect(updateArgs().data).not.toHaveProperty("code");
    expect(updateArgs().data).not.toHaveProperty("capacity");
    expect(result.code).toBe(inactiveCurrentRow.code);
    expect(result.capacity).toBe(inactiveCurrentRow.capacity);
    expect(result.isActive).toBe(true);
  });

  it("guards the write with id, authorized outletId and the current updatedAt", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    await reactivateDiningTable(reactivateInput());

    expect(updateArgs().where).toEqual({
      id: "table-1",
      outletId: "outlet-ctx",
      updatedAt: new Date(CURRENT_UPDATED_AT),
    });
    expect(updateArgs().where).not.toHaveProperty("tenantId");
    expect(updateArgs().where.outletId).not.toBe("outlet-1");
  });

  it("advances the timestamp by exactly 1 ms when Date.now is not ahead of the row", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    const nowSpy = vi.spyOn(Date, "now");

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS - 1000);
    await reactivateDiningTable(reactivateInput());
    expect(updateArgsAt(0).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));

    nowSpy.mockReturnValue(CURRENT_UPDATED_AT_MS + 1);
    await reactivateDiningTable(reactivateInput());
    expect(updateArgsAt(1).data.updatedAt).toEqual(new Date(CURRENT_UPDATED_AT_MS + 1));
  });

  it("uses Date.now when it is ahead of the current row", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await reactivateDiningTable(reactivateInput());

    const expected = new Date(CURRENT_UPDATED_AT_MS + 5000);
    expect(updateArgs().data.updatedAt).toEqual(expected);
    expect(result.updatedAt).toBe(expected.toISOString());
  });

  it("writes the activity log with before inactive and after active", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    await reactivateDiningTable(reactivateInput());

    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
    expect(logArgs().data).toEqual({
      tenantId: "tenant-ctx",
      outletId: "outlet-ctx",
      userId: "user-1",
      action: "table.reactivated",
      entity: "DiningTable",
      entityId: "table-1",
      before: {
        code: "T01",
        capacity: 2,
        isActive: false,
        updatedAt: CURRENT_UPDATED_AT,
      },
      after: {
        code: "T01",
        capacity: 2,
        isActive: true,
        updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
      },
    });
  });

  it("returns a summary with isActive true and only the DTO fields", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    vi.spyOn(Date, "now").mockReturnValue(CURRENT_UPDATED_AT_MS + 5000);

    const result = await reactivateDiningTable(reactivateInput());

    expect(result).toEqual({
      id: "table-1",
      code: "T01",
      capacity: 2,
      isActive: true,
      updatedAt: new Date(CURRENT_UPDATED_AT_MS + 5000).toISOString(),
    });
    expect(Object.keys(result).sort()).toEqual(["capacity", "code", "id", "isActive", "updatedAt"]);
    expect(result.updatedAt).not.toBeInstanceOf(Date);
    expect(result).not.toHaveProperty("qrTokenHash");
    expect(result).not.toHaveProperty("outletId");
  });
});

describe("reactivateDiningTable - errors and transaction", () => {
  it("maps a code unique violation during the write to TABLE_CODE_CONFLICT without logging", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    tx.diningTable.updateMany.mockRejectedValueOnce(
      prismaError("P2002", { target: ["outletId", "code"] })
    );

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_CODE_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a qrTokenHash unique violation to INTERNAL_ERROR without leaking the target", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    tx.diningTable.updateMany.mockRejectedValueOnce(
      prismaError("P2002", { target: ["qrTokenHash"] })
    );

    const error = await expectDomainError(
      reactivateDiningTable(reactivateInput()),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("qrTokenHash");
    expect(error?.message).not.toContain("P2002");
    expect(error?.message).not.toContain("simulated prisma");
  });

  it("maps an unknown update error to INTERNAL_ERROR without leaking details", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    tx.diningTable.updateMany.mockRejectedValueOnce(new Error("password authentication failed"));

    const error = await expectDomainError(
      reactivateDiningTable(reactivateInput()),
      "INTERNAL_ERROR"
    );

    expect(error?.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
    expect(error?.message).not.toContain("password");
    expect(error?.message).not.toContain("authentication");
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("maps a lost update race to TABLE_VERSION_CONFLICT without logging", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    tx.diningTable.updateMany.mockResolvedValueOnce({ count: 0 });

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_VERSION_CONFLICT");

    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("finds the row, rechecks the code, updates, then logs", async () => {
    const callOrder: string[] = [];
    tx.diningTable.findFirst.mockImplementation(
      async (args: { where: Record<string, unknown> }) => {
        if (isDuplicateQuery(args)) {
          callOrder.push("duplicate");
          return null;
        }
        callOrder.push("find");
        return inactiveCurrentRow;
      }
    );
    tx.diningTable.updateMany.mockImplementation(async () => {
      callOrder.push("update");
      return { count: 1 };
    });
    tx.activityLog.create.mockImplementation(async () => {
      callOrder.push("activityLog");
      return { id: "log-1" };
    });

    await reactivateDiningTable(reactivateInput());

    expect(callOrder).toEqual(["find", "duplicate", "update", "activityLog"]);
  });

  it("opens a single transaction with maxWait 5000 and timeout 15000", async () => {
    mockCurrentThen(inactiveCurrentRow, null);

    await reactivateDiningTable(reactivateInput());

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    const call = mockedTransaction.mock.calls[0];
    expect(typeof call[0]).toBe("function");
    expect(call[1]).toEqual({ maxWait: 5000, timeout: 15000 });
  });

  it("never retries the transaction after a conflict", async () => {
    mockCurrentThen(inactiveCurrentRow, null);
    tx.diningTable.updateMany.mockResolvedValue({ count: 0 });

    await expectDomainError(reactivateDiningTable(reactivateInput()), "TABLE_VERSION_CONFLICT");

    expect(mockedTransaction).toHaveBeenCalledTimes(1);
    expect(tx.diningTable.findFirst).toHaveBeenCalledTimes(2);
    expect(tx.diningTable.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).not.toHaveBeenCalled();
  });
});

describe("generateQrToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireOrderContext.mockResolvedValue({
      actor: { tenantId: "tenant-ctx", userId: "user-1" },
      outletId: "outlet-ctx",
    });
    tx.diningTable.findFirst.mockResolvedValue({
      id: "table-1",
      code: "T01",
      capacity: 4,
      isActive: true,
      updatedAt: new Date(2026, 0, 1),
    });
    tx.diningTable.updateMany.mockResolvedValue({ count: 1 });
    tx.activityLog.create.mockResolvedValue({ id: "log-1" });
  });

  it("rejects invalid input schema", async () => {
    await expectDomainError(generateQrToken({ outletId: "" }), "INVALID_INPUT");
  });

  it("throws TABLE_NOT_FOUND when table does not exist", async () => {
    tx.diningTable.findFirst.mockResolvedValueOnce(null);
    await expectDomainError(generateQrToken({ outletId: "outlet-1", tableId: "table-x" }), "TABLE_NOT_FOUND");
  });

  it("generates a raw token string and updates qrTokenHash", async () => {
    const token = await generateQrToken({ outletId: "outlet-1", tableId: "table-1" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(tx.diningTable.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });
});
