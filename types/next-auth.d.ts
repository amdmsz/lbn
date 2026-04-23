import type { DefaultSession } from "next-auth";
import type { RoleCode } from "@prisma/client";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      username: string;
      role: RoleCode;
      roleName: string;
      teamId: string | null;
      mustChangePassword: boolean;
      avatarPath: string | null;
      permissionCodes: ExtraPermissionCode[];
    };
  }

  interface User {
    id: string;
    username: string;
    role: RoleCode;
    roleName: string;
    teamId: string | null;
    mustChangePassword: boolean;
    avatarPath: string | null;
    permissionCodes: ExtraPermissionCode[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: RoleCode;
    roleName: string;
    teamId: string | null;
    mustChangePassword: boolean;
    avatarPath: string | null;
    permissionCodes: ExtraPermissionCode[];
  }
}
