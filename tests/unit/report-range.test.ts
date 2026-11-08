import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  diffDateKeys,
  isValidDateKey,
  parseReportRange,
  toJakartaDateKey,
} from "@/lib/dashboard/report-range";

const now = new Date("2026-11-08T05:00:00.000Z");

describe("lib/dashboard/report-range", () => {
  describe("date key helpers", () => {
    it("converts an instant to the Jakarta calendar date", () => {
      expect(toJakartaDateKey(new Date("2026-11-07T16:59:00.000Z"))).toBe("2026-11-07");
      expect(toJakartaDateKey(new Date("2026-11-07T17:00:00.000Z"))).toBe("2026-11-08");
    });

    it("adds days across month boundaries", () => {
      expect(addDaysToDateKey("2026-11-08", 1)).toBe("2026-11-09");
      expect(addDaysToDateKey("2026-11-01", -1)).toBe("2026-10-31");
      expect(diffDateKeys("2026-10-31", "2026-11-02")).toBe(2);
    });

    it("validates calendar dates strictly", () => {
      expect(isValidDateKey("2026-02-28")).toBe(true);
      expect(isValidDateKey("2025-02-29")).toBe(false);
      expect(isValidDateKey("2026-13-01")).toBe(false);
      expect(isValidDateKey("08-11-2026")).toBe(false);
    });
  });

  describe("parseReportRange", () => {
    it("defaults to the last 7 days", () => {
      const range = parseReportRange({}, now);
      expect(range.kind).toBe("7d");
      expect(range.startKey).toBe("2026-11-02");
      expect(range.endKey).toBe("2026-11-08");
      expect(range.days).toBe(7);
      expect(range.granularity).toBe("daily");
    });

    it("supports today", () => {
      const range = parseReportRange({ range: "today" }, now);
      expect(range.startKey).toBe("2026-11-08");
      expect(range.endKey).toBe("2026-11-08");
      expect(range.days).toBe(1);
    });

    it("supports the current month", () => {
      const range = parseReportRange({ range: "month" }, now);
      expect(range.startKey).toBe("2026-11-01");
      expect(range.endKey).toBe("2026-11-08");
      expect(range.days).toBe(8);
    });

    it("supports a valid custom range", () => {
      const range = parseReportRange(
        { range: "custom", start: "2026-10-01", end: "2026-10-31" },
        now
      );
      expect(range.kind).toBe("custom");
      expect(range.startKey).toBe("2026-10-01");
      expect(range.endKey).toBe("2026-10-31");
      expect(range.days).toBe(31);
      expect(range.customInvalid).toBe(false);
      expect(range.granularity).toBe("daily");
    });

    it("switches to weekly granularity for long ranges", () => {
      const range = parseReportRange(
        { range: "custom", start: "2025-01-01", end: "2026-01-01" },
        now
      );
      expect(range.days).toBe(366);
      expect(range.granularity).toBe("weekly");
      expect(range.customInvalid).toBe(false);
    });

    it("falls back to 7 days when custom dates are invalid", () => {
      const range = parseReportRange(
        { range: "custom", start: "2026-11-08", end: "2026-11-01" },
        now
      );
      expect(range.kind).toBe("custom");
      expect(range.startKey).toBe("2026-11-02");
      expect(range.endKey).toBe("2026-11-08");
      expect(range.customInvalid).toBe(true);
    });

    it("falls back to 7 days when the custom range is too long", () => {
      const range = parseReportRange(
        { range: "custom", start: "2024-01-01", end: "2026-11-08" },
        now
      );
      expect(range.startKey).toBe("2026-11-02");
      expect(range.endKey).toBe("2026-11-08");
      expect(range.customInvalid).toBe(true);
    });

    it("handles malformed date input", () => {
      const range = parseReportRange(
        { range: "custom", start: "not-a-date", end: "2026-11-08" },
        now
      );
      expect(range.customStartKey).toBeNull();
      expect(range.customInvalid).toBe(true);
    });
  });
});
