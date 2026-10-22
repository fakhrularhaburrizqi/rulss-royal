import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import * as tableActions from "@/app/dashboard/table-actions";
import {
  createTableAction,
  deactivateTableAction,
  generateTableTokenAction,
  reactivateTableAction,
  updateTableAction,
  type TableActionResult,
  type TableTokenResult,
} from "@/app/dashboard/table-actions";
import { OrderDomainError, getOrderErrorMessage, type OrderErrorCode } from "@/lib/order/errors";
import {
  createDiningTable,
  deactivateDiningTable,
  generateQrToken,
  reactivateDiningTable,
  updateDiningTable,
  type DiningTableSummary,
} from "@/lib/services/dining-table.service";

vi.mock("@/lib/services/dining-table.service", () => ({
  createDiningTable: vi.fn(),
  updateDiningTable: vi.fn(),
  deactivateDiningTable: vi.fn(),
  reactivateDiningTable: vi.fn(),
  generateQrToken: vi.fn(),
}));

const mockedCreate = vi.mocked(createDiningTable);
const mockedUpdate = vi.mocked(updateDiningTable);
const mockedDeactivate = vi.mocked(deactivateDiningTable);
const mockedReactivate = vi.mocked(reactivateDiningTable);
const mockedGenerateQrToken = vi.mocked(generateQrToken);

const UPDATED_AT = "2026-10-01T10:00:00.000Z";
const MUTATED_AT = "2026-10-01T10:00:01.000Z";

type ActionCase = {
  call: (payload: unknown) => Promise<TableActionResult>;
  base: Record<string, unknown>;
  service: () => typeof mockedCreate;
};

const everyAction: ActionCase[] = [
  {
    call: createTableAction,
    base: { outletId: "outlet-1", code: "T01" },
    service: () => mockedCreate,
  },
  {
    call: updateTableAction,
    base: {
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: UPDATED_AT,
      code: "T01",
    },
    service: () => mockedUpdate,
  },
  {
    call: deactivateTableAction,
    base: { outletId: "outlet-1", tableId: "table-1", expectedUpdatedAt: UPDATED_AT },
    service: () => mockedDeactivate,
  },
  {
    call: reactivateTableAction,
    base: { outletId: "outlet-1", tableId: "table-1", expectedUpdatedAt: UPDATED_AT },
    service: () => mockedReactivate,
  },
];

function tableSummary(overrides: Partial<DiningTableSummary> = {}): DiningTableSummary {
  return {
    id: "table-1",
    code: "T01",
    capacity: 4,
    isActive: true,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", code: "T01", ...overrides };
}

function updatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: UPDATED_AT,
    code: "T01",
    ...overrides,
  };
}

function targetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: UPDATED_AT,
    ...overrides,
  };
}

function invalidFailure() {
  return { ok: false, code: "INVALID_INPUT", message: getOrderErrorMessage("INVALID_INPUT") };
}

function failureOf(code: OrderErrorCode) {
  return { ok: false, code, message: getOrderErrorMessage(code) };
}

async function expectDomainFailure(
  action: (payload: unknown) => Promise<TableActionResult>,
  payload: Record<string, unknown>,
  code: OrderErrorCode,
  service: typeof mockedCreate
): Promise<void> {
  service.mockRejectedValueOnce(new OrderDomainError(code));

  const result = await action(payload);

  expect(result).toEqual(failureOf(code));
}

beforeEach(() => {
  vi.clearAllMocks();

  mockedCreate.mockResolvedValue(tableSummary({ id: "table-9", code: "T09" }));
  mockedUpdate.mockResolvedValue(tableSummary({ code: "T02", capacity: 8, updatedAt: MUTATED_AT }));
  mockedDeactivate.mockResolvedValue(tableSummary({ isActive: false, updatedAt: MUTATED_AT }));
  mockedReactivate.mockResolvedValue(tableSummary({ isActive: true, updatedAt: MUTATED_AT }));
});

describe("table actions (shared)", () => {
  it('starts with "use server" and exports exactly the four mutation actions as async functions', async () => {
    const modulePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/dashboard/table-actions.ts"
    );
    const source = readFileSync(modulePath, "utf8");

    expect(source.split(/\r?\n/, 1)[0].replace(/;$/, "")).toBe('"use server"');

    expect(Object.keys(tableActions).sort()).toEqual([
      "createTableAction",
      "deactivateTableAction",
      "generateTableTokenAction",
      "getTableQrAction",
      "reactivateTableAction",
      "updateTableAction",
    ]);

    for (const action of everyAction) {
      expect(typeof action.call).toBe("function");
      expect(action.call.constructor.name).toBe("AsyncFunction");
    }

    expect(source.match(/export async function \w+/g) ?? []).toHaveLength(6);
    expect(source).not.toContain("listTablesForManagement");
  });

  it("never reads the database, auth or revalidatePath from the action module", async () => {
    const modulePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../app/dashboard/table-actions.ts"
    );
    const source = readFileSync(modulePath, "utf8");

    expect(source).not.toContain("@/lib/db");
    expect(source).not.toContain("@/auth");
    expect(source).not.toContain("revalidatePath");
    expect(source).not.toContain("qrTokenHash");
    expect(source).not.toContain("error.message");
    expect(source).not.toContain("mapped.message");
    expect(source).not.toContain("stack");
    expect(source).not.toContain("listTablesForManagement");
  });

  it("serializes every success, failure and invalid result with JSON.stringify", async () => {
    const okResults = await Promise.all(everyAction.map((action) => action.call(action.base)));

    const domainFailures: TableActionResult[] = [];
    for (const action of everyAction) {
      action.service().mockRejectedValueOnce(new OrderDomainError("TABLE_VERSION_CONFLICT"));
      domainFailures.push(await action.call(action.base));
    }

    const unknownFailures: TableActionResult[] = [];
    for (const action of everyAction) {
      action.service().mockRejectedValueOnce(new Error("boom"));
      unknownFailures.push(await action.call(action.base));
    }

    const invalidResults = await Promise.all(everyAction.map((action) => action.call({})));

    for (const result of [...okResults, ...domainFailures, ...unknownFailures, ...invalidResults]) {
      expect(() => JSON.stringify(result)).not.toThrow();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("returns INVALID_INPUT for empty payloads without calling any service", async () => {
    const results = await Promise.all(everyAction.map((action) => action.call({})));

    for (const result of results) {
      expect(result).toEqual(invalidFailure());
    }

    for (const action of everyAction) {
      expect(action.service()).not.toHaveBeenCalled();
    }
  });

  it("keeps the domain code and message from an OrderDomainError", async () => {
    for (const action of everyAction) {
      action.service().mockRejectedValueOnce(new OrderDomainError("TABLE_CODE_CONFLICT"));

      const result = await action.call(action.base);

      expect(result).toEqual(failureOf("TABLE_CODE_CONFLICT"));
    }
  });

  it("maps an unknown error with sensitive details to INTERNAL_ERROR without leaking it", async () => {
    for (const action of everyAction) {
      action
        .service()
        .mockRejectedValueOnce(new Error("password authentication failed for prisma query"));

      const result = await action.call(action.base);

      expect(result).toEqual(failureOf("INTERNAL_ERROR"));

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("password");
      expect(serialized).not.toContain("authentication");
      expect(serialized).not.toContain("prisma");
      expect(serialized).not.toContain("query");
      expect(serialized).not.toContain("boom");
    }
  });

  it("returns only ok, code and message on every failure", async () => {
    const results: TableActionResult[] = [];

    for (const action of everyAction) {
      action.service().mockRejectedValueOnce(new OrderDomainError("TABLE_NOT_FOUND"));
      results.push(await action.call(action.base));
      results.push(await action.call({}));
    }

    for (const result of results) {
      expect(result.ok).toBe(false);

      if (result.ok) {
        continue;
      }

      expect(Object.keys(result)).toEqual(["ok", "code", "message"]);
      expect(typeof result.code).toBe("string");
      expect(typeof result.message).toBe("string");
    }

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("boom");
    expect(serialized).not.toContain("stack");
  });

  it("returns only ok and data with the five summary fields on every success", async () => {
    const results = await Promise.all(everyAction.map((action) => action.call(action.base)));

    for (const result of results) {
      expect(result.ok).toBe(true);

      if (!result.ok) {
        continue;
      }

      expect(Object.keys(result)).toEqual(["ok", "data"]);
      expect(Object.keys(result.data).sort()).toEqual([
        "capacity",
        "code",
        "id",
        "isActive",
        "updatedAt",
      ]);
      expect(typeof result.data.updatedAt).toBe("string");
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("never includes actor, tenantId, userId, permission or qrTokenHash in any result", async () => {
    const results: TableActionResult[] = [];

    for (const action of everyAction) {
      action.service().mockRejectedValueOnce(new OrderDomainError("TABLE_STATE_CONFLICT"));
      results.push(await action.call(action.base));
      results.push(await action.call({}));
      results.push(await action.call({ ...action.base, tenantId: "injected" }));
    }

    results.push(...(await Promise.all(everyAction.map((action) => action.call(action.base)))));

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain("injected");
    expect(serialized).not.toContain("qrTokenHash");
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("actor");
    expect(serialized).not.toContain("tenantId");
    expect(serialized).not.toContain("userId");
  });

  it("rejects actor, tenantId, userId and permission fields on every action without calling a service", async () => {
    for (const action of everyAction) {
      for (const field of ["actor", "tenantId", "userId", "permission"]) {
        const result = await action.call({ ...action.base, [field]: "injected" });

        expect(result).toEqual(invalidFailure());
      }
    }

    for (const action of everyAction) {
      expect(action.service()).not.toHaveBeenCalled();
    }
  });
});

describe("createTableAction", () => {
  it("passes the minimum valid payload to the service exactly once", async () => {
    const result = await createTableAction(createPayload());

    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith({ outletId: "outlet-1", code: "T01" });
    expect(result).toEqual({ ok: true, data: tableSummary({ id: "table-9", code: "T09" }) });
  });

  it("normalizes a padded lowercase code to uppercase before calling the service", async () => {
    const result = await createTableAction(createPayload({ code: "  vip-01  " }));

    expect(mockedCreate).toHaveBeenCalledWith({ outletId: "outlet-1", code: "VIP-01" });
    expect(result.ok).toBe(true);
  });

  it("leaves the optional capacity and isActive undefined when they are missing", async () => {
    await createTableAction(createPayload());

    const arg = mockedCreate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("capacity");
    expect(arg).not.toHaveProperty("isActive");
    expect(arg.capacity).toBeUndefined();
    expect(arg.isActive).toBeUndefined();
  });

  it("forwards an explicit capacity of 1 and isActive false", async () => {
    await createTableAction(createPayload({ capacity: 1, isActive: false }));

    expect(mockedCreate).toHaveBeenCalledWith({
      outletId: "outlet-1",
      code: "T01",
      capacity: 1,
      isActive: false,
    });
  });

  it("rejects codes with inner spaces, invalid characters or an empty value", async () => {
    for (const code of ["T 01", "T@01", "-T01", ""]) {
      const result = await createTableAction(createPayload({ code }));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects capacity below 1, above 99, fractional or non-numeric values", async () => {
    for (const capacity of [0, 100, 4.5, "4"]) {
      const result = await createTableAction(createPayload({ capacity }));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied tenantId, userId, permission, qrTokenHash, updatedAt and id", async () => {
    for (const foreign of [
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "tables.manage" },
      { qrTokenHash: "token-evil" },
      { updatedAt: new Date().toISOString() },
      { id: "table-evil" },
    ]) {
      const result = await createTableAction(createPayload(foreign));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("maps a TABLE_CODE_CONFLICT from the service", async () => {
    await expectDomainFailure(
      createTableAction,
      createPayload(),
      "TABLE_CODE_CONFLICT",
      mockedCreate
    );
  });

  it("maps an unknown service error to INTERNAL_ERROR without leaking details", async () => {
    mockedCreate.mockRejectedValueOnce(new Error("connection refused at db.internal"));

    const result = await createTableAction(createPayload());

    expect(result).toEqual(failureOf("INTERNAL_ERROR"));
    expect(JSON.stringify(result)).not.toContain("connection");
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });
});

describe("updateTableAction", () => {
  it("passes a valid code-only payload with the code uppercased", async () => {
    const result = await updateTableAction(updatePayload({ code: "  t02  " }));

    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).toHaveBeenCalledWith({
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: UPDATED_AT,
      code: "T02",
    });
    expect(result).toEqual({
      ok: true,
      data: tableSummary({ code: "T02", capacity: 8, updatedAt: MUTATED_AT }),
    });
  });

  it("passes a valid capacity-only payload", async () => {
    await updateTableAction(updatePayload({ code: undefined, capacity: 4 }));

    expect(mockedUpdate).toHaveBeenCalledWith({
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: UPDATED_AT,
      capacity: 4,
    });
  });

  it("keeps expectedUpdatedAt as the ISO string sent by the caller", async () => {
    await updateTableAction(updatePayload());

    const arg = mockedUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg.expectedUpdatedAt).toBe(UPDATED_AT);
    expect(typeof arg.expectedUpdatedAt).toBe("string");
    expect(arg.expectedUpdatedAt).not.toBeInstanceOf(Date);
  });

  it("rejects a payload without any mutable field", async () => {
    const result = await updateTableAction(updatePayload({ code: undefined }));

    expect(result).toEqual(invalidFailure());
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("rejects an isActive field", async () => {
    const result = await updateTableAction(updatePayload({ isActive: false }));

    expect(result).toEqual(invalidFailure());
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("rejects qrTokenHash, tenantId and userId fields", async () => {
    for (const foreign of [
      { qrTokenHash: "token-evil" },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
    ]) {
      const result = await updateTableAction(updatePayload(foreign));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("rejects an invalid expectedUpdatedAt timestamp", async () => {
    const result = await updateTableAction(updatePayload({ expectedUpdatedAt: "not-a-date" }));

    expect(result).toEqual(invalidFailure());
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("maps TABLE_NOT_FOUND from the service", async () => {
    await expectDomainFailure(updateTableAction, updatePayload(), "TABLE_NOT_FOUND", mockedUpdate);
  });

  it("maps TABLE_CODE_CONFLICT from the service", async () => {
    await expectDomainFailure(
      updateTableAction,
      updatePayload(),
      "TABLE_CODE_CONFLICT",
      mockedUpdate
    );
  });

  it("maps TABLE_VERSION_CONFLICT from the service", async () => {
    await expectDomainFailure(
      updateTableAction,
      updatePayload(),
      "TABLE_VERSION_CONFLICT",
      mockedUpdate
    );
  });

  it("returns the exact success summary", async () => {
    const result = await updateTableAction(updatePayload({ capacity: 8 }));

    expect(result).toEqual({
      ok: true,
      data: tableSummary({ code: "T02", capacity: 8, updatedAt: MUTATED_AT }),
    });
    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(typeof result.data.updatedAt).toBe("string");
    }
  });
});

describe("deactivateTableAction", () => {
  it("passes the valid payload to the service exactly once", async () => {
    const result = await deactivateTableAction(targetPayload());

    expect(mockedDeactivate).toHaveBeenCalledTimes(1);
    expect(mockedDeactivate).toHaveBeenCalledWith({
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(result).toEqual({
      ok: true,
      data: tableSummary({ isActive: false, updatedAt: MUTATED_AT }),
    });
  });

  it("rejects a missing expectedUpdatedAt", async () => {
    const result = await deactivateTableAction(targetPayload({ expectedUpdatedAt: undefined }));

    expect(result).toEqual(invalidFailure());
    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it("rejects an invalid expectedUpdatedAt timestamp", async () => {
    const result = await deactivateTableAction(targetPayload({ expectedUpdatedAt: "not-a-date" }));

    expect(result).toEqual(invalidFailure());
    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it("rejects code, capacity, isActive and other foreign fields", async () => {
    for (const foreign of [
      { code: "T02" },
      { capacity: 4 },
      { isActive: false },
      { qrTokenHash: "token-evil" },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
    ]) {
      const result = await deactivateTableAction(targetPayload(foreign));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedDeactivate).not.toHaveBeenCalled();
  });

  it("maps TABLE_NOT_FOUND from the service", async () => {
    await expectDomainFailure(
      deactivateTableAction,
      targetPayload(),
      "TABLE_NOT_FOUND",
      mockedDeactivate
    );
  });

  it("maps TABLE_VERSION_CONFLICT from the service", async () => {
    await expectDomainFailure(
      deactivateTableAction,
      targetPayload(),
      "TABLE_VERSION_CONFLICT",
      mockedDeactivate
    );
  });

  it("maps TABLE_STATE_CONFLICT from the service", async () => {
    await expectDomainFailure(
      deactivateTableAction,
      targetPayload(),
      "TABLE_STATE_CONFLICT",
      mockedDeactivate
    );
  });

  it("returns a success summary with isActive false", async () => {
    const result = await deactivateTableAction(targetPayload());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.isActive).toBe(false);
      expect(result.data.updatedAt).toBe(MUTATED_AT);
      expect(Object.keys(result.data).sort()).toEqual([
        "capacity",
        "code",
        "id",
        "isActive",
        "updatedAt",
      ]);
    }
  });
});

describe("reactivateTableAction", () => {
  it("passes the valid payload to the service exactly once", async () => {
    const result = await reactivateTableAction(targetPayload());

    expect(mockedReactivate).toHaveBeenCalledTimes(1);
    expect(mockedReactivate).toHaveBeenCalledWith({
      outletId: "outlet-1",
      tableId: "table-1",
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(result).toEqual({
      ok: true,
      data: tableSummary({ isActive: true, updatedAt: MUTATED_AT }),
    });
  });

  it("rejects strict foreign fields without calling the service", async () => {
    for (const foreign of [
      { isActive: true },
      { code: "T02" },
      { capacity: 4 },
      { qrTokenHash: "token-evil" },
      { tenantId: "evil-tenant" },
      { userId: "evil-user" },
      { permission: "tables.manage" },
      { expectedUpdatedAt: undefined },
    ]) {
      const result = await reactivateTableAction(targetPayload(foreign));

      expect(result).toEqual(invalidFailure());
    }

    expect(mockedReactivate).not.toHaveBeenCalled();
  });

  it("maps TABLE_CODE_CONFLICT from the service", async () => {
    await expectDomainFailure(
      reactivateTableAction,
      targetPayload(),
      "TABLE_CODE_CONFLICT",
      mockedReactivate
    );
  });

  it("maps TABLE_VERSION_CONFLICT from the service", async () => {
    await expectDomainFailure(
      reactivateTableAction,
      targetPayload(),
      "TABLE_VERSION_CONFLICT",
      mockedReactivate
    );
  });

  it("maps TABLE_STATE_CONFLICT from the service", async () => {
    await expectDomainFailure(
      reactivateTableAction,
      targetPayload(),
      "TABLE_STATE_CONFLICT",
      mockedReactivate
    );
  });

  it("returns a success summary with isActive true", async () => {
    const result = await reactivateTableAction(targetPayload());

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.updatedAt).toBe(MUTATED_AT);
      expect(Object.keys(result.data).sort()).toEqual([
        "capacity",
        "code",
        "id",
        "isActive",
        "updatedAt",
      ]);
    }
  });
});

describe("generateTableTokenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGenerateQrToken.mockResolvedValue("secret-token-123");
  });

  it("returns INVALID_INPUT when payload is invalid", async () => {
    const result = await generateTableTokenAction({ outletId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_INPUT");
    }
  });

  it("returns token on success", async () => {
    const result = await generateTableTokenAction({ outletId: "outlet-1", tableId: "table-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ token: "secret-token-123" });
    }
  });

  it("handles service domain errors", async () => {
    mockedGenerateQrToken.mockRejectedValueOnce(new OrderDomainError("TABLE_NOT_FOUND"));
    const result = await generateTableTokenAction({ outletId: "outlet-1", tableId: "table-99" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TABLE_NOT_FOUND");
    }
  });
});
