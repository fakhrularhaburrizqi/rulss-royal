import "dotenv/config";

import bcrypt from "bcryptjs";

import { db } from "../lib/db";

const BCRYPT_COST = 12;

const TENANT_CODE = "rulss-royal";
const TENANT_NAME = "Rulss Royal";
const OUTLET_CODE = "main";
const OUTLET_NAME = "Outlet Utama";
const OWNER_ROLE_NAME = "Owner";

const ADMIN_NAME = "Admin Rulss Royal";
const ADMIN_EMAIL = "admin@rulssroyal.com";
const ADMIN_PASSWORD = "admin123";

const PERMISSION_KEYS = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "menu.view",
  "menu.manage",
  "tables.view",
  "tables.manage",
  "users.view",
  "users.manage",
  "reports.view",
  "settings.manage",
] as const;

function moduleOf(key: string): string {
  return key.split(".")[0] ?? key;
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);

  const summary = await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { code: TENANT_CODE },
        update: { name: TENANT_NAME, isActive: true },
        create: { code: TENANT_CODE, name: TENANT_NAME, isActive: true },
      });

      const outlet = await tx.outlet.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: OUTLET_CODE } },
        update: { name: OUTLET_NAME, isActive: true },
        create: { tenantId: tenant.id, code: OUTLET_CODE, name: OUTLET_NAME, isActive: true },
      });

      await tx.outletSetting.upsert({
        where: { outletId: outlet.id },
        update: {},
        create: { outletId: outlet.id },
      });

      const role = await tx.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: OWNER_ROLE_NAME } },
        update: {},
        create: {
          tenantId: tenant.id,
          name: OWNER_ROLE_NAME,
          description: "Full access to every module.",
        },
      });

      const permissionIds: string[] = [];
      for (const key of PERMISSION_KEYS) {
        const permission = await tx.permission.upsert({
          where: { key },
          update: { module: moduleOf(key) },
          create: { key, module: moduleOf(key) },
        });
        permissionIds.push(permission.id);
      }

      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });

      const user = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL } },
        update: { name: ADMIN_NAME, passwordHash, isActive: true, deletedAt: null },
        create: {
          tenantId: tenant.id,
          name: ADMIN_NAME,
          email: ADMIN_EMAIL,
          passwordHash,
          isActive: true,
        },
      });

      await tx.userRole.createMany({
        data: [{ tenantId: tenant.id, userId: user.id, roleId: role.id }],
        skipDuplicates: true,
      });

      await tx.userOutlet.createMany({
        data: [{ tenantId: tenant.id, userId: user.id, outletId: outlet.id }],
        skipDuplicates: true,
      });

      return { tenantCode: tenant.code, outletCode: outlet.code, role: role.name };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  console.log("Seed selesai. Akun admin siap digunakan untuk login dashboard.");
  console.log(`- Tenant  : ${summary.tenantCode}`);
  console.log(`- Outlet  : ${summary.outletCode}`);
  console.log(`- Role    : ${summary.role}`);
  console.log(`- Email   : ${ADMIN_EMAIL}`);
  console.log(`- Password: ${ADMIN_PASSWORD}`);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Seed gagal: ${message}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

void run();
