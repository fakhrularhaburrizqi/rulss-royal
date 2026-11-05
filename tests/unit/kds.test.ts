import { describe, it, expect } from "vitest";
import { OrderStatus } from "@prisma/client";
import {
  nextStatusFor,
  waitMinutesSince,
  waitToneClass,
  formatWait,
} from "@/app/dashboard/kds/kds-status";

describe("KDS Status Helpers", () => {
  it("determines next status correctly", () => {
    expect(nextStatusFor(OrderStatus.RECEIVED)).toBe(OrderStatus.PREPARING);
    expect(nextStatusFor(OrderStatus.PREPARING)).toBe(OrderStatus.READY);
    expect(nextStatusFor(OrderStatus.READY)).toBe(OrderStatus.COMPLETED);
    expect(nextStatusFor(OrderStatus.COMPLETED)).toBeNull();
    expect(nextStatusFor(OrderStatus.CANCELLED)).toBeNull();
  });

  it("calculates wait minutes since created timestamp", () => {
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60_000).toISOString();
    expect(waitMinutesSince(fiveMinutesAgo, now)).toBe(5);

    const invalid = "not-a-date";
    expect(waitMinutesSince(invalid, now)).toBe(0);
  });

  it("provides correct wait tone classes based on duration", () => {
    expect(waitToneClass(5)).toBe("text-zinc-950");
    expect(waitToneClass(12)).toBe("text-amber-700");
    expect(waitToneClass(25)).toBe("text-red-700");
  });

  it("formats wait time correctly", () => {
    expect(formatWait(10)).toBe("10 mnt");
  });
});
