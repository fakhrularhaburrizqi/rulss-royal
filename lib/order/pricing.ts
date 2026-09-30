import { MAX_MONEY, MAX_QUANTITY_PER_LINE, MIN_MONEY } from "./constants";
import { OrderDomainError } from "./errors";

export type OrderLineInput = {
  readonly unitPrice: number;
  readonly quantity: number;
};

export type OrderTotals = {
  readonly subtotal: number;
  readonly taxAmount: 0;
  readonly serviceAmount: 0;
  readonly total: number;
};

export function assertMoney(value: number): void {
  if (!Number.isInteger(value) || value < MIN_MONEY || value > MAX_MONEY) {
    throw new OrderDomainError("AMOUNT_OUT_OF_RANGE");
  }
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    throw new OrderDomainError("INVALID_INPUT");
  }
}

export function itemSubtotal(unitPrice: number, quantity: number): number {
  assertMoney(unitPrice);
  assertQuantity(quantity);
  const subtotal = unitPrice * quantity;
  assertMoney(subtotal);
  return subtotal;
}

export function orderTotals(lines: readonly OrderLineInput[]): OrderTotals {
  let subtotal = MIN_MONEY;
  for (const line of lines) {
    subtotal += itemSubtotal(line.unitPrice, line.quantity);
    assertMoney(subtotal);
  }
  return { subtotal, taxAmount: 0, serviceAmount: 0, total: subtotal };
}
