import { type Prisma, type RoleCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type AccountActor = {
  id: string;
  name: string;
  username: string;
  role: RoleCode;
  teamId: string | null;
};

export type ManagedUserSnapshot = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  roleCode: RoleCode;
};

export const supervisorCreatableRoleCodes = ["SALES", "OPS", "SHIPPER"] as const;

export function canAccessAccountManagement(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canManageTeams(role: RoleCode) {
  return role === "ADMIN";
}

export function canCreateRole(role: RoleCode, targetRole: RoleCode) {
  if (role === "ADMIN") {
    return true;
  }

  if (role === "SUPERVISOR") {
    return supervisorCreatableRoleCodes.includes(
      targetRole as (typeof supervisorCreatableRoleCodes)[number],
    );
  }

  return false;
}

export function getCreatableRoleCodes(role: RoleCode): RoleCode[] {
  if (role === "ADMIN") {
    return ["ADMIN", "SUPERVISOR", "SALES", "OPS", "SHIPPER"];
  }

  if (role === "SUPERVISOR") {
    return [...supervisorCreatableRoleCodes];
  }

  return [];
}

export function getVisibleUserWhereInput(actor: AccountActor): Prisma.UserWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      teamId: actor.teamId,
    };
  }

  throw new Error("当前角色无权访问账号管理。");
}

export function getVisibleTeamWhereInput(actor: AccountActor): Prisma.TeamWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      id: actor.teamId,
    };
  }

  throw new Error("当前角色无权访问团队管理。");
}

export function canSupervisorManageRole(role: RoleCode) {
  return supervisorCreatableRoleCodes.includes(
    role as (typeof supervisorCreatableRoleCodes)[number],
  );
}

export function canManageTargetUser(actor: AccountActor, target: ManagedUserSnapshot) {
  if (actor.role === "ADMIN") {
    return true;
  }

  if (actor.role !== "SUPERVISOR") {
    return false;
  }

  return (
    actor.teamId !== null &&
    target.teamId === actor.teamId &&
    canSupervisorManageRole(target.roleCode)
  );
}

export async function getAccountActor(userId: string): Promise<AccountActor> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("当前账号不存在或已失效。");
  }

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role.code,
    teamId: user.teamId,
  };
}
