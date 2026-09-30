import { OrderStatus } from "@prisma/client";

import { OrderDomainError } from "./errors";

const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.RECEIVED]: Object.freeze([OrderStatus.PREPARING, OrderStatus.CANCELLED]),
  [OrderStatus.PREPARING]: Object.freeze([OrderStatus.READY, OrderStatus.CANCELLED]),
  [OrderStatus.READY]: Object.freeze([OrderStatus.COMPLETED, OrderStatus.CANCELLED]),
  [OrderStatus.COMPLETED]: Object.freeze([]),
  [OrderStatus.CANCELLED]: Object.freeze([]),
};

function allowedTransitions(from: OrderStatus): readonly OrderStatus[] | null {
  return ORDER_STATUS_TRANSITIONS[from] ?? null;
}

export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  const allowed = allowedTransitions(from);
  if (allowed === null) {
    throw new OrderDomainError("INVALID_INPUT");
  }
  return allowed;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  const allowed = allowedTransitions(from);
  if (allowed === null) {
    return false;
  }
  return allowed.includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new OrderDomainError("INVALID_TRANSITION");
  }
}
