export type DiningTableAuthScope = {
  tenantId: string;
  userId: string;
};

export function diningTableKeys() {
  return {
    all: ["tables"] as const,
    lists: () => [...diningTableKeys().all, "list"] as const,
    list: (authScope: DiningTableAuthScope, outletId: string) =>
      [...diningTableKeys().lists(), { authScope, outletId }] as const,
  };
}
