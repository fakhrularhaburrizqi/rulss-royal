import { describe, expect, it } from "vitest";

import {
  isOrderNumberUniqueViolation,
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
  "ORDER_NOT_FOUND",
  "INVALID_TRANSITION",
  "VERSION_CONFLICT",
  "ORDER_LIMIT_REACHED",
  "ORDER_NUMBER_CONFLICT",
  "INTERNAL_ERROR",
];

function p2002(target: unknown): unknown {
  return { code: "P2002", meta: { target } };
}

describe("Order Errors", () => {
  it("provides a safe message for every error code", () => {
    expect(ALL_CODES).toHaveLength(14);
    for (const code of ALL_CODES) {
      const message = getOrderErrorMessage(code);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
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
});
