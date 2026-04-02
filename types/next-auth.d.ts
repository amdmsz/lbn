import type { DefaultSession } from "next-auth";
import type { RoleCode } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: RoleCode;
      roleName: string;
      mustChangePassword: boolean;
    };
  }

  interface User {
    id: string;
    username: string;
    role: RoleCode;
    roleName: string;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: RoleCode;
    roleName: string;
    mustChangePassword: boolean;
  }
}
