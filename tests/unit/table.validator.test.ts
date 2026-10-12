import { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { MAX_TABLE_CODE, MAX_TABLE_CAPACITY, MIN_TABLE_CAPACITY } from "@/lib/order/constants";
import {
  tableCreateSchema,
  tableDeactivateSchema,
  tableReactivateSchema,
  tableUpdateSchema,
  generateTableTokenSchema,
  type TableCreateInput,
  type TableDeactivateInput,
  type TableReactivateInput,
  type TableUpdateInput,
  type GenerateTableTokenInput,
} from "@/lib/validators/table.validator";

const NOW_ISO = "2026-10-01T10:00:00.000Z";

function tableCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { outletId: "outlet-1", code: "T01", ...overrides };
}

function tableUpdatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function tableTargetPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    outletId: "outlet-1",
    tableId: "table-1",
    expectedUpdatedAt: NOW_ISO,
    ...overrides,
  };
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error("expected payload to parse");
  }
  return result.data;
}

function expectRejected(schema: z.ZodTypeAny, payload: unknown): void {
  expect(schema.safeParse(payload).success).toBe(false);
}

const ALL_SCHEMAS: Array<[z.ZodTypeAny, Record<string, unknown>]> = [
  [tableCreateSchema, tableCreatePayload()],
  [tableUpdateSchema, tableUpdatePayload({ code: "T01" })],
  [tableDeactivateSchema, tableTargetPayload()],
  [tableReactivateSchema, tableTargetPayload()],
];

describe("table validator - shared primitives", () => {
  it("trims identifier fields", () => {
    expect(
      parseOrThrow(tableCreateSchema, tableCreatePayload({ outletId: "  outlet-1  " })).outletId
    ).toBe("outlet-1");
    expect(
      parseOrThrow(tableUpdateSchema, tableUpdatePayload({ tableId: "  table-1  ", code: "T01" }))
        .tableId
    ).toBe("table-1");
    expect(
      parseOrThrow(tableDeactivateSchema, tableTargetPayload({ outletId: " outlet-1 " })).outletId
    ).toBe("outlet-1");
    expect(
      parseOrThrow(tableReactivateSchema, tableTargetPayload({ tableId: "  table-1  " })).tableId
    ).toBe("table-1");
  });

  it("rejects empty or whitespace-only identifiers on every schema", () => {
    for (const emptyId of ["", "   "]) {
      expectRejected(tableCreateSchema, tableCreatePayload({ outletId: emptyId }));
      expectRejected(tableUpdateSchema, tableUpdatePayload({ outletId: emptyId, code: "T01" }));
      expectRejected(tableUpdateSchema, tableUpdatePayload({ tableId: emptyId, code: "T01" }));
      expectRejected(tableDeactivateSchema, tableTargetPayload({ outletId: emptyId }));
      expectRejected(tableDeactivateSchema, tableTargetPayload({ tableId: emptyId }));
      expectRejected(tableReactivateSchema, tableTargetPayload({ outletId: emptyId }));
      expectRejected(tableReactivateSchema, tableTargetPayload({ tableId: emptyId }));
    }
  });

  it("rejects non-string identifiers on every schema", () => {
    for (const badId of [42, null, { id: "table-1" }, ["table-1"], true]) {
      expectRejected(tableCreateSchema, tableCreatePayload({ outletId: badId }));
      expectRejected(tableUpdateSchema, tableUpdatePayload({ tableId: badId, code: "T01" }));
      expectRejected(tableDeactivateSchema, tableTargetPayload({ outletId: badId }));
      expectRejected(tableReactivateSchema, tableTargetPayload({ tableId: badId }));
    }
  });

  it("rejects foreign fields on every schema", () => {
    const foreignKeys = [
      "id",
      "tenantId",
      "userId",
      "permission",
      "qrTokenHash",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "name",
      "label",
      "sortOrder",
      "options",
    ];

    for (const [schema, payload] of ALL_SCHEMAS) {
      for (const foreignKey of foreignKeys) {
        expect(schema.safeParse({ ...payload, [foreignKey]: "x" }).success).toBe(false);
      }
      expect(schema.safeParse({ ...payload, unknownField: true }).success).toBe(false);
    }
  });

  it("rejects tableId and expectedUpdatedAt on create", () => {
    expectRejected(tableCreateSchema, tableCreatePayload({ tableId: "table-1" }));
    expectRejected(tableCreateSchema, tableCreatePayload({ expectedUpdatedAt: NOW_ISO }));
    expectRejected(
      tableCreateSchema,
      tableCreatePayload({ tableId: "table-1", expectedUpdatedAt: NOW_ISO })
    );
  });

  it("keeps a toISOString expectedUpdatedAt value as a string", () => {
    const data = parseOrThrow(tableUpdateSchema, tableUpdatePayload({ code: "T01" }));
    expect(typeof data.expectedUpdatedAt).toBe("string");
    expect(data.expectedUpdatedAt).toBe(NOW_ISO);

    const targetData = parseOrThrow(tableDeactivateSchema, tableTargetPayload());
    expect(typeof targetData.expectedUpdatedAt).toBe("string");
    expect(targetData.expectedUpdatedAt).toBe(NOW_ISO);
  });

  it("rejects invalid ISO timestamps", () => {
    for (const badTimestamp of [
      "",
      "not-a-date",
      "2026-10-01",
      "2026-10-01T10:00:00",
      "2026-10-01T10:00:00+07:00",
      "2026-10-01T10:00:00.000+07:00",
      "2026-13-01T00:00:00Z",
      "2026-02-30T00:00:00Z",
      "2026-10-01T25:00:00Z",
      "2026-10-01T10:61:00Z",
      "10/01/2026",
    ]) {
      expectRejected(
        tableUpdateSchema,
        tableUpdatePayload({ code: "T01", expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        tableDeactivateSchema,
        tableTargetPayload({ expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        tableReactivateSchema,
        tableTargetPayload({ expectedUpdatedAt: badTimestamp })
      );
    }
  });

  it("rejects non-string expectedUpdatedAt values", () => {
    for (const badTimestamp of [1_765_000_000_000, new Date(), null, undefined, {}]) {
      expectRejected(
        tableUpdateSchema,
        tableUpdatePayload({ code: "T01", expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        tableDeactivateSchema,
        tableTargetPayload({ expectedUpdatedAt: badTimestamp })
      );
      expectRejected(
        tableReactivateSchema,
        tableTargetPayload({ expectedUpdatedAt: badTimestamp })
      );
    }
  });

  it("rejects row mutations without expectedUpdatedAt", () => {
    expectRejected(tableUpdateSchema, { outletId: "outlet-1", tableId: "table-1", code: "T01" });
    expectRejected(tableDeactivateSchema, { outletId: "outlet-1", tableId: "table-1" });
    expectRejected(tableReactivateSchema, { outletId: "outlet-1", tableId: "table-1" });
    expectRejected(tableUpdateSchema, {
      ...tableUpdatePayload({ code: "T01" }),
      expectedUpdatedAt: undefined,
    });
  });
});

describe("table validator - code normalization", () => {
  it("keeps an already uppercase code", () => {
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "T01" })).code).toBe("T01");
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "LANTAI2_A" })).code).toBe(
      "LANTAI2_A"
    );
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "01" })).code).toBe("01");
  });

  it("uppercases a lowercase code", () => {
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "t01" })).code).toBe("T01");
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "vip-01" })).code).toBe(
      "VIP-01"
    );
  });

  it("uppercases a mixed case code", () => {
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "Ta01" })).code).toBe("TA01");
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "lAntai2_a" })).code).toBe(
      "LANTAI2_A"
    );
  });

  it("trims leading and trailing whitespace before normalizing", () => {
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "  t01  " })).code).toBe(
      "T01"
    );
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: " A " })).code).toBe("A");
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: "\tT01\n" })).code).toBe(
      "T01"
    );
  });

  it("accepts every documented valid example", () => {
    const accepted: Array<[string, string]> = [
      ["T01", "T01"],
      ["t01", "T01"],
      ["vip-01", "VIP-01"],
      ["LANTAI2_A", "LANTAI2_A"],
      ["01", "01"],
    ];
    for (const [input, expected] of accepted) {
      const data = parseOrThrow(tableCreateSchema, tableCreatePayload({ code: input }));
      expect(data.code).toBe(expected);
      expect(data.code).toMatch(/^[A-Z0-9][A-Z0-9_-]*$/);
    }
  });

  it("rejects every documented invalid example", () => {
    const rejected: Array<[string, string]> = [
      ["A 1", "interior space"],
      ["A B", "interior space"],
      ["A.B", "dot"],
      ["A/B", "slash"],
      ["A\\B", "backslash"],
      ["T0\n1", "newline"],
      ["T0\u00001", "control character"],
      ["T0\u0007", "control character"],
      ["T0🫠", "emoji"],
      ["🫠", "emoji only"],
      ["_A", "leading underscore"],
      ["-A", "leading hyphen"],
      ["", "empty"],
      ["   ", "whitespace only"],
      ["A".repeat(MAX_TABLE_CODE + 1), "too long"],
      ["kode meja", "interior space"],
    ];
    for (const [input, reason] of rejected) {
      expect(tableCreateSchema.safeParse({ outletId: "outlet-1", code: input }).success).toBe(
        false
      );
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  it("accepts code lengths 1 and 30 and rejects 31", () => {
    const one = "A".repeat(1);
    const max = "A".repeat(MAX_TABLE_CODE);
    const over = "A".repeat(MAX_TABLE_CODE + 1);

    expect(one).toHaveLength(1);
    expect(max).toHaveLength(MAX_TABLE_CODE);
    expect(over).toHaveLength(31);

    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: one })).code).toBe(one);
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ code: max })).code).toBe(max);
    expectRejected(tableCreateSchema, tableCreatePayload({ code: over }));
  });

  it("does not coerce a number into a code string", () => {
    for (const badCode of [123, 0, 42, true, null, ["T01"], { code: "T01" }]) {
      expectRejected(tableCreateSchema, tableCreatePayload({ code: badCode }));
      expectRejected(tableUpdateSchema, tableUpdatePayload({ code: badCode }));
    }
  });

  it("normalizes code on update as well", () => {
    expect(parseOrThrow(tableUpdateSchema, tableUpdatePayload({ code: "  vip-01 " })).code).toBe(
      "VIP-01"
    );
    expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "A 1" }));
    expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "" }));
  });
});

describe("table validator - capacity", () => {
  it("accepts the boundary values", () => {
    expect(
      parseOrThrow(tableCreateSchema, tableCreatePayload({ capacity: MIN_TABLE_CAPACITY })).capacity
    ).toBe(MIN_TABLE_CAPACITY);
    expect(
      parseOrThrow(tableCreateSchema, tableCreatePayload({ capacity: MAX_TABLE_CAPACITY })).capacity
    ).toBe(MAX_TABLE_CAPACITY);
    expect(parseOrThrow(tableCreateSchema, tableCreatePayload({ capacity: 4 })).capacity).toBe(4);
    expect(parseOrThrow(tableUpdateSchema, tableUpdatePayload({ capacity: 1 })).capacity).toBe(1);
  });

  it("rejects out of range, non-integer and non-number values", () => {
    for (const badCapacity of [
      0,
      100,
      -1,
      -99,
      1.5,
      4.000_000_1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "4",
      "99",
      true,
      null,
    ]) {
      expectRejected(tableCreateSchema, tableCreatePayload({ capacity: badCapacity }));
      expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "T01", capacity: badCapacity }));
    }
  });
});

describe("tableCreateSchema", () => {
  it("accepts a minimum valid payload", () => {
    const data = parseOrThrow(tableCreateSchema, { outletId: "outlet-1", code: "T01" });
    expect(data.outletId).toBe("outlet-1");
    expect(data.code).toBe("T01");
  });

  it("accepts optional capacity and isActive", () => {
    const data = parseOrThrow(
      tableCreateSchema,
      tableCreatePayload({ capacity: 6, isActive: true })
    );
    expect(data.capacity).toBe(6);
    expect(data.isActive).toBe(true);
  });

  it("keeps isActive false without truthiness loss", () => {
    const data = parseOrThrow(tableCreateSchema, tableCreatePayload({ isActive: false }));
    expect(data.isActive).toBe(false);
  });

  it("leaves missing optionals undefined", () => {
    const data = parseOrThrow(tableCreateSchema, tableCreatePayload());
    expect(data.capacity).toBeUndefined();
    expect(data.isActive).toBeUndefined();
    expect(data).not.toHaveProperty("capacity");
    expect(data).not.toHaveProperty("isActive");
  });

  it("rejects expectedUpdatedAt, tableId, qrTokenHash and other foreign fields", () => {
    for (const foreignKey of [
      "tableId",
      "expectedUpdatedAt",
      "id",
      "tenantId",
      "userId",
      "qrTokenHash",
      "createdAt",
      "updatedAt",
      "deletedAt",
      "name",
      "sortOrder",
    ]) {
      expectRejected(
        tableCreateSchema,
        tableCreatePayload({ [foreignKey]: foreignKey === "id" ? "table-1" : "x" })
      );
    }
  });

  it("rejects non-boolean isActive values", () => {
    for (const badIsActive of ["true", "false", 1, 0, null, "yes"]) {
      expectRejected(tableCreateSchema, tableCreatePayload({ isActive: badIsActive }));
    }
  });
});

describe("tableUpdateSchema", () => {
  it("accepts a payload that only changes code", () => {
    const data = parseOrThrow(tableUpdateSchema, tableUpdatePayload({ code: "T02" }));
    expect(data.code).toBe("T02");
    expect(data.capacity).toBeUndefined();
  });

  it("accepts a payload that only changes capacity to 1", () => {
    const data = parseOrThrow(tableUpdateSchema, tableUpdatePayload({ capacity: 1 }));
    expect(data.capacity).toBe(1);
    expect(data.code).toBeUndefined();
    expect(data).not.toHaveProperty("code");
  });

  it("accepts a payload that changes code and capacity", () => {
    const data = parseOrThrow(
      tableUpdateSchema,
      tableUpdatePayload({ code: "lantai2_b", capacity: 12 })
    );
    expect(data.code).toBe("LANTAI2_B");
    expect(data.capacity).toBe(12);
  });

  it("rejects a payload without any mutable field", () => {
    expectRejected(tableUpdateSchema, tableUpdatePayload());
  });

  it("does not count outletId, tableId or expectedUpdatedAt as mutable", () => {
    expectRejected(tableUpdateSchema, {
      outletId: "outlet-2",
      tableId: "table-2",
      expectedUpdatedAt: "2026-10-02T10:00:00.000Z",
    });
  });

  it("rejects isActive on an ordinary update", () => {
    expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "T01", isActive: false }));
    expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "T01", isActive: true }));
    expectRejected(tableUpdateSchema, tableUpdatePayload({ isActive: false }));
  });

  it("rejects foreign fields even with falsey values", () => {
    for (const foreignPayload of [
      { isActive: false },
      { sortOrder: 0 },
      { qrTokenHash: null },
      { deletedAt: null },
      { name: "" },
      { label: null },
    ]) {
      expect(
        tableUpdateSchema.safeParse({ ...tableUpdatePayload({ code: "T01" }), ...foreignPayload })
          .success
      ).toBe(false);
    }
  });

  it("requires expectedUpdatedAt", () => {
    expectRejected(tableUpdateSchema, { outletId: "outlet-1", tableId: "table-1", code: "T01" });
    expectRejected(tableUpdateSchema, {
      ...tableUpdatePayload({ code: "T01" }),
      expectedUpdatedAt: "",
    });
  });

  it("rejects a mutable value that fails its own rule", () => {
    expectRejected(tableUpdateSchema, tableUpdatePayload({ code: "A 1" }));
    expectRejected(tableUpdateSchema, tableUpdatePayload({ capacity: 100 }));
  });
});

describe("tableDeactivateSchema and tableReactivateSchema", () => {
  const lifecycleSchemas: Array<z.ZodTypeAny> = [tableDeactivateSchema, tableReactivateSchema];

  it("accepts a valid payload on both schemas", () => {
    for (const schema of lifecycleSchemas) {
      const data = parseOrThrow(schema, tableTargetPayload());
      expect(data.outletId).toBe("outlet-1");
      expect(data.tableId).toBe("table-1");
      expect(data.expectedUpdatedAt).toBe(NOW_ISO);
      expect(Object.keys(data).sort()).toEqual(["expectedUpdatedAt", "outletId", "tableId"]);
    }
  });

  it("requires expectedUpdatedAt on both schemas", () => {
    for (const schema of lifecycleSchemas) {
      expectRejected(schema, { outletId: "outlet-1", tableId: "table-1" });
      expectRejected(schema, { ...tableTargetPayload(), expectedUpdatedAt: undefined });
    }
  });

  it("rejects code, capacity, isActive and qrTokenHash on both schemas", () => {
    for (const schema of lifecycleSchemas) {
      expectRejected(schema, tableTargetPayload({ code: "T01" }));
      expectRejected(schema, tableTargetPayload({ capacity: 4 }));
      expectRejected(schema, tableTargetPayload({ isActive: false }));
      expectRejected(schema, tableTargetPayload({ qrTokenHash: null }));
    }
  });

  it("rejects unknown fields on both schemas", () => {
    for (const schema of lifecycleSchemas) {
      expectRejected(schema, tableTargetPayload({ reason: "closed" }));
      expectRejected(schema, tableTargetPayload({ id: "table-1" }));
      expectRejected(schema, tableTargetPayload({ tenantId: "tenant-1" }));
    }
  });

  it("trims identifiers on both schemas", () => {
    for (const schema of lifecycleSchemas) {
      const data = parseOrThrow(schema, tableTargetPayload());
      expect(data.outletId).toBe("outlet-1");

      const trimmed = parseOrThrow(
        schema,
        tableTargetPayload({ outletId: "  outlet-1  ", tableId: "  table-1  " })
      );
      expect(trimmed.outletId).toBe("outlet-1");
      expect(trimmed.tableId).toBe("table-1");
    }
  });
});

describe("table validator - exported types", () => {
  it("infers plain string, number and boolean field types without a Date conversion", () => {
    expectTypeOf<TableCreateInput["outletId"]>().toEqualTypeOf<string>();
    expectTypeOf<TableCreateInput["code"]>().toEqualTypeOf<string>();
    expectTypeOf<TableCreateInput["capacity"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<TableCreateInput["isActive"]>().toEqualTypeOf<boolean | undefined>();

    expectTypeOf<TableUpdateInput["tableId"]>().toEqualTypeOf<string>();
    expectTypeOf<TableUpdateInput["expectedUpdatedAt"]>().toEqualTypeOf<string>();
    expectTypeOf<TableUpdateInput["code"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<TableUpdateInput["capacity"]>().toEqualTypeOf<number | undefined>();

    expectTypeOf<TableDeactivateInput["expectedUpdatedAt"]>().toEqualTypeOf<string>();
    expectTypeOf<TableReactivateInput["tableId"]>().toEqualTypeOf<string>();
    expectTypeOf<TableReactivateInput["expectedUpdatedAt"]>().toEqualTypeOf<string>();
    expectTypeOf<GenerateTableTokenInput["outletId"]>().toEqualTypeOf<string>();
    expectTypeOf<GenerateTableTokenInput["tableId"]>().toEqualTypeOf<string>();
  });
});

describe("generateTableTokenSchema validator", () => {
  it("parses valid token generation payload", () => {
    const data = parseOrThrow(generateTableTokenSchema, { outletId: "outlet-1", tableId: "table-1" });
    expect(data).toEqual({ outletId: "outlet-1", tableId: "table-1" });
  });

  it("trims outletId and tableId", () => {
    const data = parseOrThrow(generateTableTokenSchema, { outletId: "  outlet-1  ", tableId: "  table-1  " });
    expect(data).toEqual({ outletId: "outlet-1", tableId: "table-1" });
  });

  it("rejects missing or empty identifiers", () => {
    expectRejected(generateTableTokenSchema, { outletId: "", tableId: "table-1" });
    expectRejected(generateTableTokenSchema, { outletId: "outlet-1", tableId: "" });
    expectRejected(generateTableTokenSchema, { outletId: "   ", tableId: "table-1" });
  });

  it("rejects foreign fields", () => {
    expectRejected(generateTableTokenSchema, { outletId: "outlet-1", tableId: "table-1", expectedUpdatedAt: NOW_ISO });
    expectRejected(generateTableTokenSchema, { outletId: "outlet-1", tableId: "table-1", code: "T01" });
  });
});
