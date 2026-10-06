export type CategoryAuthScope = {
  tenantId: string;
  userId: string;
};

export type CategoryQueryParams = {
  outletId: string;
  filter: "all" | "active" | "inactive" | "archived";
  search: string | undefined;
  limit: number;
  cursor: string | undefined;
};

export const INITIAL_CATEGORY_LIMIT = 50;

export function categoryKeys() {
  return {
    all: ["categories"] as const,
    lists: () => [...categoryKeys().all, "list"] as const,
    list: (authScope: CategoryAuthScope, params: CategoryQueryParams) =>
      [...categoryKeys().lists(), { authScope, ...params, search: params.search?.trim() || undefined }] as const,
  };
}

export function isInitialCategoryScope(
  filter: CategoryQueryParams["filter"],
  search: string | undefined,
  limit: number,
  cursor: string | undefined
): boolean {
  return (
    filter === "all" && (search?.trim() || undefined) === undefined && limit === INITIAL_CATEGORY_LIMIT && cursor === undefined
  );
}

export function initialCategoryListKey(
  authScope: CategoryAuthScope,
  outletId: string,
  filter: CategoryQueryParams["filter"] = "all",
  search: string | undefined = undefined,
  limit: number = INITIAL_CATEGORY_LIMIT,
  cursor: string | undefined = undefined
) {
  return categoryKeys().list(authScope, {
    outletId,
    filter,
    search: search?.trim() || undefined,
    limit,
    cursor,
  });
}

type CategoryListKeyParams = {
  authScope: CategoryAuthScope;
  outletId: string;
  filter: string;
  search: string | undefined;
  limit: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

function readListKeyParams(key: ReadonlyArray<unknown>): CategoryListKeyParams | null {
  if (key.length !== 3 || key[0] !== "categories" || key[1] !== "list") return null;
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

export function canReuseCategoryPlaceholder(
  previousKey: ReadonlyArray<unknown>,
  next: { authScope: CategoryAuthScope; params: CategoryQueryParams }
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
