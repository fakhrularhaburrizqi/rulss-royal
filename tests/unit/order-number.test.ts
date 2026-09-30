import { describe, expect, it, vi } from "vitest";

import { MAX_ORDER_SEQ_PER_DAY } from "@/lib/order/constants";
import { OrderDomainError } from "@/lib/order/errors";
import {
  formatOrderNumber,
  maxSequence,
  orderNumberPrefix,
  parseSequence,
  resolveLocalDate,
} from "@/lib/order/order-number";

function orderErrorCode(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof OrderDomainError ? error.code : "NOT_A_DOMAIN_ERROR";
  }
}

const PREFIX = "OUT-t01-20260930-";

describe("orderNumberPrefix", () => {
  it("builds a normal prefix", () => {
    expect(orderNumberPrefix("t01", "20260930")).toBe("OUT-t01-20260930-");
  });

  it("trims the outlet code", () => {
    expect(orderNumberPrefix("  t01  ", "20260930")).toBe("OUT-t01-20260930-");
  });

  it("supports outlet codes that contain hyphens", () => {
    expect(orderNumberPrefix("t01-a", "20260930")).toBe("OUT-t01-a-20260930-");
    expect(orderNumberPrefix("-t01-", "20260930")).toBe("OUT--t01--20260930-");
  });

  it("rejects an empty or whitespace-only outlet code", () => {
    expect(orderErrorCode(() => orderNumberPrefix("", "20260930"))).toBe("INVALID_INPUT");
    expect(orderErrorCode(() => orderNumberPrefix("   ", "20260930"))).toBe("INVALID_INPUT");
    expect(orderErrorCode(() => orderNumberPrefix(123 as unknown as string, "20260930"))).toBe(
      "INVALID_INPUT"
    );
  });

  it("rejects dates that are not exactly eight digits", () => {
    for (const badDate of ["", "2026093", "202609301", "2026093a", "2026-09-30", " 20260930"]) {
      expect(
        orderErrorCode(() => orderNumberPrefix("t01", badDate)),
        badDate
      ).toBe("INVALID_INPUT");
    }
  });
});

describe("formatOrderNumber", () => {
  it("formats sequences as four digits", () => {
    expect(formatOrderNumber(PREFIX, 1)).toBe(`${PREFIX}0001`);
    expect(formatOrderNumber(PREFIX, 42)).toBe(`${PREFIX}0042`);
    expect(formatOrderNumber(PREFIX, MAX_ORDER_SEQ_PER_DAY)).toBe(`${PREFIX}9999`);
  });

  it("rejects an empty or non-string prefix", () => {
    expect(orderErrorCode(() => formatOrderNumber("", 1))).toBe("INVALID_INPUT");
    expect(orderErrorCode(() => formatOrderNumber("   ", 1))).toBe("INVALID_INPUT");
    expect(orderErrorCode(() => formatOrderNumber(7 as unknown as string, 1))).toBe(
      "INVALID_INPUT"
    );
  });

  it("rejects sequences below one or non-integers with INVALID_INPUT", () => {
    for (const badSeq of [0, -1, 1.5, Number.NaN]) {
      expect(
        orderErrorCode(() => formatOrderNumber(PREFIX, badSeq)),
        String(badSeq)
      ).toBe("INVALID_INPUT");
    }
  });

  it("rejects sequences above the daily limit with ORDER_LIMIT_REACHED", () => {
    expect(orderErrorCode(() => formatOrderNumber(PREFIX, 10_000))).toBe("ORDER_LIMIT_REACHED");
    expect(orderErrorCode(() => formatOrderNumber(PREFIX, MAX_ORDER_SEQ_PER_DAY + 1))).toBe(
      "ORDER_LIMIT_REACHED"
    );
  });
});

describe("parseSequence", () => {
  it("parses the trailing four-digit sequence", () => {
    expect(parseSequence("OUT-t01-20260930-0042")).toBe(42);
    expect(parseSequence("OUT-t01-20260930-0001")).toBe(1);
    expect(parseSequence("OUT-t01-20260930-9999")).toBe(MAX_ORDER_SEQ_PER_DAY);
  });

  it("supports outlet codes that contain hyphens", () => {
    expect(parseSequence("OUT-t01-a-20260930-0007")).toBe(7);
  });

  it("rejects malformed values", () => {
    expect(parseSequence("")).toBeNull();
    expect(parseSequence("0042")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-0000")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-10000")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-abcd")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-004a")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-42")).toBeNull();
    expect(parseSequence("OUT-t01-20260930-0042.5")).toBeNull();
    expect(parseSequence(42 as unknown as string)).toBeNull();
  });
});

describe("maxSequence", () => {
  it("computes the highest sequence numerically with gaps", () => {
    const entries = [
      `${PREFIX}0002`,
      `${PREFIX}0010`,
      `${PREFIX}0009`,
      `${PREFIX}0003`,
      `${PREFIX}0100`,
    ];
    expect(maxSequence(entries, PREFIX)).toBe(100);
  });

  it("ignores foreign prefixes and malformed entries", () => {
    const entries = [
      "OUT-other-20260930-0099",
      "BILL-t01-20260930-0099",
      "OUT-t01-20260930-0000",
      "OUT-t01-20260930-10000",
      "OUT-t01-20260930-abc",
      "OUT-t01-20260930-",
      "OUT-t01-20260930-0042-extra",
      "OUT-t01-20260931-0099",
      `${PREFIX}0007`,
    ];
    expect(maxSequence(entries, PREFIX)).toBe(7);
  });

  it("skips non-string entries without throwing", () => {
    const entries = [42 as unknown as string, `${PREFIX}0005`];
    expect(maxSequence(entries, PREFIX)).toBe(5);
  });

  it("returns zero for empty input or when nothing matches", () => {
    expect(maxSequence([], PREFIX)).toBe(0);
    expect(maxSequence(["BILL-2026-0009"], PREFIX)).toBe(0);
  });

  it("rejects an empty or non-string prefix", () => {
    expect(orderErrorCode(() => maxSequence([], ""))).toBe("INVALID_INPUT");
    expect(orderErrorCode(() => maxSequence([], 9 as unknown as string))).toBe("INVALID_INPUT");
  });

  it("does not mutate the input array", () => {
    const entries = [`${PREFIX}0003`, `${PREFIX}0001`];
    const snapshot = [...entries];
    maxSequence(entries, PREFIX);
    expect(entries).toEqual(snapshot);
    expect(entries).toHaveLength(2);
  });
});

describe("resolveLocalDate", () => {
  const now = new Date("2026-09-30T17:30:00Z");

  it("returns the UTC calendar date", () => {
    expect(resolveLocalDate(now, "UTC")).toBe("20260930");
  });

  it("returns the Asia/Jakarta calendar date across the day boundary", () => {
    expect(resolveLocalDate(now, "Asia/Jakarta")).toBe("20261001");
  });

  it("rejects an invalid time zone with INTERNAL_ERROR", () => {
    expect(orderErrorCode(() => resolveLocalDate(now, "Not/AZone"))).toBe("INTERNAL_ERROR");
    expect(orderErrorCode(() => resolveLocalDate(now, ""))).toBe("INTERNAL_ERROR");
    expect(orderErrorCode(() => resolveLocalDate(now, "   "))).toBe("INTERNAL_ERROR");
    expect(orderErrorCode(() => resolveLocalDate(now, 7 as unknown as string))).toBe(
      "INTERNAL_ERROR"
    );
  });

  it("rejects an invalid Date with INTERNAL_ERROR", () => {
    expect(orderErrorCode(() => resolveLocalDate(new Date("not-a-date"), "UTC"))).toBe(
      "INTERNAL_ERROR"
    );
    expect(orderErrorCode(() => resolveLocalDate("2026-09-30" as unknown as Date, "UTC"))).toBe(
      "INTERNAL_ERROR"
    );
    expect(orderErrorCode(() => resolveLocalDate(undefined as unknown as Date, "UTC"))).toBe(
      "INTERNAL_ERROR"
    );
  });

  it("rejects incomplete date parts with INTERNAL_ERROR", () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, "formatToParts")
      .mockReturnValue([{ type: "year", value: "2026" }] as Intl.DateTimeFormatPart[]);
    try {
      expect(orderErrorCode(() => resolveLocalDate(now, "UTC"))).toBe("INTERNAL_ERROR");
    } finally {
      spy.mockRestore();
    }
    expect(resolveLocalDate(now, "UTC")).toBe("20260930");
  });
});
