export type MenuItemAuthScope = {
  tenantId: string;
  userId: string;
};

export type MenuItemQueryParams = {
  outletId: string;
  filter: "all" | "active" | "inactive" | "archived";
  search: string | undefined;
  limit: number;
  cursor: string | undefined;
};

export const INITIAL_MENU_ITEM_LIMIT = 50;

export function menuItemKeys() {
  return {
    all: ["menu-items"] as const,
    lists: () => [...menuItemKeys().all, "list"] as const,
    list: (authScope: MenuItemAuthScope, params: MenuItemQueryParams) =>
      [...menuItemKeys().lists(), { authScope, ...params, search: params.search?.trim() || undefined }] as const,
  };
}

export function isInitialMenuItemScope(
  filter: MenuItemQueryParams["filter"],
  search: string | undefined,
  limit: number,
  cursor: string | undefined
): boolean {
  return (
    filter === "all" && (search?.trim() || undefined) === undefined && limit === INITIAL_MENU_ITEM_LIMIT && cursor === undefined
  );
}

export function initialMenuItemListKey(
  authScope: MenuItemAuthScope,
  outletId: string,
  filter: MenuItemQueryParams["filter"] = "all",
  search: string | undefined = undefined,
  limit: number = INITIAL_MENU_ITEM_LIMIT,
  cursor: string | undefined = undefined
) {
  return menuItemKeys().list(authScope, {
    outletId,
    filter,
    search: search?.trim() || undefined,
    limit,
    cursor,
  });
}

type MenuItemListKeyParams = {
  authScope: MenuItemAuthScope;
  outletId: string;
  filter: string;
  search: string | undefined;
  limit: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function readListKeyParams(key: ReadonlyArray<unknown>): MenuItemListKeyParams | null {
  if (key.length !== 3 || key[0] !== "menu-items" || key[1] !== "list") return null;
  const params = asRecord(key[2]);
  if (!params) return null;
  const authScope = asRecord(params.authScope);
  if (!authScope) return null;
  const { tenantId, userId } = authScope;
  const { outletId, filter, search, limit } = params;
  if (typeof tenantId !== "string") return null;
  if (typeof userId !== "string") return null;
  if (typeof outletId !== "string") return null;
  if (typeof filter !== "string") return null;
  if (typeof limit !== "number") return null;
  return {
    authScope: { tenantId, userId },
    outletId,
    filter,
    search: typeof search === "string" ? search : undefined,
    limit,
  };
}

export function canReuseMenuPlaceholder(
  previousKey: ReadonlyArray<unknown>,
  next: { authScope: MenuItemAuthScope; params: MenuItemQueryParams }
): boolean {
  const previous = readListKeyParams(previousKey);
  if (!previous) return false;
  if (previous.authScope.tenantId !== next.authScope.tenantId) return false;
  if (previous.authScope.userId !== next.authScope.userId) return false;
  if (previous.outletId !== next.params.outletId) return false;
  if (previous.filter !== next.params.filter) return false;
  if ((previous.search ?? "") !== (next.params.search ?? "")) return false;
  if (previous.limit !== next.params.limit) return false;
  return true;
}
