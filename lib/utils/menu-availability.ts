export type MenuAvailabilityInput = {
  stock: number;
  isSoldOut: boolean;
};

export function isMenuItemSoldOut(item: MenuAvailabilityInput): boolean {
  return item.isSoldOut || item.stock <= 0;
}

export function remainingMenuItemStock(item: MenuAvailabilityInput): number {
  return Math.max(0, item.stock);
}
