import {
  OperationModule,
  OperationTargetType,
  Prisma,
  RoleCode,
  UserStatus,
} from "@prisma/client";
import { z } from "zod";
import {
  extraPermissionCodes,
  normalizeExtraPermissionCodes,
  type ExtraPermissionCode,
} from "@/lib/auth/permissions";
import {
  getUserPermissionGrantMigrationMessage,
  isMissingUserPermissionGrantTableError,
} from "@/lib/auth/permission-grants-compat";
import {
  canCreateRole,
  canManageTargetUser,
  canManageTeams,
  canSupervisorManageRole,
  type AccountActor,
} from "@/lib/account-management/access";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

const usernameSchema = z
  .string()
  .trim()
  .min(3, "账号至少需要 3 个字符")
  .max(50, "账号不能超过 50 个字符")
  .regex(/^[a-zA-Z0-9._-]+$/, "账号仅支持字母、数字、点、下划线和中划线");

const phoneSchema = z
  .string()
  .trim()
  .max(20, "手机号不能超过 20 个字符")
  .refine((value) => !value || /^[0-9+\-\s]+$/.test(value), "手机号格式不合法")
  .default("");

const userFormSchema = z.object({
  id: z.string().trim().default(""),
  username: usernameSchema,
  name: z.string().trim().min(1, "姓名不能为空").max(100, "姓名不能超过 100 个字符"),
  phone: phoneSchema,
  roleCode: z.nativeEnum(RoleCode),
  teamId: z.string().trim().default(""),
  supervisorId: z.string().trim().default(""),
});

const userIdSchema = z.object({
  userId: z.string().trim().min(1, "缺少账号 ID"),
});

const userPermissionFormSchema = z.object({
  userId: z.string().trim().min(1, "缺少账号 ID"),
  permissionCodes: z.array(z.enum(extraPermissionCodes)).default([]),
});

const teamFormSchema = z.object({
  id: z.string().trim().default(""),
  code: z.string().trim().min(1, "团队编码不能为空").max(50, "团队编码不能超过 50 个字符"),
  name: z.string().trim().min(1, "团队名称不能为空").max(100, "团队名称不能超过 100 个字符"),
  description: z
    .string()
    .trim()
    .max(1000, "团队说明不能超过 1000 个字符")
    .default(""),
  supervisorId: z.string().trim().default(""),
});

const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    nextPassword: z.string().trim().min(8, "新密码至少需要 8 个字符").max(100, "新密码过长"),
    confirmPassword: z.string().trim().min(1, "请再次输入新密码"),
  })
  .superRefine((value, ctx) => {
    if (value.nextPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "两次输入的新密码不一致",
      });
    }

    if (value.currentPassword.trim() === value.nextPassword.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextPassword"],
        message: "新密码不能与当前密码相同",
      });
    }
  });

type TransactionClient = Prisma.TransactionClient;

type ManagedUserRecord = {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  teamId: string | null;
  supervisorId: string | null;
  userStatus: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  invitedAt: Date | null;
  invitedById: string | null;
  disabledAt: Date | null;
  disabledById: string | null;
  role: {
    id: string;
    code: RoleCode;
    name: string;
  };
  team: {
    id: string;
    code: string;
    name: string;
  } | null;
  supervisor: {
    id: string;
    name: string;
    username: string;
    teamId: string | null;
    role: {
      code: RoleCode;
    };
  } | null;
  supervisedTeam: {
    id: string;
    code: string;
    name: string;
  } | null;
  permissionGrants: Array<{
    permissionCode: ExtraPermissionCode;
  }>;
};

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptional(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function normalizeCode(value: string) {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function buildUserDisplayName(user: Pick<ManagedUserRecord, "name" | "username">) {
  return `${user.name} (@${user.username})`;
}

function buildUserAuditSnapshot(user: ManagedUserRecord) {
  return {
    username: user.username,
    name: user.name,
    phone: user.phone,
    roleCode: user.role.code,
    teamId: user.teamId,
    teamName: user.team?.name ?? null,
    supervisorId: user.supervisorId,
    supervisorUsername: user.supervisor?.username ?? null,
    userStatus: user.userStatus,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    invitedAt: user.invitedAt,
    invitedById: user.invitedById,
    disabledAt: user.disabledAt,
    disabledById: user.disabledById,
    permissionCodes: normalizeExtraPermissionCodes(
      user.permissionGrants.map((item) => item.permissionCode),
    ),
  };
}

function buildTeamAuditSnapshot(team: {
  code: string;
  name: string;
  description: string | null;
  supervisorId: string | null;
  supervisor?: { username: string } | null;
}) {
  return {
    code: team.code,
    name: team.name,
    description: team.description,
    supervisorId: team.supervisorId,
    supervisorUsername: team.supervisor?.username ?? null,
  };
}

async function createOperationLog(
  tx: TransactionClient,
  data: Prisma.OperationLogCreateInput,
) {
  await tx.operationLog.create({ data });
}

async function getManagedUserRecord(
  tx: TransactionClient,
  userId: string,
): Promise<ManagedUserRecord | null> {
  try {
    return await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        teamId: true,
        supervisorId: true,
        userStatus: true,
        mustChangePassword: true,
        lastLoginAt: true,
        invitedAt: true,
        invitedById: true,
        disabledAt: true,
        disabledById: true,
        role: {
          select: {
            id: true,
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
            teamId: true,
            role: {
              select: {
                code: true,
              },
            },
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
  } catch (error) {
    if (!isMissingUserPermissionGrantTableError(error)) {
      throw error;
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        phone: true,
        teamId: true,
        supervisorId: true,
        userStatus: true,
        mustChangePassword: true,
        lastLoginAt: true,
        invitedAt: true,
        invitedById: true,
        disabledAt: true,
        disabledById: true,
        role: {
          select: {
            id: true,
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
            teamId: true,
            role: {
              select: {
                code: true,
              },
            },
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

    return user
      ? {
          ...user,
          permissionGrants: [],
        }
      : null;
  }
}

function assertCanManageUser(actor: AccountActor, user: ManagedUserRecord) {
  if (
    !canManageTargetUser(actor, {
      id: user.id,
      name: user.name,
      username: user.username,
      teamId: user.teamId,
      roleCode: user.role.code,
    })
  ) {
    throw new Error("当前角色无权管理该账号。");
  }
}

async function resolveRoleRecord(tx: TransactionClient, roleCode: RoleCode) {
  const role = await tx.role.findUnique({
    where: { code: roleCode },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!role) {
    throw new Error("目标角色不存在。");
  }

  return role;
}

async function resolveTeamRecord(tx: TransactionClient, teamId: string) {
  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!team) {
    throw new Error("团队不存在。");
  }

  return team;
}

async function resolveSupervisorRecord(
  tx: TransactionClient,
  supervisorId: string,
) {
  const supervisor = await tx.user.findUnique({
    where: { id: supervisorId },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      userStatus: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!supervisor) {
    throw new Error("直属主管不存在。");
  }

  if (supervisor.userStatus !== UserStatus.ACTIVE) {
    throw new Error("直属主管账号已禁用，请先启用后再试。");
  }

  if (supervisor.role.code !== RoleCode.SUPERVISOR) {
    throw new Error("直属主管必须是主管账号。");
  }

  return supervisor;
}

async function resolveUserWriteContext(
  tx: TransactionClient,
  actor: AccountActor,
  parsed: z.output<typeof userFormSchema>,
  existingUser?: ManagedUserRecord | null,
) {
  if (!canCreateRole(actor.role, parsed.roleCode)) {
    throw new Error("当前角色无权设置该账号角色。");
  }

  if (actor.role === RoleCode.SUPERVISOR) {
    if (!actor.teamId) {
      throw new Error("你的账号尚未归属团队，暂时无法创建或维护团队成员。");
    }

    if (!canSupervisorManageRole(parsed.roleCode)) {
      throw new Error("主管第一版仅可维护销售、运营和发货账号。");
    }

    const team = await resolveTeamRecord(tx, actor.teamId);
    return {
      role: await resolveRoleRecord(tx, parsed.roleCode),
      team,
      supervisor: {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        teamId: actor.teamId,
        role: {
          code: RoleCode.SUPERVISOR,
        },
      },
    };
  }

  const role = await resolveRoleRecord(tx, parsed.roleCode);
  const normalizedTeamId = parsed.teamId.trim();
  const normalizedSupervisorId = parsed.supervisorId.trim();

  const team =
    normalizedTeamId !== "" ? await resolveTeamRecord(tx, normalizedTeamId) : null;

  const supervisor =
    normalizedSupervisorId !== ""
      ? await resolveSupervisorRecord(tx, normalizedSupervisorId)
      : null;

  if (
    role.code !== RoleCode.ADMIN &&
    team === null
  ) {
    throw new Error("除管理员外，其他账号必须归属团队。");
  }

  if (role.code === RoleCode.SUPERVISOR && supervisor !== null) {
    throw new Error("主管账号不需要再指定直属主管。");
  }

  if (
    (role.code === RoleCode.ADMIN || role.code === RoleCode.SUPERVISOR) &&
    supervisor !== null
  ) {
    throw new Error("当前角色不支持设置直属主管。");
  }

  if (
    (role.code === RoleCode.SALES ||
      role.code === RoleCode.OPS ||
      role.code === RoleCode.SHIPPER) &&
    supervisor === null
  ) {
    throw new Error("销售、运营和发货账号必须指定直属主管。");
  }

  if (
    supervisor !== null &&
    team !== null &&
    supervisor.teamId !== team.id
  ) {
    throw new Error("直属主管必须与账号归属同一团队。");
  }

  if (existingUser?.supervisedTeam) {
    if (role.code !== RoleCode.SUPERVISOR) {
      throw new Error("当前账号已是团队主管，请先解除团队主管身份后再修改角色。");
    }

    if (team?.id !== existingUser.supervisedTeam.id) {
      throw new Error("当前账号已是团队主管，不能直接变更到其他团队。");
    }
  }

  if (supervisor?.id === existingUser?.id) {
    throw new Error("直属主管不能设置为账号本人。");
  }

  return {
    role,
    team,
    supervisor,
  };
}

export async function createManagedUser(
  actor: AccountActor,
  rawInput: z.input<typeof userFormSchema>,
) {
  const parsed = userFormSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const writeContext = await resolveUserWriteContext(tx, actor, parsed);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const createdAt = new Date();

    const created = await tx.user.create({
      data: {
        username: normalizeUsername(parsed.username),
        name: parsed.name,
        phone: normalizeOptional(parsed.phone),
        roleId: writeContext.role.id,
        teamId: writeContext.team?.id ?? null,
        supervisorId: writeContext.supervisor?.id ?? null,
        userStatus: UserStatus.ACTIVE,
        mustChangePassword: true,
        passwordHash,
        invitedAt: createdAt,
        invitedById: actor.id,
      },
      include: {
        role: {
          select: {
            id: true,
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
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.USER,
      action: "user.created",
      targetType: OperationTargetType.USER,
      targetId: created.id,
      description: `创建账号：${created.name} (@${created.username})`,
      afterData: {
        username: created.username,
        name: created.name,
        phone: created.phone,
        roleCode: created.role.code,
        teamId: created.teamId,
        teamName: created.team?.name ?? null,
        supervisorId: created.supervisorId,
        supervisorUsername: created.supervisor?.username ?? null,
        invitedAt: created.invitedAt,
        invitedById: created.invitedById,
        userStatus: created.userStatus,
        mustChangePassword: created.mustChangePassword,
      },
    });

    return {
      id: created.id,
      temporaryPassword,
      user: created,
    };
  });
}

export async function updateManagedUser(
  actor: AccountActor,
  rawInput: z.input<typeof userFormSchema>,
) {
  const parsed = userFormSchema.parse(rawInput);

  if (!parsed.id) {
    throw new Error("缺少要更新的账号 ID。");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await getManagedUserRecord(tx, parsed.id);

    if (!existing) {
      throw new Error("账号不存在。");
    }

    assertCanManageUser(actor, existing);

    if (actor.id === existing.id && actor.role === RoleCode.SUPERVISOR) {
      throw new Error("主管不能在这里维护自己的主管账号，请联系管理员处理。");
    }

    const writeContext = await resolveUserWriteContext(tx, actor, parsed, existing);

    if (
      actor.id === existing.id &&
      actor.role === RoleCode.ADMIN &&
      writeContext.role.code !== RoleCode.ADMIN
    ) {
      throw new Error("管理员不能在这里把自己的角色改成非管理员。");
    }

    const nextData =
      actor.role === RoleCode.ADMIN
        ? {
            username: normalizeUsername(parsed.username),
            name: parsed.name,
            phone: normalizeOptional(parsed.phone),
            roleId: writeContext.role.id,
            teamId: writeContext.team?.id ?? null,
            supervisorId: writeContext.supervisor?.id ?? null,
          }
        : {
            username: normalizeUsername(parsed.username),
            name: parsed.name,
            phone: normalizeOptional(parsed.phone),
          };

    const updated = await tx.user.update({
      where: { id: existing.id },
      data: nextData,
      include: {
        role: {
          select: {
            id: true,
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
            teamId: true,
            role: {
              select: {
                code: true,
              },
            },
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

    const beforeSnapshot = buildUserAuditSnapshot(existing);
    const afterSnapshot = buildUserAuditSnapshot({
      ...existing,
      ...updated,
      phone: updated.phone,
      teamId: updated.teamId,
      supervisorId: updated.supervisorId,
      role: updated.role,
      team: updated.team,
      supervisor:
        updated.supervisor !== null
          ? updated.supervisor
          : null,
      supervisedTeam: updated.supervisedTeam,
    } satisfies ManagedUserRecord);

    const basicFieldsChanged =
      beforeSnapshot.username !== afterSnapshot.username ||
      beforeSnapshot.name !== afterSnapshot.name ||
      beforeSnapshot.phone !== afterSnapshot.phone;

    if (basicFieldsChanged) {
      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.USER,
        action: "user.updated",
        targetType: OperationTargetType.USER,
        targetId: updated.id,
        description: `更新账号基础信息：${buildUserDisplayName(updated)}`,
        beforeData: {
          username: beforeSnapshot.username,
          name: beforeSnapshot.name,
          phone: beforeSnapshot.phone,
        },
        afterData: {
          username: afterSnapshot.username,
          name: afterSnapshot.name,
          phone: afterSnapshot.phone,
        },
      });
    }

    if (beforeSnapshot.roleCode !== afterSnapshot.roleCode) {
      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.USER,
        action: "user.role_changed",
        targetType: OperationTargetType.USER,
        targetId: updated.id,
        description: `调整账号角色：${buildUserDisplayName(updated)}`,
        beforeData: {
          roleCode: beforeSnapshot.roleCode,
        },
        afterData: {
          roleCode: afterSnapshot.roleCode,
        },
      });
    }

    if (beforeSnapshot.teamId !== afterSnapshot.teamId) {
      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.USER,
        action: "user.team_changed",
        targetType: OperationTargetType.USER,
        targetId: updated.id,
        description: `调整账号团队：${buildUserDisplayName(updated)}`,
        beforeData: {
          teamId: beforeSnapshot.teamId,
          teamName: beforeSnapshot.teamName,
        },
        afterData: {
          teamId: afterSnapshot.teamId,
          teamName: afterSnapshot.teamName,
        },
      });
    }

    if (beforeSnapshot.supervisorId !== afterSnapshot.supervisorId) {
      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.USER,
        action: "user.supervisor_changed",
        targetType: OperationTargetType.USER,
        targetId: updated.id,
        description: `调整直属主管：${buildUserDisplayName(updated)}`,
        beforeData: {
          supervisorId: beforeSnapshot.supervisorId,
          supervisorUsername: beforeSnapshot.supervisorUsername,
        },
        afterData: {
          supervisorId: afterSnapshot.supervisorId,
          supervisorUsername: afterSnapshot.supervisorUsername,
        },
      });
    }

    return updated;
  });
}

export async function updateManagedUserPermissions(
  actor: AccountActor,
  rawInput: z.input<typeof userPermissionFormSchema>,
) {
  if (actor.role !== RoleCode.ADMIN) {
    throw new Error("只有管理员可以调整账号的额外权限。");
  }

  const parsed = userPermissionFormSchema.parse(rawInput);

  try {
    return await prisma.$transaction(async (tx) => {
    const existing = await getManagedUserRecord(tx, parsed.userId);

    if (!existing) {
      throw new Error("账号不存在。");
    }

    assertCanManageUser(actor, existing);

    const beforePermissionCodes = normalizeExtraPermissionCodes(
      existing.permissionGrants.map((item) => item.permissionCode),
    );
    const nextPermissionCodes = normalizeExtraPermissionCodes(parsed.permissionCodes);
    const beforeSet = new Set(beforePermissionCodes);
    const nextSet = new Set(nextPermissionCodes);

    const addedPermissions = nextPermissionCodes.filter((code) => !beforeSet.has(code));
    const removedPermissions = beforePermissionCodes.filter((code) => !nextSet.has(code));

    if (addedPermissions.length === 0 && removedPermissions.length === 0) {
      return {
        userId: existing.id,
        permissionCodes: beforePermissionCodes,
      };
    }

    if (removedPermissions.length > 0) {
      await tx.userPermissionGrant.deleteMany({
        where: {
          userId: existing.id,
          permissionCode: {
            in: removedPermissions,
          },
        },
      });
    }

    if (addedPermissions.length > 0) {
      await tx.userPermissionGrant.createMany({
        data: addedPermissions.map((permissionCode) => ({
          userId: existing.id,
          permissionCode,
          grantedById: actor.id,
        })),
      });
    }

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.USER,
      action: "user.permissions_updated",
      targetType: OperationTargetType.USER,
      targetId: existing.id,
      description: `调整账号额外权限：${buildUserDisplayName(existing)}`,
      beforeData: {
        permissionCodes: beforePermissionCodes,
      },
      afterData: {
        permissionCodes: nextPermissionCodes,
        addedPermissions,
        removedPermissions,
      },
    });

    return {
      userId: existing.id,
      permissionCodes: nextPermissionCodes,
    };
    });
  } catch (error) {
    if (isMissingUserPermissionGrantTableError(error)) {
      throw new Error(getUserPermissionGrantMigrationMessage());
    }

    throw error;
  }
}

export async function resetManagedUserPassword(
  actor: AccountActor,
  rawInput: z.input<typeof userIdSchema>,
) {
  const parsed = userIdSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const existing = await getManagedUserRecord(tx, parsed.userId);

    if (!existing) {
      throw new Error("账号不存在。");
    }

    assertCanManageUser(actor, existing);

    if (actor.id === existing.id) {
      throw new Error("请使用改密页面修改自己的密码。");
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const updated = await tx.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        mustChangePassword: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.USER,
      action: "user.password_reset",
      targetType: OperationTargetType.USER,
      targetId: updated.id,
      description: `重置账号密码：${updated.name} (@${updated.username})`,
      beforeData: {
        mustChangePassword: existing.mustChangePassword,
      },
      afterData: {
        mustChangePassword: updated.mustChangePassword,
      },
    });

    return {
      temporaryPassword,
      user: updated,
    };
  });
}

export async function toggleManagedUserStatus(
  actor: AccountActor,
  rawInput: z.input<typeof userIdSchema>,
) {
  const parsed = userIdSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const existing = await getManagedUserRecord(tx, parsed.userId);

    if (!existing) {
      throw new Error("账号不存在。");
    }

    assertCanManageUser(actor, existing);

    if (actor.id === existing.id && existing.userStatus === UserStatus.ACTIVE) {
      throw new Error("不能禁用自己的账号。");
    }

    const nextStatus =
      existing.userStatus === UserStatus.ACTIVE
        ? UserStatus.INACTIVE
        : UserStatus.ACTIVE;
    const nextDisabledAt =
      nextStatus === UserStatus.INACTIVE ? new Date() : null;
    const nextDisabledById =
      nextStatus === UserStatus.INACTIVE ? actor.id : null;

    const updated = await tx.user.update({
      where: { id: existing.id },
      data: {
        userStatus: nextStatus,
        disabledAt: nextDisabledAt,
        disabledById: nextDisabledById,
      },
      select: {
        id: true,
        username: true,
        name: true,
        userStatus: true,
        disabledAt: true,
        disabledById: true,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.USER,
      action:
        nextStatus === UserStatus.INACTIVE ? "user.disabled" : "user.enabled",
      targetType: OperationTargetType.USER,
      targetId: updated.id,
      description: `${nextStatus === UserStatus.INACTIVE ? "禁用" : "启用"}账号：${updated.name} (@${updated.username})`,
      beforeData: {
        userStatus: existing.userStatus,
        disabledAt: existing.disabledAt,
        disabledById: existing.disabledById,
      },
      afterData: {
        userStatus: updated.userStatus,
        disabledAt: updated.disabledAt,
        disabledById: updated.disabledById,
      },
    });

    return updated;
  });
}

export async function upsertTeam(
  actor: AccountActor,
  rawInput: z.input<typeof teamFormSchema>,
) {
  if (!canManageTeams(actor.role)) {
    throw new Error("只有管理员可以维护团队。");
  }

  const parsed = teamFormSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const normalizedCode = normalizeCode(parsed.code);

    if (!parsed.id) {
      const created = await tx.team.create({
        data: {
          code: normalizedCode,
          name: parsed.name,
          description: normalizeOptional(parsed.description),
        },
        include: {
          supervisor: {
            select: {
              username: true,
            },
          },
        },
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.TEAM,
        action: "team.created",
        targetType: OperationTargetType.TEAM,
        targetId: created.id,
        description: `创建团队：${created.name}`,
        afterData: buildTeamAuditSnapshot(created),
      });

      return created;
    }

    const existing = await tx.team.findUnique({
      where: { id: parsed.id },
      include: {
        supervisor: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!existing) {
      throw new Error("团队不存在。");
    }

    let nextSupervisorId: string | null = null;

    if (parsed.supervisorId.trim()) {
      const supervisor = await resolveSupervisorRecord(tx, parsed.supervisorId.trim());

      if (supervisor.teamId !== existing.id) {
        throw new Error("请先在账号页把该主管归属到当前团队，再指定为团队主管。");
      }

      const occupiedTeam = await tx.team.findFirst({
        where: {
          supervisorId: supervisor.id,
          id: {
            not: existing.id,
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (occupiedTeam) {
        throw new Error(`该主管已负责团队“${occupiedTeam.name}”，请先解除原关联。`);
      }

      nextSupervisorId = supervisor.id;
    }

    const updated = await tx.team.update({
      where: { id: existing.id },
      data: {
        code: normalizedCode,
        name: parsed.name,
        description: normalizeOptional(parsed.description),
        supervisorId: nextSupervisorId,
      },
      include: {
        supervisor: {
          select: {
            username: true,
          },
        },
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.TEAM,
      action: "team.updated",
      targetType: OperationTargetType.TEAM,
      targetId: updated.id,
      description: `更新团队：${updated.name}`,
      beforeData: buildTeamAuditSnapshot(existing),
      afterData: buildTeamAuditSnapshot(updated),
    });

    if (existing.supervisorId !== updated.supervisorId) {
      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.TEAM,
        action: "team.supervisor_changed",
        targetType: OperationTargetType.TEAM,
        targetId: updated.id,
        description: `调整团队主管：${updated.name}`,
        beforeData: {
          supervisorId: existing.supervisorId,
          supervisorUsername: existing.supervisor?.username ?? null,
        },
        afterData: {
          supervisorId: updated.supervisorId,
          supervisorUsername: updated.supervisor?.username ?? null,
        },
      });
    }

    return updated;
  });
}

export async function changeOwnPassword(
  actor: AccountActor,
  rawInput: z.input<typeof changeOwnPasswordSchema>,
) {
  const parsed = changeOwnPasswordSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        username: true,
        name: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      throw new Error("当前账号不存在。");
    }

    const valid = await verifyPassword(parsed.currentPassword, user.passwordHash);

    if (!valid) {
      throw new Error("当前密码不正确。");
    }

    const passwordHash = await hashPassword(parsed.nextPassword);

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.USER,
      action: "user.password_changed",
      targetType: OperationTargetType.USER,
      targetId: user.id,
      description: `更新账号密码：${user.name} (@${user.username})`,
      beforeData: {
        mustChangePassword: user.mustChangePassword,
      },
      afterData: {
        mustChangePassword: false,
      },
    });

    return {
      id: user.id,
      mustChangePassword: false,
    };
  });
}
