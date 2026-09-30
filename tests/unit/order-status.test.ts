import { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { OrderDomainError } from "@/lib/order/errors";
import { assertTransition, canTransition, nextStatuses } from "@/lib/order/status";

const ALL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  `${OrderStatus.RECEIVED}->${OrderStatus.PREPARING}`,
  `${OrderStatus.RECEIVED}->${OrderStatus.CANCELLED}`,
  `${OrderStatus.PREPARING}->${OrderStatus.READY}`,
  `${OrderStatus.PREPARING}->${OrderStatus.CANCELLED}`,
  `${OrderStatus.READY}->${OrderStatus.COMPLETED}`,
  `${OrderStatus.READY}->${OrderStatus.CANCELLED}`,
]);

function key(from: OrderStatus, to: OrderStatus): string {
  return `${from}->${to}`;
}

describe("Order Status Transitions", () => {
  it("allows exactly six transitions across the full 5x5 matrix", () => {
    let allowedCount = 0;
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = ALLOWED_TRANSITIONS.has(key(from, to));
        expect(canTransition(from, to), `${key(from, to)}`).toBe(expected);
        if (expected) allowedCount += 1;
      }
    }
    expect(allowedCount).toBe(6);
  });

  it("returns the expected next statuses for every status", () => {
    expect(nextStatuses(OrderStatus.RECEIVED)).toEqual([
      OrderStatus.PREPARING,
      OrderStatus.CANCELLED,
    ]);
    expect(nextStatuses(OrderStatus.PREPARING)).toEqual([OrderStatus.READY, OrderStatus.CANCELLED]);
    expect(nextStatuses(OrderStatus.READY)).toEqual([OrderStatus.COMPLETED, OrderStatus.CANCELLED]);
    expect(nextStatuses(OrderStatus.COMPLETED)).toEqual([]);
    expect(nextStatuses(OrderStatus.CANCELLED)).toEqual([]);
  });

  it("treats self-transitions, backward moves, skips, and terminal states as invalid", () => {
    const forbidden: readonly (readonly [OrderStatus, OrderStatus])[] = [
      [OrderStatus.RECEIVED, OrderStatus.RECEIVED],
      [OrderStatus.PREPARING, OrderStatus.PREPARING],
      [OrderStatus.PREPARING, OrderStatus.RECEIVED],
      [OrderStatus.READY, OrderStatus.PREPARING],
      [OrderStatus.COMPLETED, OrderStatus.READY],
      [OrderStatus.RECEIVED, OrderStatus.READY],
      [OrderStatus.RECEIVED, OrderStatus.COMPLETED],
      [OrderStatus.PREPARING, OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED, OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED, OrderStatus.RECEIVED],
    ];
    for (const [from, to] of forbidden) {
      expect(canTransition(from, to), `${key(from, to)}`).toBe(false);
      expect(() => assertTransition(from, to), `${key(from, to)}`).toThrow(OrderDomainError);
      try {
        assertTransition(from, to);
      } catch (error) {
        expect(error).toBeInstanceOf(OrderDomainError);
        expect((error as OrderDomainError).code).toBe("INVALID_TRANSITION");
      }
    }
  });

  it("does not throw for allowed transitions in assertTransition", () => {
    for (const transition of ALLOWED_TRANSITIONS) {
      const [from, to] = transition.split("->") as [OrderStatus, OrderStatus];
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it("returns immutable next-status arrays that cannot mutate internal config", () => {
    const result = nextStatuses(OrderStatus.RECEIVED);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => (result as OrderStatus[]).push(OrderStatus.READY)).toThrow(TypeError);
    expect(nextStatuses(OrderStatus.RECEIVED)).toEqual([
      OrderStatus.PREPARING,
      OrderStatus.CANCELLED,
    ]);
  });

  it("rejects unknown status values instead of reporting them as terminal", () => {
    const unknownStatus = "DELIVERED" as OrderStatus;
    expect(() => nextStatuses(unknownStatus)).toThrow(OrderDomainError);
    expect(canTransition(unknownStatus, OrderStatus.READY)).toBe(false);
    expect(() => assertTransition(unknownStatus, OrderStatus.READY)).toThrow(OrderDomainError);
  });
});
