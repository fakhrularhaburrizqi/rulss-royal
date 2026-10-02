import "server-only";

import {
  requireActiveUser,
  requireOutletAccess,
  requirePermission,
} from "@/lib/auth/authorization";
import { OrderDomainError, type OrderErrorCode } from "@/lib/order/errors";

export type OrderPermissionKey = "orders.manage" | "menu.view" | "menu.manage";

export type OrderActor = {
  userId: string;
  tenantId: string;
};

export type OrderContext = {
  actor: OrderActor;
  outletId: string;
};

function normalizeOutletId(outletId: string): string {
  if (typeof outletId !== "string") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  const normalized = outletId.trim();
  if (normalized === "") {
    throw new OrderDomainError("INVALID_INPUT");
  }
  return normalized;
}

function assertOrderPermissionKey(permission: OrderPermissionKey): void {
  if (
    permission !== "orders.manage" &&
    permission !== "menu.view" &&
    permission !== "menu.manage"
  ) {
    throw new OrderDomainError("INVALID_INPUT");
  }
}

async function withAuthMapping<T>(operation: () => Promise<T>, code: OrderErrorCode): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new OrderDomainError(code);
  }
}

export async function requireOrderContext(
  outletId: string,
  permission: OrderPermissionKey
): Promise<OrderContext> {
  try {
    const normalizedOutletId = normalizeOutletId(outletId);
    assertOrderPermissionKey(permission);

    const activeUser = await withAuthMapping(() => requireActiveUser(), "UNAUTHENTICATED");
    await withAuthMapping(() => requireOutletAccess(normalizedOutletId), "OUTLET_ACCESS_DENIED");
    await withAuthMapping(() => requirePermission(permission), "OUTLET_ACCESS_DENIED");

    return {
      actor: {
        userId: activeUser.user.id,
        tenantId: activeUser.user.tenantId,
      },
      outletId: normalizedOutletId,
    };
  } catch (error) {
    if (error instanceof OrderDomainError) {
      throw error;
    }
    throw new OrderDomainError("INTERNAL_ERROR");
  }
}
