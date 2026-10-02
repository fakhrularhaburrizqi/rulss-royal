import { describe, expect, it } from "vitest";

import {
  isCatalogNameUniqueViolation,
  isOrderNumberUniqueViolation,
  isTableCodeUniqueViolation,
  OrderDomainError,
  getOrderErrorMessage,
  toOrderError,
} from "@/lib/order/errors";
import type { OrderErrorCode } from "@/lib/order/errors";

const ALL_CODES: readonly OrderErrorCode[] = [
  "UNAUTHENTICATED",
  "OUTLET_NOT_FOUND",
  "OUTLET_ACCESS_DENIED",
  "INVALID_INPUT",
  "AMOUNT_OUT_OF_RANGE",
  "MENU_ITEM_UNAVAILABLE",
  "TABLE_REQUIRED",
  "TABLE_NOT_FOUND",
  "TABLE_CODE_CONFLICT",
  "TABLE_VERSION_CONFLICT",
  "TABLE_STATE_CONFLICT",
  "ORDER_NOT_FOUND",
  "INVALID_TRANSITION",
  "VERSION_CONFLICT",
  "ORDER_LIMIT_REACHED",
  "ORDER_NUMBER_CONFLICT",
  "INTERNAL_ERROR",
  "CATEGORY_NOT_FOUND",
  "MENU_ITEM_NOT_FOUND",
  "CATEGORY_NAME_CONFLICT",
  "MENU_NAME_CONFLICT",
  "CATEGORY_NOT_AVAILABLE",
  "CATALOG_VERSION_CONFLICT",
  "CATALOG_STATE_CONFLICT",
];

function p2002(target: unknown): unknown {
  return { code: "P2002", meta: { target } };
}

describe("Order Errors", () => {
  it("provides a safe message for every error code", () => {
    expect(ALL_CODES).toHaveLength(24);
    for (const code of ALL_CODES) {
      const message = getOrderErrorMessage(code);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/prisma|constraint|sql|stack|query/i);
    }
  });

  it("keeps the pre-existing table codes in the union with their exact messages", () => {
    expect(ALL_CODES).toContain("TABLE_REQUIRED");
    expect(ALL_CODES).toContain("TABLE_NOT_FOUND");
    expect(getOrderErrorMessage("TABLE_REQUIRED")).toBe(
      "Nomor meja wajib diisi untuk pesanan ini."
    );
    expect(getOrderErrorMessage("TABLE_NOT_FOUND")).toBe("Meja tidak ditemukan.");
  });

  it("provides the exact safe messages for the three table codes", () => {
    const expected: Readonly<Record<string, string>> = {
      TABLE_CODE_CONFLICT: "Kode meja sudah digunakan di outlet ini.",
      TABLE_VERSION_CONFLICT:
        "Data meja telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
      TABLE_STATE_CONFLICT: "Status meja tidak sesuai untuk operasi ini. Muat ulang data terbaru.",
    };

    expect(Object.keys(expected)).toHaveLength(3);
    for (const code of Object.keys(expected)) {
      expect(ALL_CODES).toContain(code as OrderErrorCode);
    }
    for (const [code, message] of Object.entries(expected)) {
      expect(getOrderErrorMessage(code as OrderErrorCode)).toBe(message);
      expect(message).not.toMatch(/prisma|constraint|sql|stack|query/i);
    }
  });

  it("does not reuse a catalog message for a table code", () => {
    expect(getOrderErrorMessage("TABLE_VERSION_CONFLICT")).not.toBe(
      getOrderErrorMessage("CATALOG_VERSION_CONFLICT")
    );
    expect(getOrderErrorMessage("TABLE_STATE_CONFLICT")).not.toBe(
      getOrderErrorMessage("CATALOG_STATE_CONFLICT")
    );
    expect(getOrderErrorMessage("TABLE_CODE_CONFLICT")).not.toBe(
      getOrderErrorMessage("MENU_NAME_CONFLICT")
    );
  });

  it("provides the exact safe messages for the seven catalog codes", () => {
    const expected: Readonly<Record<string, string>> = {
      CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
      MENU_ITEM_NOT_FOUND: "Menu tidak ditemukan.",
      CATEGORY_NAME_CONFLICT: "Nama kategori sudah digunakan di outlet ini.",
      MENU_NAME_CONFLICT: "Nama menu sudah digunakan di outlet ini.",
      CATEGORY_NOT_AVAILABLE: "Kategori tidak tersedia untuk digunakan.",
      CATALOG_VERSION_CONFLICT:
        "Data katalog telah diperbarui oleh pengguna lain. Muat ulang data terbaru.",
      CATALOG_STATE_CONFLICT:
        "Status katalog tidak sesuai untuk operasi ini. Muat ulang data terbaru.",
    };

    expect(Object.keys(expected)).toHaveLength(7);
    for (const [code, message] of Object.entries(expected)) {
      expect(getOrderErrorMessage(code as OrderErrorCode)).toBe(message);
      expect(message).not.toMatch(/prisma|constraint|sql|stack|query/i);
    }
  });

  it("keeps the internal error message generic", () => {
    const message = getOrderErrorMessage("INTERNAL_ERROR");
    expect(message).toBe("Terjadi kesalahan. Silakan coba lagi.");
    expect(message.toLowerCase()).not.toContain("prisma");
    expect(message.toLowerCase()).not.toContain("constraint");
    expect(message.toLowerCase()).not.toContain("sql");
    expect(message.toLowerCase()).not.toContain("stack");
  });

  it("preserves the code and identity of OrderDomainError", () => {
    const error = new OrderDomainError("VERSION_CONFLICT");
    expect(error).toBeInstanceOf(OrderDomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("OrderDomainError");
    expect(error.code).toBe("VERSION_CONFLICT");
    expect(error.message).toBe(getOrderErrorMessage("VERSION_CONFLICT"));
  });

  it("preserves an existing OrderDomainError in toOrderError", () => {
    const original = new OrderDomainError("ORDER_NOT_FOUND");
    expect(toOrderError(original)).toBe(original);
  });

  it("maps Prisma P2020 to AMOUNT_OUT_OF_RANGE as a fallback", () => {
    const mapped = toOrderError({ code: "P2020", meta: {} });
    expect(mapped).toBeInstanceOf(OrderDomainError);
    expect(mapped.code).toBe("AMOUNT_OUT_OF_RANGE");
  });

  it("maps Prisma P2003 to INVALID_INPUT", () => {
    const mapped = toOrderError({ code: "P2003" });
    expect(mapped.code).toBe("INVALID_INPUT");
  });

  it("does not auto-map a catalog P2002 violation in toOrderError", () => {
    for (const target of [
      ["tenantId", "outletId", "name"],
      "MenuCategory_tenantId_outletId_name_key",
      "MenuItem_tenantId_outletId_name_key",
    ]) {
      const violation = { code: "P2002", meta: { target } };
      const mapped = toOrderError(violation);
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
      expect(isCatalogNameUniqueViolation(violation)).toBe(true);
    }
  });

  it("does not auto-map a table P2002 violation in toOrderError", () => {
    for (const target of [
      ["outletId", "code"],
      "DiningTable_outletId_code_key",
      "outletId,code",
      "(outletId,code)",
    ]) {
      const violation = { code: "P2002", meta: { target } };
      const mapped = toOrderError(violation);
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
      expect(mapped.message).not.toContain("Kode meja");
      expect(isTableCodeUniqueViolation(violation)).toBe(true);
    }
  });

  it("maps unknown errors to INTERNAL_ERROR without leaking details", () => {
    for (const input of [
      new Error("connection string postgres://user:secret@host/db"),
      "P2002",
      null,
      undefined,
      { code: "P2001" },
      { code: 500 },
    ]) {
      const mapped = toOrderError(input);
      expect(mapped).toBeInstanceOf(OrderDomainError);
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.message).toBe(getOrderErrorMessage("INTERNAL_ERROR"));
      expect(mapped.message).not.toContain("secret");
    }
  });

  describe("isOrderNumberUniqueViolation", () => {
    it("accepts the composite field array target", () => {
      expect(isOrderNumberUniqueViolation(p2002(["tenantId", "outletId", "orderNumber"]))).toBe(
        true
      );
      expect(
        isOrderNumberUniqueViolation(p2002(["public", "tenantId", "outletId", "orderNumber"]))
      ).toBe(true);
    });

    it("accepts the exact composite constraint name case-insensitively", () => {
      expect(
        isOrderNumberUniqueViolation(p2002("CustomerOrder_tenantId_outletId_orderNumber_key"))
      ).toBe(true);
      expect(
        isOrderNumberUniqueViolation(p2002("customerorder_tenantid_outletid_ordernumber_key"))
      ).toBe(true);
      expect(
        isOrderNumberUniqueViolation(
          p2002('CREATE UNIQUE INDEX "CustomerOrder_tenantId_outletId_orderNumber_key"')
        )
      ).toBe(true);
    });

    it("accepts a string that normalizes to the three composite fields", () => {
      expect(isOrderNumberUniqueViolation(p2002("tenantId,outletId,orderNumber"))).toBe(true);
      expect(isOrderNumberUniqueViolation(p2002("(tenantId,outletId,orderNumber)"))).toBe(true);
    });

    it("rejects targets that only mention orderNumber without the composite", () => {
      expect(isOrderNumberUniqueViolation(p2002(["orderNumber"]))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002("orderNumber"))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002(["outletId", "orderNumber"]))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002(["tenantId", "orderNumber"]))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002("SomeOrder_number_key"))).toBe(false);
    });

    it("rejects other unique constraints", () => {
      expect(isOrderNumberUniqueViolation(p2002(["tenantId", "outletId", "name"]))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002("User_tenantId_email_key"))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002("MenuItem_tenantId_outletId_name_key"))).toBe(
        false
      );
    });

    it("rejects empty, null, missing, or foreign-shaped targets", () => {
      expect(isOrderNumberUniqueViolation(p2002(""))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002([]))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002(null))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002(undefined))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002(42))).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002({ orderNumber: true }))).toBe(false);
      expect(isOrderNumberUniqueViolation({ code: "P2002" })).toBe(false);
      expect(isOrderNumberUniqueViolation({ code: "P2002", meta: null })).toBe(false);
      expect(isOrderNumberUniqueViolation({ code: "P2002", meta: "x" })).toBe(false);
    });

    it("rejects non-P2002 errors and non-error inputs", () => {
      expect(isOrderNumberUniqueViolation({ code: "P2003" })).toBe(false);
      expect(isOrderNumberUniqueViolation(new Error("boom"))).toBe(false);
      expect(isOrderNumberUniqueViolation(null)).toBe(false);
      expect(isOrderNumberUniqueViolation(undefined)).toBe(false);
      expect(isOrderNumberUniqueViolation("P2002")).toBe(false);
    });

    it("works without any database connection", () => {
      expect(isOrderNumberUniqueViolation(p2002(["tenantId", "outletId", "orderNumber"]))).toBe(
        true
      );
    });
  });

  describe("isCatalogNameUniqueViolation", () => {
    it("accepts the composite field array target", () => {
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId", "name"]))).toBe(true);
    });

    it("accepts the composite fields in any order", () => {
      expect(isCatalogNameUniqueViolation(p2002(["name", "tenantId", "outletId"]))).toBe(true);
      expect(isCatalogNameUniqueViolation(p2002(["outletId", "name", "tenantId"]))).toBe(true);
    });

    it("accepts the MenuCategory and MenuItem composite constraint names", () => {
      expect(isCatalogNameUniqueViolation(p2002("MenuCategory_tenantId_outletId_name_key"))).toBe(
        true
      );
      expect(isCatalogNameUniqueViolation(p2002("MenuItem_tenantId_outletId_name_key"))).toBe(true);
    });

    it("accepts constraint names case-insensitively", () => {
      expect(isCatalogNameUniqueViolation(p2002("menucategory_tenantid_outletid_name_key"))).toBe(
        true
      );
      expect(isCatalogNameUniqueViolation(p2002("MENUITEM_TENANTID_OUTLETID_NAME_KEY"))).toBe(true);
    });

    it("accepts a clear string composite of the three fields", () => {
      expect(isCatalogNameUniqueViolation(p2002("tenantId,outletId,name"))).toBe(true);
      expect(isCatalogNameUniqueViolation(p2002("(tenantId,outletId,name)"))).toBe(true);
      expect(isCatalogNameUniqueViolation(p2002("name|outletId|tenantId"))).toBe(true);
    });

    it("rejects a single name target", () => {
      expect(isCatalogNameUniqueViolation(p2002(["name"]))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002("name"))).toBe(false);
    });

    it("rejects partial composites with only two fields", () => {
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "name"]))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(["outletId", "name"]))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId"]))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002("tenantId,name"))).toBe(false);
    });

    it("rejects composites carrying an extra field", () => {
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId", "name", "id"]))).toBe(
        false
      );
      expect(isCatalogNameUniqueViolation(p2002("tenantId,outletId,name,id"))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(["public", "tenantId", "outletId", "name"]))).toBe(
        false
      );
    });

    it("rejects other unique constraints", () => {
      expect(isCatalogNameUniqueViolation(p2002("User_tenantId_email_key"))).toBe(false);
      expect(
        isCatalogNameUniqueViolation(p2002("CustomerOrder_tenantId_outletId_orderNumber_key"))
      ).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId", "id"]))).toBe(false);
      expect(
        isCatalogNameUniqueViolation(
          p2002(["tenantId", "outletId", "categoryId", "isActive", "sortOrder"])
        )
      ).toBe(false);
    });

    it("rejects empty, null, missing, or foreign-shaped targets", () => {
      expect(isCatalogNameUniqueViolation(p2002(""))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002([]))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(null))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(undefined))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002(42))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002({ name: true }))).toBe(false);
      expect(isCatalogNameUniqueViolation(p2002([{ name: "x" }]))).toBe(false);
      expect(isCatalogNameUniqueViolation({ code: "P2002" })).toBe(false);
      expect(isCatalogNameUniqueViolation({ code: "P2002", meta: null })).toBe(false);
      expect(isCatalogNameUniqueViolation({ code: "P2002", meta: "x" })).toBe(false);
      expect(isCatalogNameUniqueViolation({ code: "P2002", meta: 7 })).toBe(false);
    });

    it("rejects non-P2002 errors and non-error inputs", () => {
      expect(isCatalogNameUniqueViolation({ code: "P2003", meta: { target: ["name"] } })).toBe(
        false
      );
      expect(
        isCatalogNameUniqueViolation(
          new Error("Unique constraint failed on the fields: (`tenantId`,`outletId`,`name`)")
        )
      ).toBe(false);
      expect(isCatalogNameUniqueViolation(null)).toBe(false);
      expect(isCatalogNameUniqueViolation(undefined)).toBe(false);
      expect(isCatalogNameUniqueViolation("P2002")).toBe(false);
    });

    it("does not decide the category versus menu conflict mapping", () => {
      expect(isCatalogNameUniqueViolation(p2002("MenuCategory_tenantId_outletId_name_key"))).toBe(
        isCatalogNameUniqueViolation(p2002("MenuItem_tenantId_outletId_name_key"))
      );
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId", "name"]))).toBe(true);
    });

    it("works without any database connection", () => {
      expect(isCatalogNameUniqueViolation(p2002(["tenantId", "outletId", "name"]))).toBe(true);
      expect(isCatalogNameUniqueViolation(p2002(["name"]))).toBe(false);
    });
  });

  describe("isTableCodeUniqueViolation", () => {
    it("accepts the two field array target in any order", () => {
      expect(isTableCodeUniqueViolation(p2002(["outletId", "code"]))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002(["code", "outletId"]))).toBe(true);
    });

    it("normalizes casing and whitespace inside array fields", () => {
      expect(isTableCodeUniqueViolation(p2002([" outletId ", " CODE "]))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002(["OUTLETID", "code"]))).toBe(true);
    });

    it("rejects array targets with an extra field", () => {
      expect(isTableCodeUniqueViolation(p2002(["outletId", "code", "id"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["tenantId", "outletId", "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["public", "outletId", "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", "code", "qrTokenHash"]))).toBe(false);
    });

    it("rejects array targets that are partial or unrelated", () => {
      expect(isTableCodeUniqueViolation(p2002(["code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", "name"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["tenantId", "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["id"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", "id"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["qrTokenHash"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", "categoryId"]))).toBe(false);
    });

    it("rejects array targets that repeat a field or contain blanks", () => {
      expect(isTableCodeUniqueViolation(p2002(["outletId", "outletId"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["code", "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", ""]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(["outletId", "   "]))).toBe(false);
    });

    it("rejects array targets whose items are not strings", () => {
      expect(isTableCodeUniqueViolation(p2002([{ outletId: "x" }, "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002([42, "code"]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002([null, "code"]))).toBe(false);
    });

    it("accepts the exact constraint name case-insensitively", () => {
      expect(isTableCodeUniqueViolation(p2002("DiningTable_outletId_code_key"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002("diningtable_outletid_code_key"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002("DININGTABLE_OUTLETID_CODE_KEY"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002("  DiningTable_outletId_code_key  "))).toBe(true);
    });

    it("accepts a clear string composite of the two fields", () => {
      expect(isTableCodeUniqueViolation(p2002("outletId,code"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002("(outletId,code)"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002("OutletId,Code"))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002(" OUTLETID,CODE "))).toBe(true);
    });

    it("rejects the qrTokenHash unique constraint and target", () => {
      expect(isTableCodeUniqueViolation(p2002("DiningTable_qrTokenHash_key"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("diningtable_qrtokenhash_key"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("qrTokenHash"))).toBe(false);
    });

    it("rejects other DiningTable unique constraints", () => {
      expect(isTableCodeUniqueViolation(p2002("DiningTable_outletId_id_key"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("DiningTable_pkey"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("outletId,id"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("(outletId,id)"))).toBe(false);
    });

    it("rejects strings that only contain the composite without an exact match", () => {
      expect(
        isTableCodeUniqueViolation(p2002('CREATE UNIQUE INDEX "DiningTable_outletId_code_key"'))
      ).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("SomeTable_outletId_code_key"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("outletId,code,id"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("xoutletId,code"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("outletId,codey"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("prefix_outletId,code"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("outletId,code_suffix"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("(outletId,code,id)"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("outletId|code"))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(""))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002("   "))).toBe(false);
    });

    it("rejects empty, null, missing, or foreign-shaped targets", () => {
      expect(isTableCodeUniqueViolation(p2002(""))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002([]))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(null))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(undefined))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002(42))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002({ code: "A1" }))).toBe(false);
      expect(isTableCodeUniqueViolation(p2002([{ outletId: "x" }]))).toBe(false);
      expect(isTableCodeUniqueViolation({ code: "P2002" })).toBe(false);
      expect(isTableCodeUniqueViolation({ code: "P2002", meta: null })).toBe(false);
      expect(isTableCodeUniqueViolation({ code: "P2002", meta: "x" })).toBe(false);
      expect(isTableCodeUniqueViolation({ code: "P2002", meta: 7 })).toBe(false);
      expect(
        isTableCodeUniqueViolation({ code: "P2002", meta: { target: { outletId: "x" } } })
      ).toBe(false);
    });

    it("rejects non-P2002 errors and non-error inputs", () => {
      expect(
        isTableCodeUniqueViolation({ code: "P2003", meta: { target: ["outletId", "code"] } })
      ).toBe(false);
      expect(
        isTableCodeUniqueViolation(
          new Error("Unique constraint failed on the fields: (`outletId`,`code`)")
        )
      ).toBe(false);
      expect(isTableCodeUniqueViolation(null)).toBe(false);
      expect(isTableCodeUniqueViolation(undefined)).toBe(false);
      expect(isTableCodeUniqueViolation("P2002")).toBe(false);
    });

    it("does not confuse the table, catalog and order number helpers", () => {
      const tableViolation = p2002(["outletId", "code"]);
      const catalogViolation = p2002(["tenantId", "outletId", "name"]);
      const orderViolation = p2002(["tenantId", "outletId", "orderNumber"]);

      expect(isTableCodeUniqueViolation(tableViolation)).toBe(true);
      expect(isTableCodeUniqueViolation(catalogViolation)).toBe(false);
      expect(isTableCodeUniqueViolation(orderViolation)).toBe(false);

      expect(isCatalogNameUniqueViolation(tableViolation)).toBe(false);
      expect(isOrderNumberUniqueViolation(tableViolation)).toBe(false);
      expect(isOrderNumberUniqueViolation(p2002("DiningTable_outletId_code_key"))).toBe(false);
    });

    it("works without any database connection", () => {
      expect(isTableCodeUniqueViolation(p2002(["code", "outletId"]))).toBe(true);
      expect(isTableCodeUniqueViolation(p2002(["code"]))).toBe(false);
    });
  });
});
