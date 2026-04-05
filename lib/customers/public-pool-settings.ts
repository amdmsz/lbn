import {
  OperationModule,
  OperationTargetType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canManageCustomerPublicPool } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  customerPublicPoolSettingFieldLabels,
  defaultTeamPublicPoolSettingValues,
  publicPoolAutoAssignStrategyLabels,
  type PublicPoolAutoAssignStrategyValue,
  type TeamPublicPoolSettingValues,
} from "@/lib/customers/public-pool-metadata";

type SearchParamsValue = string | string[] | undefined;
type DbClient = Prisma.TransactionClient | typeof prisma;

const mutableTeamPublicPoolSettingKeys = [
  "autoRecycleEnabled",
  "ownerExitRecycleEnabled",
  "autoAssignEnabled",
  "autoAssignStrategy",
  "autoAssignBatchSize",
  "maxActiveCustomersPerSales",
  "defaultInactiveDays",
  "respectClaimLock",
  "strongEffectProtectionDays",
  "mediumEffectProtectionDays",
  "weakEffectResetsClock",
  "negativeRequiresSupervisorReview",
  "salesCanClaim",
  "salesCanRelease",
  "batchRecycleEnabled",
  "batchAssignEnabled",
] as const satisfies Array<Exclude<keyof TeamPublicPoolSettingValues, "roundRobinCursorUserId">>;

const teamPublicPoolSettingSelect = {
  id: true,
  teamId: true,
  autoRecycleEnabled: true,
  ownerExitRecycleEnabled: true,
  autoAssignEnabled: true,
  autoAssignStrategy: true,
  autoAssignBatchSize: true,
  maxActiveCustomersPerSales: true,
  roundRobinCursorUserId: true,
  defaultInactiveDays: true,
  respectClaimLock: true,
  strongEffectProtectionDays: true,
  mediumEffectProtectionDays: true,
  weakEffectResetsClock: true,
  negativeRequiresSupervisorReview: true,
  salesCanClaim: true,
  salesCanRelease: true,
  batchRecycleEnabled: true,
  batchAssignEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TeamPublicPoolSettingSelect;

type TeamPublicPoolSettingRecord = Prisma.TeamPublicPoolSettingGetPayload<{
  select: typeof teamPublicPoolSettingSelect;
}>;

export type ResolvedTeamPublicPoolSetting = TeamPublicPoolSettingValues & {
  teamId: string | null;
  source: "default" | "custom";
  recordId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CustomerPublicPoolSettingsPageData = {
  actor: {
    id: string;
    role: RoleCode;
    teamId: string | null;
    name: string;
  };
  canManageAcrossTeams: boolean;
  selectedTeam: {
    id: string;
    code: string;
    name: string;
  } | null;
  teamOptions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  setting: ResolvedTeamPublicPoolSetting;
  roundRobinCursorUser: {
    id: string;
    name: string;
    username: string;
  } | null;
  notice: {
    tone: "success" | "danger";
    message: string;
  } | null;
  policySummary: Array<{
    label: string;
    value: string;
    hint: string;
  }>;
  reservedRules: Array<{
    label: string;
    description: string;
  }>;
};

export type TeamPublicPoolSettingMutationInput = Omit<
  TeamPublicPoolSettingValues,
  "roundRobinCursorUserId"
> & {
  teamId: string;
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function mapRecordToValues(record: TeamPublicPoolSettingRecord): TeamPublicPoolSettingValues {
  return {
    autoRecycleEnabled: record.autoRecycleEnabled,
    ownerExitRecycleEnabled: record.ownerExitRecycleEnabled,
    autoAssignEnabled: record.autoAssignEnabled,
    autoAssignStrategy: record.autoAssignStrategy,
    autoAssignBatchSize: record.autoAssignBatchSize,
    maxActiveCustomersPerSales: record.maxActiveCustomersPerSales,
    roundRobinCursorUserId: record.roundRobinCursorUserId,
    defaultInactiveDays: record.defaultInactiveDays,
    respectClaimLock: record.respectClaimLock,
    strongEffectProtectionDays: record.strongEffectProtectionDays,
    mediumEffectProtectionDays: record.mediumEffectProtectionDays,
    weakEffectResetsClock: record.weakEffectResetsClock,
    negativeRequiresSupervisorReview: record.negativeRequiresSupervisorReview,
    salesCanClaim: record.salesCanClaim,
    salesCanRelease: record.salesCanRelease,
    batchRecycleEnabled: record.batchRecycleEnabled,
    batchAssignEnabled: record.batchAssignEnabled,
  };
}

function isDefaultTeamPublicPoolConfigValues(input: TeamPublicPoolSettingValues) {
  return mutableTeamPublicPoolSettingKeys.every(
    (key) => input[key] === defaultTeamPublicPoolSettingValues[key],
  );
}

function buildResolvedSetting(
  teamId: string | null,
  record: TeamPublicPoolSettingRecord | null,
): ResolvedTeamPublicPoolSetting {
  if (!record) {
    return {
      teamId,
      source: "default",
      recordId: null,
      createdAt: null,
      updatedAt: null,
      ...defaultTeamPublicPoolSettingValues,
    };
  }

  const values = mapRecordToValues(record);

  return {
    teamId,
    source: isDefaultTeamPublicPoolConfigValues(values) ? "default" : "custom",
    recordId: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...values,
  };
}

function formatBooleanLabel(value: boolean, yesLabel = "启用", noLabel = "关闭") {
  return value ? yesLabel : noLabel;
}

function formatNullableNumber(value: number | null, emptyLabel = "不设上限") {
  return value === null ? emptyLabel : String(value);
}

function formatSettingValue(
  key: keyof TeamPublicPoolSettingValues,
  value: TeamPublicPoolSettingValues[keyof TeamPublicPoolSettingValues],
) {
  if (key === "autoAssignStrategy") {
    return publicPoolAutoAssignStrategyLabels[value as PublicPoolAutoAssignStrategyValue];
  }

  if (key === "maxActiveCustomersPerSales") {
    return formatNullableNumber(value as number | null);
  }

  if (key === "roundRobinCursorUserId") {
    return value ? String(value) : "未记录";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function formatSettingChangeSummary(
  beforeValues: TeamPublicPoolSettingValues,
  afterValues: TeamPublicPoolSettingValues,
) {
  return (Object.keys(customerPublicPoolSettingFieldLabels) as Array<
    keyof TeamPublicPoolSettingValues
  >)
    .filter((key) => beforeValues[key] !== afterValues[key])
    .map(
      (key) =>
        `${customerPublicPoolSettingFieldLabels[key]}: ${formatSettingValue(
          key,
          beforeValues[key],
        )} -> ${formatSettingValue(key, afterValues[key])}`,
    );
}

async function getSettingsActor(viewer: { id: string; role: RoleCode }) {
  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: {
      id: true,
      name: true,
      teamId: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("Current user is unavailable.");
  }

  return {
    id: user.id,
    name: user.name,
    teamId: user.teamId,
    role: user.role.code,
  };
}

async function getSettingsActorById(actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      name: true,
      teamId: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("Current user is unavailable.");
  }

  return {
    id: user.id,
    name: user.name,
    teamId: user.teamId,
    role: user.role.code,
  };
}

async function getVisibleTeamOptionsForActor(actor: {
  role: RoleCode;
  teamId: string | null;
}) {
  if (actor.role === "ADMIN") {
    return prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    });
  }

  if (!actor.teamId) {
    return [];
  }

  return prisma.team.findMany({
    where: { id: actor.teamId },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });
}

async function resolveSelectedTeam(
  actor: {
    role: RoleCode;
    teamId: string | null;
  },
  requestedTeamId?: string | null,
) {
  if (actor.role === "ADMIN") {
    const teamId = requestedTeamId?.trim() || null;

    if (!teamId) {
      return null;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!team) {
      throw new Error("Selected team is unavailable.");
    }

    return team;
  }

  if (!actor.teamId) {
    throw new Error("Current supervisor account has no team scope.");
  }

  const team = await prisma.team.findUnique({
    where: { id: actor.teamId },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  if (!team) {
    throw new Error("Current team is unavailable.");
  }

  return team;
}

function buildPersistedSettingData(input: TeamPublicPoolSettingValues) {
  return {
    autoRecycleEnabled: input.autoRecycleEnabled,
    ownerExitRecycleEnabled: input.ownerExitRecycleEnabled,
    autoAssignEnabled: input.autoAssignEnabled,
    autoAssignStrategy: input.autoAssignStrategy,
    autoAssignBatchSize: input.autoAssignBatchSize,
    maxActiveCustomersPerSales: input.maxActiveCustomersPerSales,
    roundRobinCursorUserId: input.roundRobinCursorUserId,
    defaultInactiveDays: input.defaultInactiveDays,
    respectClaimLock: input.respectClaimLock,
    strongEffectProtectionDays: input.strongEffectProtectionDays,
    mediumEffectProtectionDays: input.mediumEffectProtectionDays,
    weakEffectResetsClock: input.weakEffectResetsClock,
    negativeRequiresSupervisorReview: input.negativeRequiresSupervisorReview,
    salesCanClaim: input.salesCanClaim,
    salesCanRelease: input.salesCanRelease,
    batchRecycleEnabled: input.batchRecycleEnabled,
    batchAssignEnabled: input.batchAssignEnabled,
  } satisfies Omit<Prisma.TeamPublicPoolSettingUncheckedCreateInput, "teamId">;
}

async function persistResolvedTeamPublicPoolSetting(
  db: DbClient,
  teamId: string,
  nextValues: TeamPublicPoolSettingValues,
) {
  const existing = await db.teamPublicPoolSetting.findUnique({
    where: { teamId },
    select: teamPublicPoolSettingSelect,
  });
  const shouldDelete =
    isDefaultTeamPublicPoolConfigValues(nextValues) && !nextValues.roundRobinCursorUserId;

  if (shouldDelete) {
    if (existing) {
      await db.teamPublicPoolSetting.delete({
        where: { teamId },
      });
    }

    return buildResolvedSetting(teamId, null);
  }

  if (existing) {
    const updated = await db.teamPublicPoolSetting.update({
      where: { teamId },
      data: buildPersistedSettingData(nextValues),
      select: teamPublicPoolSettingSelect,
    });

    return buildResolvedSetting(teamId, updated);
  }

  const created = await db.teamPublicPoolSetting.create({
    data: {
      teamId,
      ...buildPersistedSettingData(nextValues),
    },
    select: teamPublicPoolSettingSelect,
  });

  return buildResolvedSetting(teamId, created);
}

export async function getResolvedTeamPublicPoolSetting(
  teamId: string | null,
  db: DbClient = prisma,
) {
  if (!teamId) {
    return buildResolvedSetting(null, null);
  }

  const record = await db.teamPublicPoolSetting.findUnique({
    where: { teamId },
    select: teamPublicPoolSettingSelect,
  });

  return buildResolvedSetting(teamId, record);
}

export async function getResolvedTeamPublicPoolSettingsMap(
  teamIds: string[],
  db: DbClient = prisma,
) {
  const uniqueTeamIds = [...new Set(teamIds.filter(Boolean))];

  if (uniqueTeamIds.length === 0) {
    return new Map<string, ResolvedTeamPublicPoolSetting>();
  }

  const records = await db.teamPublicPoolSetting.findMany({
    where: {
      teamId: {
        in: uniqueTeamIds,
      },
    },
    select: teamPublicPoolSettingSelect,
  });
  const recordMap = new Map(records.map((record) => [record.teamId, record]));

  return new Map(
    uniqueTeamIds.map((teamId) => [
      teamId,
      buildResolvedSetting(teamId, recordMap.get(teamId) ?? null),
    ]),
  );
}

export async function updateTeamPublicPoolAutoAssignCursor(
  teamId: string,
  roundRobinCursorUserId: string | null,
  db: DbClient = prisma,
) {
  const current = await getResolvedTeamPublicPoolSetting(teamId, db);

  return persistResolvedTeamPublicPoolSetting(db, teamId, {
    autoRecycleEnabled: current.autoRecycleEnabled,
    ownerExitRecycleEnabled: current.ownerExitRecycleEnabled,
    autoAssignEnabled: current.autoAssignEnabled,
    autoAssignStrategy: current.autoAssignStrategy,
    autoAssignBatchSize: current.autoAssignBatchSize,
    maxActiveCustomersPerSales: current.maxActiveCustomersPerSales,
    roundRobinCursorUserId,
    defaultInactiveDays: current.defaultInactiveDays,
    respectClaimLock: current.respectClaimLock,
    strongEffectProtectionDays: current.strongEffectProtectionDays,
    mediumEffectProtectionDays: current.mediumEffectProtectionDays,
    weakEffectResetsClock: current.weakEffectResetsClock,
    negativeRequiresSupervisorReview: current.negativeRequiresSupervisorReview,
    salesCanClaim: current.salesCanClaim,
    salesCanRelease: current.salesCanRelease,
    batchRecycleEnabled: current.batchRecycleEnabled,
    batchAssignEnabled: current.batchAssignEnabled,
  });
}

export async function getCustomerPublicPoolSettingsPageData(
  viewer: {
    id: string;
    role: RoleCode;
  },
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<CustomerPublicPoolSettingsPageData> {
  if (!canManageCustomerPublicPool(viewer.role)) {
    throw new Error("You do not have access to customer public-pool settings.");
  }

  const actor = await getSettingsActor(viewer);
  const requestedTeamId = getParamValue(rawSearchParams?.teamId);
  const teamOptions = await getVisibleTeamOptionsForActor(actor);
  const selectedTeam = await resolveSelectedTeam(
    actor,
    requestedTeamId || (actor.role === "ADMIN" ? teamOptions[0]?.id ?? "" : ""),
  );
  const setting = await getResolvedTeamPublicPoolSetting(selectedTeam?.id ?? null);
  const roundRobinCursorUser =
    selectedTeam?.id && setting.roundRobinCursorUserId
      ? await prisma.user.findUnique({
          where: { id: setting.roundRobinCursorUserId },
          select: {
            id: true,
            name: true,
            username: true,
          },
        })
      : null;
  const noticeStatus = getParamValue(rawSearchParams?.noticeStatus);
  const noticeMessage = getParamValue(rawSearchParams?.noticeMessage);

  return {
    actor,
    canManageAcrossTeams: actor.role === "ADMIN",
    selectedTeam,
    teamOptions,
    setting,
    roundRobinCursorUser,
    notice:
      noticeStatus && noticeMessage
        ? {
            tone: noticeStatus === "success" ? "success" : "danger",
            message: noticeMessage,
          }
        : null,
    policySummary: [
      {
        label: "自动回收",
        value: formatBooleanLabel(setting.autoRecycleEnabled),
        hint: `默认 inactivity ${setting.defaultInactiveDays} 天`,
      },
      {
        label: "离职回收",
        value: formatBooleanLabel(setting.ownerExitRecycleEnabled),
        hint: setting.respectClaimLock ? "自动回收尊重 claim lock" : "自动回收忽略 claim lock",
      },
      {
        label: "自动分配",
        value: setting.autoAssignEnabled
          ? publicPoolAutoAssignStrategyLabels[setting.autoAssignStrategy]
          : "未启用",
        hint: `batch ${setting.autoAssignBatchSize} / 容量 ${formatNullableNumber(
          setting.maxActiveCustomersPerSales,
        )}`,
      },
      {
        label: "认领与释放",
        value: setting.salesCanClaim ? "销售可认领" : "销售不可认领",
        hint: setting.salesCanRelease ? "销售可主动释放" : "销售不可主动释放",
      },
      {
        label: "批量操作",
        value: setting.batchRecycleEnabled ? "批量回收开启" : "批量回收关闭",
        hint: setting.batchAssignEnabled ? "批量指派开启" : "批量指派关闭",
      },
    ],
    reservedRules: [
      {
        label: "自动分配路由矩阵",
        description:
          "当前自动分配仍严格收口在团队池内，不做跨团队路由矩阵。后续如需跨团队自动流转，再单独扩展。",
      },
      {
        label: "高级负载模型",
        description:
          "本轮 load balancing 只按当前私有客户数和容量上限做稳定分配，不引入 AI 打分或复杂多维容量学习。",
      },
    ],
  };
}

export async function upsertTeamPublicPoolSetting(
  actorId: string,
  input: TeamPublicPoolSettingMutationInput,
) {
  const actor = await getSettingsActorById(actorId);

  if (!canManageCustomerPublicPool(actor.role)) {
    throw new Error("Current role cannot update customer public-pool settings.");
  }

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!team) {
      throw new Error("Selected team is unavailable.");
    }

    if (actor.role === "SUPERVISOR" && actor.teamId !== team.id) {
      throw new Error("Supervisors can only update their own team rules.");
    }

    const before = await getResolvedTeamPublicPoolSetting(team.id, tx);
    const nextValues: TeamPublicPoolSettingValues = {
      autoRecycleEnabled: input.autoRecycleEnabled,
      ownerExitRecycleEnabled: input.ownerExitRecycleEnabled,
      autoAssignEnabled: input.autoAssignEnabled,
      autoAssignStrategy: input.autoAssignEnabled ? input.autoAssignStrategy : "NONE",
      autoAssignBatchSize: input.autoAssignBatchSize,
      maxActiveCustomersPerSales: input.maxActiveCustomersPerSales,
      roundRobinCursorUserId:
        input.autoAssignEnabled && input.autoAssignStrategy === "ROUND_ROBIN"
          ? before.roundRobinCursorUserId
          : null,
      defaultInactiveDays: input.defaultInactiveDays,
      respectClaimLock: input.respectClaimLock,
      strongEffectProtectionDays: input.strongEffectProtectionDays,
      mediumEffectProtectionDays: input.mediumEffectProtectionDays,
      weakEffectResetsClock: input.weakEffectResetsClock,
      negativeRequiresSupervisorReview: input.negativeRequiresSupervisorReview,
      salesCanClaim: input.salesCanClaim,
      salesCanRelease: input.salesCanRelease,
      batchRecycleEnabled: input.batchRecycleEnabled,
      batchAssignEnabled: input.batchAssignEnabled,
    };
    const after = await persistResolvedTeamPublicPoolSetting(tx, team.id, nextValues);
    const changedFields = formatSettingChangeSummary(before, after);

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CUSTOMER,
        action: "customer.public_pool.settings.updated",
        targetType: OperationTargetType.TEAM,
        targetId: team.id,
        description:
          changedFields.length > 0
            ? `Updated public-pool rules for ${team.name}.`
            : `Reviewed public-pool rules for ${team.name} without material changes.`,
        beforeData: {
          teamCode: team.code,
          source: before.source,
          settings: before,
        },
        afterData: {
          teamCode: team.code,
          source: after.source,
          settings: after,
          changedFields,
        },
      },
    });

    return {
      team,
      before,
      after,
      changedFields,
    };
  });
}
