import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { UserStatus } from "@prisma/client";
import { z } from "zod";
import { roleLabels } from "@/lib/auth/access";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

const credentialsSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

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

        const user = await prisma.user.findUnique({
          where: { username: parsed.data.username },
          include: { role: true },
        });

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
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
        session.user.roleName = token.roleName;
        session.user.mustChangePassword = token.mustChangePassword;
      }

      return session;
    },
  },
};
