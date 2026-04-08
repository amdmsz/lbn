import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserStatus } from "@prisma/client";
import { z } from "zod";
import { isMissingUserPermissionGrantTableError } from "@/lib/auth/permission-grants-compat";
import { normalizeExtraPermissionCodes } from "@/lib/auth/permissions";
import { roleLabels } from "@/lib/auth/access";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

async function findAuthUserByUsername(username: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        role: true,
        permissionGrants: {
          select: {
            permissionCode: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      permissionGrants: user.permissionGrants,
    };
  } catch (error) {
    if (!isMissingUserPermissionGrantTableError(error)) {
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        role: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      permissionGrants: [],
    };
  }
}

async function findLatestAccessByUserId(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            code: true,
          },
        },
        mustChangePassword: true,
        permissionGrants: {
          select: {
            permissionCode: true,
          },
        },
      },
    });

    return user
      ? {
          ...user,
          permissionGrants: user.permissionGrants,
        }
      : null;
  } catch (error) {
    if (!isMissingUserPermissionGrantTableError(error)) {
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            code: true,
          },
        },
        mustChangePassword: true,
      },
    });

    return user
      ? {
          ...user,
          permissionGrants: [],
        }
      : null;
  }
}

async function findLatestProfileByUserId(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        avatarPath: true,
        permissionGrants: {
          select: {
            permissionCode: true,
          },
        },
      },
    });

    return user
      ? {
          ...user,
          permissionGrants: user.permissionGrants,
        }
      : null;
  } catch (error) {
    if (!isMissingUserPermissionGrantTableError(error)) {
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        avatarPath: true,
      },
    });

    return user
      ? {
          ...user,
          permissionGrants: [],
        }
      : null;
  }
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "本地账号登录",
      credentials: {
        username: { label: "账号", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);

        if (!parsed.success) {
          return null;
        }

        const user = await findAuthUserByUsername(parsed.data.username);

        if (!user || user.userStatus !== UserStatus.ACTIVE) {
          return null;
        }

        const passwordValid = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );

        if (!passwordValid) {
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
          },
        });

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role.code,
          roleName: roleLabels[user.role.code],
          mustChangePassword: user.mustChangePassword,
          avatarPath: user.avatarPath ?? null,
          permissionCodes: normalizeExtraPermissionCodes(
            user.permissionGrants.map((item) => item.permissionCode),
          ),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.roleName = user.roleName;
        token.mustChangePassword = user.mustChangePassword;
        token.avatarPath = user.avatarPath;
        token.permissionCodes = user.permissionCodes;
      } else if (token.id) {
        const latestAccess = await findLatestAccessByUserId(token.id);

        if (latestAccess) {
          token.role = latestAccess.role.code;
          token.roleName = roleLabels[latestAccess.role.code];
          token.mustChangePassword = latestAccess.mustChangePassword;
          token.permissionCodes = normalizeExtraPermissionCodes(
            latestAccess.permissionGrants.map((item) => item.permissionCode),
          );
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const latestProfile = await findLatestProfileByUserId(token.id);

        session.user.id = token.id;
        session.user.name = latestProfile?.name ?? session.user.name;
        session.user.username = token.username;
        session.user.role = token.role;
        session.user.roleName = token.roleName;
        session.user.mustChangePassword = token.mustChangePassword;
        session.user.avatarPath = latestProfile?.avatarPath ?? token.avatarPath ?? null;
        session.user.permissionCodes =
          latestProfile?.permissionGrants
            ? normalizeExtraPermissionCodes(
                latestProfile.permissionGrants.map((item) => item.permissionCode),
              )
            : token.permissionCodes ?? [];
      }

      return session;
    },
  },
};
