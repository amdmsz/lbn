import { RoleCode, UserStatus, type Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import {
  canAccessAccountManagement,
  canManageTargetUser,
  canManageTeams,
  getAccountActor,
  getCreatableRoleCodes,
  getVisibleTeamWhereInput,
  getVisibleUserWhereInput,
} from "@/lib/account-management/access";
import { parseAccountManagementNotice } from "@/lib/account-management/metadata";
import {
  extraPermissionOptions,
  normalizeExtraPermissionCodes,
} from "@/lib/auth/permissions";
import { isMissingUserPermissionGrantTableError } from "@/lib/auth/permission-grants-compat";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type AccountViewer = {
  id: string;
  role: RoleCode;
};

export type UserDirectoryFilters = {
  search: string;
  role: RoleCode | "";
  teamId: string;
  userStatus: UserStatus | "";
};

const userDirectoryFiltersSchema = z.object({
  search: z.string().trim().default(""),
  role: z.union([z.nativeEnum(RoleCode), z.literal("")]).default(""),
  teamId: z.string().trim().default(""),
  userStatus: z.union([z.nativeEnum(UserStatus), z.literal("")]).default(""),
});

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseUserDirectoryFilters(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
  viewerRole: RoleCode,
  viewerTeamId: string | null,
): UserDirectoryFilters {
  const parsed = userDirectoryFiltersSchema.parse({
    search: getParamValue(rawSearchParams?.search),
    role: getParamValue(rawSearchParams?.role),
    teamId: getParamValue(rawSearchParams?.teamId),
    userStatus: getParamValue(rawSearchParams?.userStatus),
  });

  if (viewerRole === "SUPERVISOR") {
    return {
      ...parsed,
      teamId: viewerTeamId ?? "",
    };
  }

  return parsed;
}

function buildUserDirectoryWhereInput(
  visibleWhere: Prisma.UserWhereInput,
  filters: UserDirectoryFilters,
) {
  const andClauses: Prisma.UserWhereInput[] = [visibleWhere];

  if (filters.search) {
    andClauses.push({
      OR: [
        {
          name: {
            contains: filters.search,
          },
        },
        {
          username: {
            contains: filters.search,
          },
        },
        {
          phone: {
            contains: filters.search,
          },
        },
      ],
    });
  }

  if (filters.role) {
    andClauses.push({
      role: {
        code: filters.role,
      },
    });
  }

  if (filters.teamId) {
    andClauses.push({
      teamId: filters.teamId,
    });
  }

  if (filters.userStatus) {
    andClauses.push({
      userStatus: filters.userStatus,
    });
  }

  return {
    AND: andClauses,
  } satisfies Prisma.UserWhereInput;
}

function sortRoleOptions(roles: Pick<Role, "code" | "name">[]) {
  const order: RoleCode[] = ["ADMIN", "SUPERVISOR", "SALES", "OPS", "SHIPPER"];
  return [...roles].sort(
    (left, right) => order.indexOf(left.code) - order.indexOf(right.code),
  );
}

async function getUserDetailRecord(
  visibleWhere: Prisma.UserWhereInput,
  targetUserId: string,
) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        AND: [visibleWhere, { id: targetUserId }],
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        teamId: true,
        userStatus: true,
        mustChangePassword: true,
        lastLoginAt: true,
        invitedAt: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
        team: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        disabledBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        supervisedTeam: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        permissionGrants: {
          orderBy: {
            permissionCode: "asc",
          },
          select: {
            permissionCode: true,
          },
        },
      },
    });

    return {
      user,
      permissionGrantTableReady: true,
    };
  } catch (error) {
    if (!isMissingUserPermissionGrantTableError(error)) {
      throw error;
    }

    const user = await prisma.user.findFirst({
      where: {
        AND: [visibleWhere, { id: targetUserId }],
      },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        teamId: true,
        userStatus: true,
        mustChangePassword: true,
        lastLoginAt: true,
        invitedAt: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            code: true,
            name: true,
          },
        },
        team: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        supervisor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        invitedBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        disabledBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        supervisedTeam: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    return {
      user: user
        ? {
            ...user,
            permissionGrants: [],
          }
        : null,
      permissionGrantTableReady: false,
    };
  }
}

export async function getUsersPageData(
  viewer: AccountViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessAccountManagement(viewer.role)) {
    throw new Error("当前角色无权访问账号管理。");
  }

  const actor = await getAccountActor(viewer.id);
  const visibleWhere = getVisibleUserWhereInput(actor);
  const filters = parseUserDirectoryFilters(rawSearchParams, actor.role, actor.teamId);
  const where = buildUserDirectoryWhereInput(visibleWhere, filters);

  const [teams, activeSupervisors, roles, scopedTotalCount, activeCount, inactiveCount, items] =
    await Promise.all([
      prisma.team.findMany({
        where:
          actor.role === "ADMIN"
            ? {}
            : actor.teamId
              ? { id: actor.teamId }
              : { id: "__missing_team_scope__" },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      prisma.user.findMany({
        where:
          actor.role === "ADMIN"
            ? {
                userStatus: UserStatus.ACTIVE,
                role: {
                  code: RoleCode.SUPERVISOR,
                },
              }
            : actor.teamId
              ? {
                  userStatus: UserStatus.ACTIVE,
                  role: {
                    code: RoleCode.SUPERVISOR,
                  },
                  teamId: actor.teamId,
                }
              : {
                  id: "__missing_team_scope__",
                },
        orderBy: [{ name: "asc" }, { username: "asc" }],
        select: {
          id: true,
          name: true,
          username: true,
          teamId: true,
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.role.findMany({
        where: {
          code: {
            in: getCreatableRoleCodes(actor.role),
          },
        },
        select: {
          code: true,
          name: true,
        },
      }),
      prisma.user.count({ where: visibleWhere }),
      prisma.user.count({
        where: {
          AND: [visibleWhere, { userStatus: UserStatus.ACTIVE }],
        },
      }),
      prisma.user.count({
        where: {
          AND: [visibleWhere, { userStatus: UserStatus.INACTIVE }],
        },
      }),
      prisma.user.findMany({
        where,
        orderBy: [
          { role: { code: "asc" } },
          { team: { name: "asc" } },
          { createdAt: "asc" },
        ],
        select: {
          id: true,
          username: true,
          name: true,
          phone: true,
          teamId: true,
          userStatus: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
          role: {
            select: {
              code: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          supervisor: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      }),
    ]);

  return {
    actor,
    filters,
    notice: parseAccountManagementNotice(rawSearchParams),
    canManageTeams: canManageTeams(actor.role),
    managementScope:
      actor.role === "ADMIN"
        ? "company"
        : actor.teamId
          ? "team"
          : "team_unassigned",
    summary: {
      scopedTotalCount,
      activeCount,
      inactiveCount,
      teamCount: teams.length,
    },
    items: items.map((item) => ({
      ...item,
      canManage: canManageTargetUser(actor, {
        id: item.id,
        name: item.name,
        username: item.username,
        teamId: item.teamId,
        roleCode: item.role.code,
      }),
    })),
    teamOptions: teams,
    supervisorOptions: activeSupervisors,
    roleOptions: sortRoleOptions(roles),
  };
}

export async function getUserDetailData(viewer: AccountViewer, targetUserId: string) {
  if (!canAccessAccountManagement(viewer.role)) {
    throw new Error("当前角色无权访问账号管理。");
  }

  const actor = await getAccountActor(viewer.id);
  const visibleWhere = getVisibleUserWhereInput(actor);

  const detailRecord = await getUserDetailRecord(visibleWhere, targetUserId);
  const user = detailRecord.user;

  if (!user) {
    return null;
  }

  const [teams, activeSupervisors, operationLogs] = await Promise.all([
    prisma.team.findMany({
      where:
        actor.role === "ADMIN"
          ? {}
          : actor.teamId
            ? { id: actor.teamId }
            : { id: "__missing_team_scope__" },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
    prisma.user.findMany({
      where:
        actor.role === "ADMIN"
          ? {
              userStatus: UserStatus.ACTIVE,
              role: {
                code: RoleCode.SUPERVISOR,
              },
            }
          : actor.teamId
            ? {
                userStatus: UserStatus.ACTIVE,
                role: {
                  code: RoleCode.SUPERVISOR,
                },
                teamId: actor.teamId,
              }
            : {
                id: "__missing_team_scope__",
              },
      orderBy: [{ name: "asc" }, { username: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.operationLog.findMany({
      where: {
        targetType: "USER",
        targetId: user.id,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        module: true,
        action: true,
        description: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    }),
  ]);

  return {
    actor,
    user,
    canManage: canManageTargetUser(actor, {
      id: user.id,
      name: user.name,
      username: user.username,
      teamId: user.teamId,
      roleCode: user.role.code,
    }),
    canManagePermissions:
      actor.role === RoleCode.ADMIN &&
      detailRecord.permissionGrantTableReady &&
      canManageTargetUser(actor, {
        id: user.id,
        name: user.name,
        username: user.username,
        teamId: user.teamId,
        roleCode: user.role.code,
      }),
    permissionOptions: extraPermissionOptions,
    grantedPermissionCodes: normalizeExtraPermissionCodes(
      user.permissionGrants.map((item) => item.permissionCode),
    ),
    roleOptions: sortRoleOptions(
      await prisma.role.findMany({
        where: {
          code: {
            in: getCreatableRoleCodes(actor.role),
          },
        },
        select: {
          code: true,
          name: true,
        },
      }),
    ),
    teamOptions: teams,
    supervisorOptions: activeSupervisors,
    operationLogs,
  };
}

export async function getTeamsPageData(
  viewer: AccountViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessAccountManagement(viewer.role)) {
    throw new Error("当前角色无权访问团队管理。");
  }

  const actor = await getAccountActor(viewer.id);
  const where = getVisibleTeamWhereInput(actor);

  const [teams, activeSupervisors] = await Promise.all([
    prisma.team.findMany({
      where,
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        supervisorId: true,
        createdAt: true,
        updatedAt: true,
        supervisor: {
          select: {
            id: true,
            name: true,
            username: true,
            userStatus: true,
          },
        },
        users: {
          orderBy: [{ role: { code: "asc" } }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            userStatus: true,
            role: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            users: true,
          },
        },
      },
    }),
    canManageTeams(actor.role)
      ? prisma.user.findMany({
          where: {
            userStatus: UserStatus.ACTIVE,
            role: {
              code: RoleCode.SUPERVISOR,
            },
          },
          orderBy: [{ name: "asc" }, { username: "asc" }],
          select: {
            id: true,
            name: true,
            username: true,
            teamId: true,
            supervisedTeam: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    actor,
    notice: parseAccountManagementNotice(rawSearchParams),
    canManageTeams: canManageTeams(actor.role),
    teams,
    supervisorOptions: activeSupervisors,
  };
}
