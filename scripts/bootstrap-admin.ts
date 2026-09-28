import "dotenv/config";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../lib/db";

const BCRYPT_COST = 12;
const OWNER_ROLE_NAME = "Owner";
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const codeSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        CODE_PATTERN,
        "must use only a-z, 0-9 and hyphens, and must not start or end with a hyphen"
      )
  );

const nameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "must not be empty"));

const emailSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email("must be a valid email address"));

const passwordSchema = z.string().min(12, "must be at least 12 characters");

const bootstrapEnvSchema = z.object({
  BOOTSTRAP_TENANT_CODE: codeSchema,
  BOOTSTRAP_TENANT_NAME: nameSchema,
  BOOTSTRAP_OUTLET_CODE: codeSchema,
  BOOTSTRAP_OUTLET_NAME: nameSchema,
  BOOTSTRAP_ADMIN_NAME: nameSchema,
  BOOTSTRAP_ADMIN_EMAIL: emailSchema,
  BOOTSTRAP_ADMIN_PASSWORD: passwordSchema,
});

class BootstrapAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapAbort";
  }
}

function moduleOf(key: string): string {
  return key.split(".")[0];
}

function reportValidationErrors(error: z.ZodError): void {
  console.error("Bootstrap input is invalid. Nothing was written.");
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    console.error(`- ${field}: ${issue.message}`);
  }
}

function reportError(error: unknown): void {
  if (error instanceof BootstrapAbort) {
    console.error(error.message);
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      console.error("Unique constraint conflict. The transaction was rolled back.");
    } else if (error.code === "P2003") {
      console.error("Foreign key constraint failed. The transaction was rolled back.");
    } else if (error.code === "P2025") {
      console.error("A required record was missing. The transaction was rolled back.");
    } else {
      console.error(
        `Database request failed with code ${error.code}. The transaction was rolled back.`
      );
    }
    return;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    console.error("The database rejected the payload. Details are omitted.");
    return;
  }
  const name = error instanceof Error ? error.name : typeof error;
  console.error(
    `Unexpected error (${name}). Details are omitted to keep credentials out of the log.`
  );
}

async function main(): Promise<void> {
  const parsed = bootstrapEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    reportValidationErrors(parsed.error);
    process.exitCode = 1;
    return;
  }

  const { BOOTSTRAP_ADMIN_PASSWORD: password, ...safeInput } = parsed.data;

  console.log("Bootstrap input accepted.");
  for (const [key, value] of Object.entries(safeInput)) {
    console.log(`- ${key}: ${value}`);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  console.log("Checking the tenant code.");
  const existingTenant = await db.tenant.findUnique({
    where: { code: parsed.data.BOOTSTRAP_TENANT_CODE },
  });
  if (existingTenant) {
    throw new BootstrapAbort(
      `Tenant "${parsed.data.BOOTSTRAP_TENANT_CODE}" already exists. Nothing was written.`
    );
  }

  console.log("Writing bootstrap records.");
  const created = await db.$transaction(
    async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          code: parsed.data.BOOTSTRAP_TENANT_CODE,
          name: parsed.data.BOOTSTRAP_TENANT_NAME,
          isActive: true,
        },
      });

      const outlet = await tx.outlet.create({
        data: {
          tenantId: tenant.id,
          code: parsed.data.BOOTSTRAP_OUTLET_CODE,
          name: parsed.data.BOOTSTRAP_OUTLET_NAME,
          isActive: true,
        },
      });

      await tx.outletSetting.create({ data: { outletId: outlet.id } });

      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: OWNER_ROLE_NAME,
          description: "Full access to every module.",
        },
      });

      const existingPermissions = await tx.permission.findMany({
        where: { key: { in: [...PERMISSION_KEYS] } },
      });
      const existingByKey = new Map(existingPermissions.map((item) => [item.key, item]));

      const permissionIds: string[] = [];
      for (const key of PERMISSION_KEYS) {
        const expectedModule = moduleOf(key);
        const existing = existingByKey.get(key);
        if (existing) {
          if (existing.module !== expectedModule) {
            throw new BootstrapAbort(
              `Permission "${key}" already exists with module "${existing.module}" instead of "${expectedModule}". The transaction was rolled back.`
            );
          }
          permissionIds.push(existing.id);
          continue;
        }
        const stored = await tx.permission.create({
          data: { key, module: expectedModule },
        });
        permissionIds.push(stored.id);
      }

      await tx.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: parsed.data.BOOTSTRAP_ADMIN_NAME,
          email: parsed.data.BOOTSTRAP_ADMIN_EMAIL,
          passwordHash,
          isActive: true,
        },
      });

      await tx.userRole.create({
        data: { tenantId: tenant.id, userId: user.id, roleId: role.id },
      });

      await tx.userOutlet.create({
        data: { tenantId: tenant.id, userId: user.id, outletId: outlet.id },
      });

      await tx.activityLog.create({
        data: {
          tenantId: tenant.id,
          outletId: outlet.id,
          userId: user.id,
          action: "bootstrap.owner.created",
          entity: "User",
          entityId: user.id,
          before: Prisma.DbNull,
          after: {
            tenantCode: tenant.code,
            outletCode: outlet.code,
            role: OWNER_ROLE_NAME,
          },
        },
      });

      return { tenant, outlet, role, user };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  console.log("Bootstrap completed.");
  console.log(`- tenant: ${created.tenant.code}`);
  console.log(`- outlet: ${created.outlet.code}`);
  console.log(`- owner role: ${created.role.name}`);
  console.log(`- owner user: ${created.user.email}`);
  console.log(`- permissions attached: ${PERMISSION_KEYS.length}`);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    reportError(error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

void run().catch(() => {
  process.exitCode = 1;
});
