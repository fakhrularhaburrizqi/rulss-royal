import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { loginCredentialsSchema } from "@/lib/validators/auth.validator";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/services/password.service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginCredentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { tenantCode, email, password } = parsed.data;

        const tenant = await db.tenant.findUnique({
          where: { code: tenantCode },
        });

        if (!tenant || !tenant.isActive || tenant.deletedAt) {
          return null;
        }

        const user = await db.user.findUnique({
          where: {
            tenantId_email: {
              tenantId: tenant.id,
              email,
            },
          },
          include: {
            userOutlets: {
              include: {
                outlet: true,
              },
            },
          },
        });

        if (!user || !user.isActive || user.deletedAt || !user.passwordHash) {
          return null;
        }

        const isPasswordValid = await verifyPassword(password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        const activeOutlets = user.userOutlets.filter(
          (uo: { outlet: { isActive: boolean; deletedAt: Date | null } }) =>
            uo.outlet.isActive && !uo.outlet.deletedAt
        );

        let activeOutletId: string | null = null;
        if (activeOutlets.length === 1) {
          activeOutletId = activeOutlets[0].outletId;
        }

        return {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          activeOutletId,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
        token.activeOutletId = user.activeOutletId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.userId as string;
        session.user.tenantId = token.tenantId as string;
        session.user.activeOutletId = (token.activeOutletId as string) ?? null;
      }
      return session;
    },
  },
});
