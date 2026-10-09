export const MENU_ITEM_CURSOR_VERSION = 1 as const;

export type MenuItemCursorFilter = "all" | "active" | "inactive" | "archived";

export type MenuItemCursorPayload = {
  readonly v: 1;
  readonly categoryId: string;
  readonly sortOrder: number;
  readonly name: string;
  readonly id: string;
  readonly outletId: string;
  readonly filter: MenuItemCursorFilter;
  readonly search: string | undefined;
};

function isValidFilter(value: unknown): value is MenuItemCursorFilter {
  return value === "all" || value === "active" || value === "inactive" || value === "archived";
}

function parsePayload(value: unknown): MenuItemCursorPayload | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.v !== MENU_ITEM_CURSOR_VERSION) {
    return null;
  }
  if (typeof record.categoryId !== "string" || record.categoryId === "") {
    return null;
  }
  if (typeof record.sortOrder !== "number" || !Number.isInteger(record.sortOrder)) {
    return null;
  }
  if (typeof record.name !== "string") {
    return null;
  }
  if (typeof record.id !== "string" || record.id === "") {
    return null;
  }
  if (typeof record.outletId !== "string" || record.outletId === "") {
    return null;
  }
  if (!isValidFilter(record.filter)) {
    return null;
  }
  if (record.search !== undefined && typeof record.search !== "string") {
    return null;
  }
  return {
    v: MENU_ITEM_CURSOR_VERSION,
    categoryId: record.categoryId,
    sortOrder: record.sortOrder,
    name: record.name,
    id: record.id,
    outletId: record.outletId,
    filter: record.filter,
    search: record.search === undefined ? undefined : record.search,
  };
}

export function encodeMenuItemCursor(payload: MenuItemCursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json).toString("base64url");
}

export function decodeMenuItemCursor(encoded: string): MenuItemCursorPayload | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    return parsePayload(parsed);
  } catch {
    return null;
  }
}

export function validateMenuItemCursorBinding(
  cursor: MenuItemCursorPayload,
  expected: { outletId: string; filter: MenuItemCursorFilter; search: string | undefined }
): boolean {
  if (cursor.outletId !== expected.outletId) return false;
  if (cursor.filter !== expected.filter) return false;
  if (cursor.search !== expected.search) return false;
  return true;
}
