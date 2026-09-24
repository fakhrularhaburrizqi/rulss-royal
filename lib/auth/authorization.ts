import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.tenantId) {
    throw new Error("Unauthorized");
  }
  return session.user;
}

export async function requireActiveUser() {
  const userSession = await requireAuth();

  const tenant = await db.tenant.findUnique({
    where: { id: userSession.tenantId },
  });

  if (!tenant || !tenant.isActive || tenant.deletedAt) {
    throw new Error("Tenant is inactive or not found");
  }

  const user = await db.user.findUnique({
    where: { id: userSession.id },
  });

  if (!user || !user.isActive || user.deletedAt || user.tenantId !== userSession.tenantId) {
    throw new Error("User is inactive or not found");
  }

  return { user, tenant };
}

export async function requireOutletAccess(outletId: string) {
  const userSession = await requireActiveUser();

  const outlet = await db.outlet.findFirst({
    where: {
      id: outletId,
      tenantId: userSession.tenant.id,
      isActive: true,
      deletedAt: null,
    },
  });

  if (!outlet) {
    throw new Error("Outlet not found or access denied");
  }

  const userOutlet = await db.userOutlet.findUnique({
    where: {
      tenantId_userId_outletId: {
        tenantId: userSession.tenant.id,
        userId: userSession.user.id,
        outletId,
      },
    },
  });

  if (!userOutlet) {
    throw new Error("User outlet membership not found");
  }

  return outlet;
}

export async function requirePermission(permissionKey: string) {
  const userSession = await requireActiveUser();

  const userRoles = await db.userRole.findMany({
    where: {
      tenantId: userSession.tenant.id,
      userId: userSession.user.id,
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

  const hasPermission = userRoles.some(
    (ur: { role: { rolePermissions: Array<{ permission: { key: string } }> } }) =>
      ur.role.rolePermissions.some(
        (rp: { permission: { key: string } }) => rp.permission.key === permissionKey
      )
  );

  if (!hasPermission) {
    throw new Error("Permission denied");
  }

  return true;
}
