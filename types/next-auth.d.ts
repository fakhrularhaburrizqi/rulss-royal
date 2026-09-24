import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      activeOutletId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    tenantId: string;
    activeOutletId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    tenantId: string;
    activeOutletId: string | null;
  }
}
