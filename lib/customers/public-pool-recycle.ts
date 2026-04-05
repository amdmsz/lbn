import {
  CustomerOwnershipMode,
  PublicPoolReason,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canManageCustomerPublicPool } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  createSystemOwnershipActorContext,
  getCustomerOwnershipActorContext,
  recycleCustomerToPublicPoolTx,
  type OwnershipTransitionActorContext,
} from "@/lib/customers/ownership";
import {
  customerPublicPoolRecycleConfig,
  defaultTeamPublicPoolSettingValues,
} from "@/lib/customers/public-pool-metadata";
import {
  getResolvedTeamPublicPoolSetting,
  getResolvedTeamPublicPoolSettingsMap,
  type ResolvedTeamPublicPoolSetting,
} from "@/lib/customers/public-pool-settings";

const DAY_MS = 24 * 60 * 60 * 1000;

const recycleCandidateSelect = {
  id: true,
  name: true,
  phone: true,
  status: true,
  createdAt: true,
  ownerId: true,
  ownershipMode: true,
  publicPoolTeamId: true,
  lastEffectiveFollowUpAt: true,
  claimLockedUntil: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      userStatus: true,
      disabledAt: true,
      role: {
        select: {
          code: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  publicPoolTeam: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.CustomerSelect;

type RecycleCandidateRecord = Prisma.CustomerGetPayload<{
  select: typeof recycleCandidateSelect;
}>;

type RecyclePreviewReasonSummary = {
  code: string;
  label: string;
  count: number;
};

type RecycleSummaryBucket = {
  id: string | null;
  label: string;
  count: number;
};

type InternalRecycleCandidate = {
  customerId: string;
  customerName: string;
  phone: string;
  expectedOwnerId: string;
  ownerName: string;
  ownerUsername: string;
  teamId: string | null;
  teamName: string | null;
  lastEffectiveFollowUpAt: Date | null;
  baselineAt: Date | null;
  eligibleAt: Date | null;
  claimLockedUntil: Date | null;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail: string;
  sortAt: Date;
};

type InternalPreviewBuild = {
  preview: CustomerPublicPoolRecyclePreviewResult;
  candidates: InternalRecycleCandidate[];
};

type RecycleScopeSummary = {
  teamId: string | null;
  teamName: string | null;
};

export type CustomerPublicPoolRecyclePreviewSample = {
  customerId: string;
  customerName: string;
  phone: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerUsername: string | null;
  teamId: string | null;
  teamName: string | null;
  lastEffectiveFollowUpAt: string | null;
  baselineAt: string | null;
  eligibleAt: string | null;
  claimLockedUntil: string | null;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail: string;
};

export type CustomerPublicPoolRecyclePreviewResult = {
  kind: "inactive" | "owner_exit";
  generatedAt: string;
  scope: RecycleScopeSummary;
  ruleSummary: string;
  config: {
    defaultInactiveRecycleDays: number;
    batchSize: number;
    previewSampleSize: number;
    respectClaimLock: boolean;
  };
  counts: {
    scanned: number;
    eligible: number;
    blockedByClaimLock: number;
    affectedOwners: number;
    affectedTeams: number;
  };
  reasons: RecyclePreviewReasonSummary[];
  ownerBuckets: RecycleSummaryBucket[];
  teamBuckets: RecycleSummaryBucket[];
  sampleCustomers: CustomerPublicPoolRecyclePreviewSample[];
};

export type CustomerPublicPoolRecycleApplyResult = {
  kind: "inactive" | "owner_exit";
  generatedAt: string;
  scope: RecycleScopeSummary;
  batchSize: number;
  remainingEligibleCount: number;
  counts: {
    previewEligible: number;
    attempted: number;
    success: number;
    skipped: number;
    failed: number;
  };
  appliedCustomerIds: string[];
  appliedSamples: CustomerPublicPoolRecyclePreviewSample[];
  skipped: Array<{
    customerId: string;
    reason: string;
  }>;
  failed: Array<{
    customerId: string;
    reason: string;
  }>;
};

type RecycleRequestInput = {
  actorId?: string | null;
  actor?: OwnershipTransitionActorContext;
  teamId?: string | null;
  sampleSize?: number;
  batchSize?: number;
  now?: Date;
  note?: string | null;
};

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function sortByCountDescending(first: RecycleSummaryBucket, second: RecycleSummaryBucket) {
  if (second.count !== first.count) {
    return second.count - first.count;
  }

  return first.label.localeCompare(second.label, "zh-Hans-CN");
}

function buildOwnerExitRoleLabel(roleCode: RoleCode) {
  switch (roleCode) {
    case "OPS":
      return "运营";
    case "SHIPPER":
      return "发货";
    case "SUPERVISOR":
      return "主管";
    case "ADMIN":
      return "管理员";
    case "SALES":
    default:
      return "销售";
  }
}

function getRecycleCandidateTeamId(row: RecycleCandidateRecord) {
  return row.publicPoolTeam?.id ?? row.owner?.team?.id ?? row.publicPoolTeamId ?? null;
}

function getRecycleCandidateTeamName(row: RecycleCandidateRecord) {
  return row.publicPoolTeam?.name ?? row.owner?.team?.name ?? null;
}

function buildResolvedDefaultSetting(teamId: string | null): ResolvedTeamPublicPoolSetting {
  return {
    teamId,
    source: "default",
    recordId: null,
    createdAt: null,
    updatedAt: null,
    ...defaultTeamPublicPoolSettingValues,
  };
}

function buildScopedPrivateCustomerWhere(
  scopeTeamId: string | null,
  customerIds?: string[],
): Prisma.CustomerWhereInput {
  const clauses: Prisma.CustomerWhereInput[] = [
    {
      ownerId: {
        not: null,
      },
    },
    {
      ownershipMode: {
        in: [CustomerOwnershipMode.PRIVATE, CustomerOwnershipMode.LOCKED],
      },
    },
    {
      status: {
        notIn: [...customerPublicPoolRecycleConfig.excludedCustomerStatuses],
      },
    },
  ];

  if (scopeTeamId) {
    clauses.push({
      OR: [
        {
          publicPoolTeamId: scopeTeamId,
        },
        {
          publicPoolTeamId: null,
          owner: {
            is: {
              teamId: scopeTeamId,
            },
          },
        },
      ],
    });
  }

  if (customerIds && customerIds.length > 0) {
    clauses.push({
      id: {
        in: [...new Set(customerIds)],
      },
    });
  }

  return {
    AND: clauses,
  };
}

async function resolveRecycleActor(
  input: RecycleRequestInput,
): Promise<OwnershipTransitionActorContext> {
  if (input.actor) {
    return input.actor;
  }

  if (input.actorId) {
    return getCustomerOwnershipActorContext(input.actorId);
  }

  return createSystemOwnershipActorContext();
}

function assertRecycleActorCanManage(actor: OwnershipTransitionActorContext) {
  if (actor.role === "SYSTEM") {
    return;
  }

  if (!canManageCustomerPublicPool(actor.role)) {
    throw new Error("Current role cannot manage automated public-pool recycle.");
  }
}

async function resolveRecycleScope(
  actor: OwnershipTransitionActorContext,
  requestedTeamId?: string | null,
): Promise<RecycleScopeSummary> {
  let teamId: string | null = null;

  if (actor.role === "SYSTEM") {
    teamId = requestedTeamId ?? actor.teamId ?? null;
  } else if (actor.role === "ADMIN") {
    teamId = requestedTeamId?.trim() || null;
  } else if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      throw new Error("Current supervisor account has no team scope.");
    }

    teamId = actor.teamId;
  } else {
    throw new Error("Current role cannot manage automated public-pool recycle.");
  }

  if (!teamId) {
    return {
      teamId: null,
      teamName: null,
    };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
    },
  });

  return {
    teamId,
    teamName: team?.name ?? null,
  };
}

async function getScopedPrivateCustomers(
  scope: RecycleScopeSummary,
  customerIds?: string[],
) {
  return prisma.customer.findMany({
    where: buildScopedPrivateCustomerWhere(scope.teamId, customerIds),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: recycleCandidateSelect,
  });
}

async function getCurrentOwnerTakeoverMap(rows: RecycleCandidateRecord[]) {
  const ids = rows.map((row) => row.id);

  if (ids.length === 0) {
    return new Map<string, Date>();
  }

  const currentOwnerMap = new Map(
    rows.map((row) => [row.id, row.owner?.id ?? null] as const),
  );
  const events = await prisma.customerOwnershipEvent.findMany({
    where: {
      customerId: {
        in: ids,
      },
      toOwnershipMode: CustomerOwnershipMode.PRIVATE,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      customerId: true,
      toOwnerId: true,
      createdAt: true,
    },
  });
  const map = new Map<string, Date>();

  for (const event of events) {
    if (map.has(event.customerId)) {
      continue;
    }

    if (!event.toOwnerId || currentOwnerMap.get(event.customerId) !== event.toOwnerId) {
      continue;
    }

    map.set(event.customerId, event.createdAt);
  }

  return map;
}

function buildOwnerBuckets(candidates: InternalRecycleCandidate[]) {
  const buckets = new Map<string, RecycleSummaryBucket>();

  for (const candidate of candidates) {
    const key = candidate.expectedOwnerId;
    const current = buckets.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    buckets.set(key, {
      id: key,
      label: `${candidate.ownerName} (@${candidate.ownerUsername})`,
      count: 1,
    });
  }

  return [...buckets.values()].sort(sortByCountDescending).slice(0, 5);
}

function buildTeamBuckets(candidates: InternalRecycleCandidate[]) {
  const buckets = new Map<string, RecycleSummaryBucket>();

  for (const candidate of candidates) {
    const key = candidate.teamId ?? "__unknown_team__";
    const current = buckets.get(key);

    if (current) {
      current.count += 1;
      continue;
    }

    buckets.set(key, {
      id: candidate.teamId,
      label: candidate.teamName ?? "未记录团队",
      count: 1,
    });
  }

  return [...buckets.values()].sort(sortByCountDescending).slice(0, 5);
}

function buildReasonSummaries(candidates: InternalRecycleCandidate[]) {
  const buckets = new Map<string, RecyclePreviewReasonSummary>();

  for (const candidate of candidates) {
    const current = buckets.get(candidate.reasonCode);

    if (current) {
      current.count += 1;
      continue;
    }

    buckets.set(candidate.reasonCode, {
      code: candidate.reasonCode,
      label: candidate.reasonLabel,
      count: 1,
    });
  }

  return [...buckets.values()].sort((first, second) => {
    if (second.count !== first.count) {
      return second.count - first.count;
    }

    return first.label.localeCompare(second.label, "zh-Hans-CN");
  });
}

function serializePreviewSample(
  candidate: InternalRecycleCandidate,
): CustomerPublicPoolRecyclePreviewSample {
  return {
    customerId: candidate.customerId,
    customerName: candidate.customerName,
    phone: candidate.phone,
    ownerId: candidate.expectedOwnerId,
    ownerName: candidate.ownerName,
    ownerUsername: candidate.ownerUsername,
    teamId: candidate.teamId,
    teamName: candidate.teamName,
    lastEffectiveFollowUpAt: serializeDate(candidate.lastEffectiveFollowUpAt),
    baselineAt: serializeDate(candidate.baselineAt),
    eligibleAt: serializeDate(candidate.eligibleAt),
    claimLockedUntil: serializeDate(candidate.claimLockedUntil),
    reasonCode: candidate.reasonCode,
    reasonLabel: candidate.reasonLabel,
    reasonDetail: candidate.reasonDetail,
  };
}

function buildPreviewPayload(input: {
  kind: "inactive" | "owner_exit";
  generatedAt: Date;
  scope: RecycleScopeSummary;
  ruleSummary: string;
  configDays: number;
  respectClaimLock: boolean;
  scannedCount: number;
  blockedByClaimLockCount: number;
  candidates: InternalRecycleCandidate[];
  sampleSize: number;
}) {
  return {
    kind: input.kind,
    generatedAt: input.generatedAt.toISOString(),
    scope: input.scope,
    ruleSummary: input.ruleSummary,
    config: {
      defaultInactiveRecycleDays: input.configDays,
      batchSize: customerPublicPoolRecycleConfig.inactiveRecycleBatchSize,
      previewSampleSize: input.sampleSize,
      respectClaimLock: input.respectClaimLock,
    },
    counts: {
      scanned: input.scannedCount,
      eligible: input.candidates.length,
      blockedByClaimLock: input.blockedByClaimLockCount,
      affectedOwners: new Set(input.candidates.map((candidate) => candidate.expectedOwnerId)).size,
      affectedTeams: new Set(input.candidates.map((candidate) => candidate.teamId ?? "__unknown_team__"))
        .size,
    },
    reasons: buildReasonSummaries(input.candidates),
    ownerBuckets: buildOwnerBuckets(input.candidates),
    teamBuckets: buildTeamBuckets(input.candidates),
    sampleCustomers: input.candidates
      .slice(0, input.sampleSize)
      .map((candidate) => serializePreviewSample(candidate)),
  } satisfies CustomerPublicPoolRecyclePreviewResult;
}

function resolveOwnerExitCandidateReason(row: RecycleCandidateRecord) {
  if (!row.ownerId || !row.owner) {
    return null;
  }

  const owner = row.owner;

  if (owner.userStatus !== UserStatus.ACTIVE || owner.disabledAt) {
    return {
      code: "OWNER_DISABLED",
      label: "Owner 已禁用",
      detail: `${owner.name} 当前账号已禁用，不再具备客户承接资格。`,
    };
  }

  if (
    customerPublicPoolRecycleConfig.protectedManualOwnerRoleCodes.some(
      (roleCode) => roleCode === owner.role.code,
    )
  ) {
    return null;
  }

  if (!owner.teamId) {
    return {
      code: "OWNER_WITHOUT_TEAM",
      label: "Owner 无团队归属",
      detail: `${owner.name} 当前没有团队归属，不能继续承接客户。`,
    };
  }

  if (row.publicPoolTeamId && owner.teamId !== row.publicPoolTeamId) {
    return {
      code: "OWNER_LEFT_SCOPE_TEAM",
      label: "Owner 已离开承接团队",
      detail: `${owner.name} 当前团队已与客户承接团队不一致，客户需要回收到公海。`,
    };
  }

  if (
    customerPublicPoolRecycleConfig.ownerExitInvalidRoleCodes.some(
      (roleCode) => roleCode === owner.role.code,
    )
  ) {
    return {
      code: "OWNER_ROLE_INELIGIBLE",
      label: "Owner 失去销售资格",
      detail: `${owner.name} 当前角色为 ${buildOwnerExitRoleLabel(owner.role.code)}，不再具备销售承接资格。`,
    };
  }

  return null;
}

async function buildInactiveRecyclePreviewData(
  scope: RecycleScopeSummary,
  input: RecycleRequestInput,
): Promise<InternalPreviewBuild> {
  const now = input.now ?? new Date();
  const sampleSize =
    input.sampleSize ?? customerPublicPoolRecycleConfig.previewSampleSize;
  const rows = await getScopedPrivateCustomers(scope);
  const takeoverMap = await getCurrentOwnerTakeoverMap(rows);
  const settingsMap = await getResolvedTeamPublicPoolSettingsMap(
    rows.map((row) => getRecycleCandidateTeamId(row)).filter(Boolean) as string[],
  );
  const scopedSetting = scope.teamId
    ? await getResolvedTeamPublicPoolSetting(scope.teamId)
    : null;
  const candidates: InternalRecycleCandidate[] = [];
  let blockedByClaimLockCount = 0;

  for (const row of rows) {
    if (!row.ownerId || !row.owner) {
      continue;
    }

    if (resolveOwnerExitCandidateReason(row)) {
      continue;
    }

    const teamId = getRecycleCandidateTeamId(row);
    const teamSetting =
      (teamId ? settingsMap.get(teamId) : null) ??
      buildResolvedDefaultSetting(teamId);

    if (!teamSetting.autoRecycleEnabled) {
      continue;
    }

    const takeoverAt = takeoverMap.get(row.id) ?? null;
    const baselineAt = row.lastEffectiveFollowUpAt ?? takeoverAt ?? row.createdAt;
    const eligibleAt = addDays(baselineAt, teamSetting.defaultInactiveDays);

    if (eligibleAt.getTime() > now.getTime()) {
      continue;
    }

    if (teamSetting.respectClaimLock && row.claimLockedUntil && row.claimLockedUntil.getTime() > now.getTime()) {
      blockedByClaimLockCount += 1;
      continue;
    }

    let reasonCode = "STALE_CREATED_CUSTOMER";
    let reasonLabel = "创建后长期未有效跟进";
    let reasonDetail = `客户自创建以来缺少可用的有效跟进快照，已超过 ${teamSetting.defaultInactiveDays} 天。`;

    if (row.lastEffectiveFollowUpAt) {
      const staleDays = Math.max(
        Math.floor((now.getTime() - row.lastEffectiveFollowUpAt.getTime()) / DAY_MS),
        0,
      );
      reasonCode = "STALE_EFFECTIVE_FOLLOW_UP";
      reasonLabel = "有效跟进超时";
      reasonDetail = `最近一次有效跟进距今 ${staleDays} 天，超过 ${teamSetting.defaultInactiveDays} 天阈值。`;
    } else if (takeoverAt) {
      const staleDays = Math.max(
        Math.floor((now.getTime() - takeoverAt.getTime()) / DAY_MS),
        0,
      );
      reasonCode = "STALE_OWNER_TAKEOVER";
      reasonLabel = "接手后长期未有效跟进";
      reasonDetail = `当前 owner 接手后已过去 ${staleDays} 天，期间没有新的有效跟进。`;
    }

    candidates.push({
      customerId: row.id,
      customerName: row.name,
      phone: row.phone,
      expectedOwnerId: row.owner.id,
      ownerName: row.owner.name,
      ownerUsername: row.owner.username,
      teamId,
      teamName: getRecycleCandidateTeamName(row),
      lastEffectiveFollowUpAt: row.lastEffectiveFollowUpAt,
      baselineAt,
      eligibleAt,
      claimLockedUntil: row.claimLockedUntil,
      reasonCode,
      reasonLabel,
      reasonDetail,
      sortAt: eligibleAt,
    });
  }

  candidates.sort((first, second) => {
    if (first.sortAt.getTime() !== second.sortAt.getTime()) {
      return first.sortAt.getTime() - second.sortAt.getTime();
    }

    return first.customerName.localeCompare(second.customerName, "zh-Hans-CN");
  });

  return {
    preview: buildPreviewPayload({
      kind: "inactive",
      generatedAt: now,
      scope,
      ruleSummary: scopedSetting
        ? `当前团队超过 ${scopedSetting.defaultInactiveDays} 天没有有效跟进才会自动回收；${scopedSetting.respectClaimLock ? "保护期内继续跳过回收" : "保护期不阻挡自动回收"}。`
        : "跨团队视图按各团队规则分别计算自动回收阈值和 claim lock 策略。",
      configDays:
        scopedSetting?.defaultInactiveDays ??
        defaultTeamPublicPoolSettingValues.defaultInactiveDays,
      respectClaimLock:
        scopedSetting?.respectClaimLock ??
        defaultTeamPublicPoolSettingValues.respectClaimLock,
      scannedCount: rows.length,
      blockedByClaimLockCount,
      candidates,
      sampleSize,
    }),
    candidates,
  };
}

async function buildOwnerExitRecyclePreviewData(
  scope: RecycleScopeSummary,
  input: RecycleRequestInput,
): Promise<InternalPreviewBuild> {
  const now = input.now ?? new Date();
  const sampleSize =
    input.sampleSize ?? customerPublicPoolRecycleConfig.previewSampleSize;
  const rows = await getScopedPrivateCustomers(scope);
  const settingsMap = await getResolvedTeamPublicPoolSettingsMap(
    rows.map((row) => getRecycleCandidateTeamId(row)).filter(Boolean) as string[],
  );
  const scopedSetting = scope.teamId
    ? await getResolvedTeamPublicPoolSetting(scope.teamId)
    : null;
  const candidates: InternalRecycleCandidate[] = [];
  const priorityOrder: Record<string, number> = {
    OWNER_DISABLED: 0,
    OWNER_WITHOUT_TEAM: 1,
    OWNER_LEFT_SCOPE_TEAM: 2,
    OWNER_ROLE_INELIGIBLE: 3,
  };
  const getOwnerExitPriority = (reasonCode: string) => priorityOrder[reasonCode] ?? 99;

  for (const row of rows) {
    if (!row.ownerId || !row.owner) {
      continue;
    }

    const teamId = getRecycleCandidateTeamId(row);
    const teamSetting =
      (teamId ? settingsMap.get(teamId) : null) ??
      buildResolvedDefaultSetting(teamId);

    if (!teamSetting.ownerExitRecycleEnabled) {
      continue;
    }

    const reason = resolveOwnerExitCandidateReason(row);

    if (!reason) {
      continue;
    }

    candidates.push({
      customerId: row.id,
      customerName: row.name,
      phone: row.phone,
      expectedOwnerId: row.owner.id,
      ownerName: row.owner.name,
      ownerUsername: row.owner.username,
      teamId,
      teamName: getRecycleCandidateTeamName(row),
      lastEffectiveFollowUpAt: row.lastEffectiveFollowUpAt,
      baselineAt: null,
      eligibleAt: null,
      claimLockedUntil: row.claimLockedUntil,
      reasonCode: reason.code,
      reasonLabel: reason.label,
      reasonDetail: reason.detail,
      sortAt: now,
    });
  }

  candidates.sort((first, second) => {
    const firstPriority = getOwnerExitPriority(first.reasonCode);
    const secondPriority = getOwnerExitPriority(second.reasonCode);

    if (firstPriority !== secondPriority) {
      return firstPriority - secondPriority;
    }

    return first.customerName.localeCompare(second.customerName, "zh-Hans-CN");
  });

  return {
    preview: buildPreviewPayload({
      kind: "owner_exit",
      generatedAt: now,
      scope,
      ruleSummary: scopedSetting
        ? `当前团队${scopedSetting.ownerExitRecycleEnabled ? "开启" : "关闭"}离职回收；一旦 owner 失去承接资格，claim lock 不再阻挡回收。`
        : "跨团队视图按各团队离职回收开关分别计算，不受 claim lock 阻挡。",
      configDays:
        scopedSetting?.defaultInactiveDays ??
        defaultTeamPublicPoolSettingValues.defaultInactiveDays,
      respectClaimLock: false,
      scannedCount: rows.length,
      blockedByClaimLockCount: 0,
      candidates,
      sampleSize,
    }),
    candidates,
  };
}

function classifyApplyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Recycle failed.";
  const skipMessages = new Set([
    "Customer is still under claim protection.",
    "Customer is outside the current team scope.",
  ]);

  return {
    bucket: skipMessages.has(message) ? "skipped" : "failed",
    reason: message,
  } as const;
}

async function applyRecycleCandidates(input: {
  kind: "inactive" | "owner_exit";
  actor: OwnershipTransitionActorContext;
  scope: RecycleScopeSummary;
  note?: string | null;
  batchSize: number;
  preview: InternalPreviewBuild;
}) {
  const batch = input.preview.candidates.slice(0, input.batchSize);
  const generatedAt = new Date();
  const settingsMap = await getResolvedTeamPublicPoolSettingsMap(
    batch.map((candidate) => candidate.teamId).filter(Boolean) as string[],
  );
  const appliedCustomerIds: string[] = [];
  const appliedSamples: CustomerPublicPoolRecyclePreviewSample[] = [];
  const skipped: Array<{ customerId: string; reason: string }> = [];
  const failed: Array<{ customerId: string; reason: string }> = [];
  const reason =
    input.kind === "owner_exit"
      ? PublicPoolReason.OWNER_LEFT_TEAM
      : PublicPoolReason.INACTIVE_RECYCLE;

  for (const candidate of batch) {
    const teamSetting =
      (candidate.teamId ? settingsMap.get(candidate.teamId) : null) ??
      buildResolvedDefaultSetting(candidate.teamId);

    if (input.kind === "inactive" && !teamSetting.autoRecycleEnabled) {
      skipped.push({
        customerId: candidate.customerId,
        reason: "Auto recycle is disabled by the current team public-pool rule.",
      });
      continue;
    }

    if (input.kind === "owner_exit" && !teamSetting.ownerExitRecycleEnabled) {
      skipped.push({
        customerId: candidate.customerId,
        reason: "Owner-exit recycle is disabled by the current team public-pool rule.",
      });
      continue;
    }

    try {
      const transition = await prisma.$transaction((tx) =>
        recycleCustomerToPublicPoolTx(tx, {
          actor: input.actor,
          customerId: candidate.customerId,
          reason,
          note: input.note,
          expectedOwnerId: candidate.expectedOwnerId,
          respectClaimProtection:
            input.kind === "inactive" ? teamSetting.respectClaimLock : false,
          enforceActorScope: input.actor.role !== "SYSTEM",
          operationAction:
            input.kind === "owner_exit"
              ? "customer.public_pool.owner_exit_recycle_applied"
              : "customer.public_pool.inactive_recycle_applied",
          operationDescription:
            input.kind === "owner_exit"
              ? `Owner-exit recycle moved ${candidate.customerName} back into the public pool.`
              : `Inactive recycle moved ${candidate.customerName} back into the public pool.`,
        }),
      );

      if (!transition) {
        skipped.push({
          customerId: candidate.customerId,
          reason: "Customer is already public or no longer matches the recycle scope.",
        });
        continue;
      }

      appliedCustomerIds.push(candidate.customerId);
      appliedSamples.push(serializePreviewSample(candidate));
    } catch (error) {
      const classified = classifyApplyError(error);

      if (classified.bucket === "skipped") {
        skipped.push({
          customerId: candidate.customerId,
          reason: classified.reason,
        });
      } else {
        failed.push({
          customerId: candidate.customerId,
          reason: classified.reason,
        });
      }
    }
  }

  return {
    kind: input.kind,
    generatedAt: generatedAt.toISOString(),
    scope: input.scope,
    batchSize: batch.length,
    remainingEligibleCount: Math.max(
      input.preview.candidates.length - batch.length,
      0,
    ),
    counts: {
      previewEligible: input.preview.preview.counts.eligible,
      attempted: batch.length,
      success: appliedCustomerIds.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    appliedCustomerIds,
    appliedSamples: appliedSamples.slice(0, customerPublicPoolRecycleConfig.previewSampleSize),
    skipped: skipped.slice(0, 10),
    failed: failed.slice(0, 10),
  } satisfies CustomerPublicPoolRecycleApplyResult;
}

export async function previewInactiveRecycle(
  input: RecycleRequestInput = {},
) {
  const actor = await resolveRecycleActor(input);
  assertRecycleActorCanManage(actor);
  const scope = await resolveRecycleScope(actor, input.teamId);
  const preview = await buildInactiveRecyclePreviewData(scope, input);
  return preview.preview;
}

export async function applyInactiveRecycle(
  input: RecycleRequestInput = {},
) {
  const actor = await resolveRecycleActor(input);
  assertRecycleActorCanManage(actor);
  const scope = await resolveRecycleScope(actor, input.teamId);
  const preview = await buildInactiveRecyclePreviewData(scope, input);

  return applyRecycleCandidates({
    kind: "inactive",
    actor,
    scope,
    note: input.note,
    batchSize:
      input.batchSize ?? customerPublicPoolRecycleConfig.inactiveRecycleBatchSize,
    preview,
  });
}

export async function previewOwnerExitRecycle(
  input: RecycleRequestInput = {},
) {
  const actor = await resolveRecycleActor(input);
  assertRecycleActorCanManage(actor);
  const scope = await resolveRecycleScope(actor, input.teamId);
  const preview = await buildOwnerExitRecyclePreviewData(scope, input);
  return preview.preview;
}

export async function applyOwnerExitRecycle(
  input: RecycleRequestInput = {},
) {
  const actor = await resolveRecycleActor(input);
  assertRecycleActorCanManage(actor);
  const scope = await resolveRecycleScope(actor, input.teamId);
  const preview = await buildOwnerExitRecyclePreviewData(scope, input);

  return applyRecycleCandidates({
    kind: "owner_exit",
    actor,
    scope,
    note: input.note,
    batchSize:
      input.batchSize ?? customerPublicPoolRecycleConfig.inactiveRecycleBatchSize,
    preview,
  });
}
