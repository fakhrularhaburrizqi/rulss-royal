import { describe, expect, it } from "vitest";

import { MAX_MONEY, MAX_QUANTITY_PER_LINE } from "@/lib/order/constants";
import { OrderDomainError } from "@/lib/order/errors";
import { assertMoney, itemSubtotal, orderTotals } from "@/lib/order/pricing";

function codeOf(error: unknown): string | undefined {
  return error instanceof OrderDomainError ? error.code : undefined;
}

describe("Order Pricing", () => {
  it("computes a normal item subtotal", () => {
    expect(itemSubtotal(15_000, 2)).toBe(30_000);
    expect(itemSubtotal(5_000, 1)).toBe(5_000);
  });

  it("accepts a zero unit price", () => {
    expect(itemSubtotal(0, 5)).toBe(0);
    expect(orderTotals([{ unitPrice: 0, quantity: 3 }])).toEqual({
      subtotal: 0,
      taxAmount: 0,
      serviceAmount: 0,
      total: 0,
    });
  });

  it("accepts MAX_MONEY with quantity 1", () => {
    expect(itemSubtotal(MAX_MONEY, 1)).toBe(MAX_MONEY);
    expect(() => assertMoney(MAX_MONEY)).not.toThrow();
    expect(() => assertMoney(0)).not.toThrow();
  });

  it("rejects MAX_MONEY with quantity 2 as out of range", () => {
    let caught: unknown;
    try {
      itemSubtotal(MAX_MONEY, 2);
    } catch (error) {
      caught = error;
    }
    expect(codeOf(caught)).toBe("AMOUNT_OUT_OF_RANGE");
  });

  it("accepts an accumulation that reaches exactly MAX_MONEY", () => {
    const totals = orderTotals([
      { unitPrice: MAX_MONEY - 10, quantity: 1 },
      { unitPrice: 10, quantity: 1 },
    ]);
    expect(totals.subtotal).toBe(MAX_MONEY);
    expect(totals.total).toBe(MAX_MONEY);
  });

  it("rejects an accumulation of MAX_MONEY plus one", () => {
    let caught: unknown;
    try {
      orderTotals([
        { unitPrice: MAX_MONEY, quantity: 1 },
        { unitPrice: 1, quantity: 1 },
      ]);
    } catch (error) {
      caught = error;
    }
    expect(codeOf(caught)).toBe("AMOUNT_OUT_OF_RANGE");
  });

  it("rejects negative, fractional, NaN, and infinite amounts", () => {
    for (const unitPrice of [-1, 1_000.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      let caught: unknown;
      try {
        itemSubtotal(unitPrice, 1);
      } catch (error) {
        caught = error;
      }
      expect(codeOf(caught), String(unitPrice)).toBe("AMOUNT_OUT_OF_RANGE");
      expect(() => assertMoney(unitPrice), String(unitPrice)).toThrow(OrderDomainError);
    }
  });

  it("rejects quantities outside 1..MAX_QUANTITY_PER_LINE", () => {
    for (const quantity of [0, 100, -1, 1.5]) {
      let caught: unknown;
      try {
        itemSubtotal(1_000, quantity);
      } catch (error) {
        caught = error;
      }
      expect(codeOf(caught), String(quantity)).toBe("INVALID_INPUT");
    }
  });

  it("accepts the quantity boundaries 1 and MAX_QUANTITY_PER_LINE", () => {
    expect(itemSubtotal(1_000, 1)).toBe(1_000);
    expect(itemSubtotal(1_000, MAX_QUANTITY_PER_LINE)).toBe(99_000);
    expect(() => itemSubtotal(10_000, 2.5)).toThrow(OrderDomainError);
  });

  it("returns subtotal, zero tax, zero service, and total equal to subtotal", () => {
    const totals = orderTotals([
      { unitPrice: 15_000, quantity: 2 },
      { unitPrice: 5_000, quantity: 1 },
    ]);
    expect(totals).toEqual({
      subtotal: 35_000,
      taxAmount: 0,
      serviceAmount: 0,
      total: 35_000,
    });
    expect(totals.total).toBe(totals.subtotal);
    expect(totals.taxAmount).toBe(0);
    expect(totals.serviceAmount).toBe(0);
  });

  it("returns zero totals for an empty line list", () => {
    expect(orderTotals([])).toEqual({
      subtotal: 0,
      taxAmount: 0,
      serviceAmount: 0,
      total: 0,
    });
  });
});
