import "server-only";

import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth/authorization";
import { OrderDomainError, type OrderErrorCode } from "@/lib/order/errors";

export type OutletDTO = {
  id: string;
  name: string;
  code: string;
};

export type DashboardCapabilities = {
  canViewCatalog: boolean;
  canManageCatalog: boolean;
  canViewTables: boolean;
  canManageTables: boolean;
  canViewOrders?: boolean;
};

export type DashboardContextResult =
  | { kind: "selected"; outlet: OutletDTO; outlets: OutletDTO[]; capabilities: DashboardCapabilities }
  | { kind: "selection-required"; outlets: OutletDTO[] }
  | { kind: "no-accessible-outlet"; outlets: [] }
  | { kind: "invalid-or-denied"; outlets: OutletDTO[] };

function toOrderErrorCode(code: OrderErrorCode): OrderDomainError {
  return new OrderDomainError(code);
}

async function fetchAuthorizedOutlets(tenantId: string, userId: string): Promise<OutletDTO[]> {
  try {
    const userOutlets = await db.userOutlet.findMany({
      where: {
        tenantId,
        userId,
        outlet: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
      },
      select: {
        outlet: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        outlet: {
          name: "asc",
        },
      },
    });

    return userOutlets
      .map((uo) => uo.outlet)
      .filter((outlet): outlet is OutletDTO => outlet !== null)
      .sort((a, b) => {
        if (a.name !== b.name) return a.name.localeCompare(b.name);
        if (a.code !== b.code) return a.code.localeCompare(b.code);
        return a.id.localeCompare(b.id);
      });
  } catch {
    throw toOrderErrorCode("INTERNAL_ERROR");
  }
}

async function computeCapabilities(tenantId: string, userId: string): Promise<DashboardCapabilities> {
  try {
    const userRoles = await db.userRole.findMany({
      where: {
        tenantId,
        userId,
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    const perms = new Set(
      userRoles.flatMap((ur) =>
        ur.role.rolePermissions.map((rp) => rp.permission.key)
      )
    );

    return {
      canViewCatalog: perms.has("menu.view"),
      canManageCatalog: perms.has("menu.manage"),
      canViewTables: perms.has("tables.view"),
      canManageTables: perms.has("tables.manage"),
      canViewOrders: perms.has("orders.manage"),
    };
  } catch {
    throw toOrderErrorCode("INTERNAL_ERROR");
  }
}

export async function resolveDashboardContext(
  searchParams: Promise<Record<string, string | string[] | undefined>>
): Promise<DashboardContextResult> {
  let params: Record<string, string | string[] | undefined>;
  try {
    params = await searchParams;
  } catch {
    throw toOrderErrorCode("INTERNAL_ERROR");
  }

  let activeUser: Awaited<ReturnType<typeof requireActiveUser>>;
  try {
    activeUser = await requireActiveUser();
  } catch {
    throw toOrderErrorCode("UNAUTHENTICATED");
  }

  const { user, tenant } = activeUser;
  const raw = params.outlet;

  if (Array.isArray(raw)) {
    const outlets = await fetchAuthorizedOutlets(tenant.id, user.id);
    return { kind: "invalid-or-denied", outlets };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") {
      const outlets = await fetchAuthorizedOutlets(tenant.id, user.id);
      return { kind: "invalid-or-denied", outlets };
    }
    const outlets = await fetchAuthorizedOutlets(tenant.id, user.id);
    const matched = outlets.find((o) => o.id === trimmed);
    if (!matched) {
      return { kind: "invalid-or-denied", outlets };
    }
    const capabilities = await computeCapabilities(tenant.id, user.id);
    return { kind: "selected", outlet: matched, outlets, capabilities };
  }

  const outlets = await fetchAuthorizedOutlets(tenant.id, user.id);

  if (outlets.length === 0) {
    return { kind: "no-accessible-outlet", outlets: [] };
  }

  if (outlets.length === 1) {
    const capabilities = await computeCapabilities(tenant.id, user.id);
    return { kind: "selected", outlet: outlets[0], outlets, capabilities };
  }

  return { kind: "selection-required", outlets };
}