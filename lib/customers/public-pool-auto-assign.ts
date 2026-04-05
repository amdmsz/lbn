import {
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { canManageCustomerPublicPool } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  assignCustomerToSalesTx,
  createSystemOwnershipActorContext,
  getCustomerOwnershipActorContext,
  type OwnershipTransitionActorContext,
} from "@/lib/customers/ownership";
import {
  customerPublicPoolRecycleConfig,
  defaultTeamPublicPoolSettingValues,
  publicPoolAutoAssignStrategyLabels,
  type PublicPoolAutoAssignStrategyValue,
} from "@/lib/customers/public-pool-metadata";
import {
  getResolvedTeamPublicPoolSetting,
  updateTeamPublicPoolAutoAssignCursor,
  type ResolvedTeamPublicPoolSetting,
} from "@/lib/customers/public-pool-settings";

const previewSampleSize = 5;

const publicPoolAutoAssignCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  publicPoolEnteredAt: true,
  publicPoolReason: true,
  claimLockedUntil: true,
  publicPoolTeamId: true,
  lastOwner: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  publicPoolTeam: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.CustomerSelect;

type AutoAssignCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof publicPoolAutoAssignCustomerSelect;
}>;

type AutoAssignSalesCandidate = {
  id: string;
  name: string;
  username: string;
  teamId: string;
  currentPrivateCustomerCount: number;
};

type InternalAutoAssignCandidate = {
  customerId: string;
  customerName: string;
  phone: string;
  publicPoolEnteredAt: Date | null;
  publicPoolReason: string | null;
  claimLockedUntil: Date | null;
  teamId: string;
  teamName: string | null;
  lastOwnerName: string | null;
};

type InternalAssignmentPlan = {
  customer: InternalAutoAssignCandidate;
  sales: AutoAssignSalesCandidate;
  strategy: "ROUND_ROBIN" | "LOAD_BALANCING";
  currentLoad: number;
  projectedLoad: number;
};

type InternalUnassignedPlan = {
  customer: InternalAutoAssignCandidate;
  issue: AutoAssignIssue;
};

type AutoAssignScopeSummary = {
  teamId: string | null;
  teamName: string | null;
};

type AutoAssignIssue = {
  code: string;
  label: string;
  detail: string;
};

type AutoAssignIssueSummary = {
  code: string;
  label: string;
  count: number;
};

type AutoAssignOwnerBucket = {
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  currentPrivateCustomerCount: number;
  assignedCount: number;
};

type InternalPreviewBuild = {
  preview: CustomerPublicPoolAutoAssignPreviewResult;
  assignments: InternalAssignmentPlan[];
  setting: ResolvedTeamPublicPoolSetting | null;
};

export type CustomerPublicPoolAutoAssignPreviewAssignmentSample = {
  customerId: string;
  customerName: string;
  phone: string;
  publicPoolEnteredAt: string | null;
  teamId: string;
  teamName: string | null;
  lastOwnerName: string | null;
  salesId: string;
  salesName: string;
  salesUsername: string;
  strategy: "ROUND_ROBIN" | "LOAD_BALANCING";
  currentLoad: number;
  projectedLoad: number;
};

export type CustomerPublicPoolAutoAssignPreviewUnassignedSample = {
  customerId: string;
  customerName: string;
  phone: string;
  publicPoolEnteredAt: string | null;
  teamId: string;
  teamName: string | null;
  lastOwnerName: string | null;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail: string;
};

export type CustomerPublicPoolAutoAssignPreviewResult = {
  generatedAt: string;
  scope: AutoAssignScopeSummary;
  blockingIssue: AutoAssignIssue | null;
  strategy: PublicPoolAutoAssignStrategyValue;
  strategyLabel: string;
  ruleSummary: string;
  config: {
    autoAssignEnabled: boolean;
    autoAssignBatchSize: number;
    maxActiveCustomersPerSales: number | null;
    roundRobinCursorUserId: string | null;
  };
  counts: {
    publicCandidates: number;
    assignableCustomers: number;
    unassignedCustomers: number;
    availableSales: number;
  };
  availableSales: Array<{
    salesId: string;
    salesName: string;
    salesUsername: string;
    currentPrivateCustomerCount: number;
  }>;
  ownerBuckets: AutoAssignOwnerBucket[];
  unassignedReasonSummaries: AutoAssignIssueSummary[];
  sampleAssignments: CustomerPublicPoolAutoAssignPreviewAssignmentSample[];
  sampleUnassigned: CustomerPublicPoolAutoAssignPreviewUnassignedSample[];
};

export type CustomerPublicPoolAutoAssignApplyResult = {
  generatedAt: string;
  scope: AutoAssignScopeSummary;
  blockingIssue: AutoAssignIssue | null;
  strategy: PublicPoolAutoAssignStrategyValue;
  strategyLabel: string;
  batchSize: number;
  remainingAssignableCount: number;
  nextRoundRobinCursorUserId: string | null;
  counts: {
    previewAssignable: number;
    attempted: number;
    success: number;
    skipped: number;
    failed: number;
  };
  appliedCustomerIds: string[];
  appliedSamples: CustomerPublicPoolAutoAssignPreviewAssignmentSample[];
  skipped: Array<{
    customerId: string;
    reason: string;
  }>;
  failed: Array<{
    customerId: string;
    reason: string;
  }>;
  unassignedReasonSummaries: AutoAssignIssueSummary[];
};

type AutoAssignRequestInput = {
  actorId?: string | null;
  actor?: OwnershipTransitionActorContext;
  teamId?: string | null;
  batchSize?: number;
  sampleSize?: number;
  now?: Date;
  note?: string | null;
};

function serializeDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildIssue(code: string, label: string, detail: string): AutoAssignIssue {
  return { code, label, detail };
}

function mapAssignmentSample(
  plan: InternalAssignmentPlan,
): CustomerPublicPoolAutoAssignPreviewAssignmentSample {
  return {
    customerId: plan.customer.customerId,
    customerName: plan.customer.customerName,
    phone: plan.customer.phone,
    publicPoolEnteredAt: serializeDate(plan.customer.publicPoolEnteredAt),
    teamId: plan.customer.teamId,
    teamName: plan.customer.teamName,
    lastOwnerName: plan.customer.lastOwnerName,
    salesId: plan.sales.id,
    salesName: plan.sales.name,
    salesUsername: plan.sales.username,
    strategy: plan.strategy,
    currentLoad: plan.currentLoad,
    projectedLoad: plan.projectedLoad,
  };
}

function mapUnassignedSample(
  plan: InternalUnassignedPlan,
): CustomerPublicPoolAutoAssignPreviewUnassignedSample {
  return {
    customerId: plan.customer.customerId,
    customerName: plan.customer.customerName,
    phone: plan.customer.phone,
    publicPoolEnteredAt: serializeDate(plan.customer.publicPoolEnteredAt),
    teamId: plan.customer.teamId,
    teamName: plan.customer.teamName,
    lastOwnerName: plan.customer.lastOwnerName,
    reasonCode: plan.issue.code,
    reasonLabel: plan.issue.label,
    reasonDetail: plan.issue.detail,
  };
}

function sortIssues(left: AutoAssignIssueSummary, right: AutoAssignIssueSummary) {
  if (right.count !== left.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label, "zh-Hans-CN");
}

function buildOwnerBuckets(assignments: InternalAssignmentPlan[]) {
  const buckets = new Map<string, AutoAssignOwnerBucket>();

  for (const assignment of assignments) {
    const current = buckets.get(assignment.sales.id);

    if (current) {
      current.assignedCount += 1;
      continue;
    }

    buckets.set(assignment.sales.id, {
      ownerId: assignment.sales.id,
      ownerName: assignment.sales.name,
      ownerUsername: assignment.sales.username,
      currentPrivateCustomerCount: assignment.sales.currentPrivateCustomerCount,
      assignedCount: 1,
    });
  }

  return [...buckets.values()].sort((left, right) => {
    if (right.assignedCount !== left.assignedCount) {
      return right.assignedCount - left.assignedCount;
    }

    return left.ownerName.localeCompare(right.ownerName, "zh-Hans-CN");
  });
}

function buildUnassignedReasonSummaries(unassigned: InternalUnassignedPlan[]) {
  const buckets = new Map<string, AutoAssignIssueSummary>();

  for (const item of unassigned) {
    const current = buckets.get(item.issue.code);

    if (current) {
      current.count += 1;
      continue;
    }

    buckets.set(item.issue.code, {
      code: item.issue.code,
      label: item.issue.label,
      count: 1,
    });
  }

  return [...buckets.values()].sort(sortIssues);
}

function buildEmptyPreview(input: {
  now: Date;
  scope: AutoAssignScopeSummary;
  blockingIssue: AutoAssignIssue;
  setting: ResolvedTeamPublicPoolSetting | null;
  publicCandidatesCount?: number;
  availableSales?: AutoAssignSalesCandidate[];
  unassigned?: InternalUnassignedPlan[];
}): CustomerPublicPoolAutoAssignPreviewResult {
  const setting = input.setting ?? {
    teamId: input.scope.teamId,
    source: "default" as const,
    recordId: null,
    createdAt: null,
    updatedAt: null,
    ...defaultTeamPublicPoolSettingValues,
  };
  const availableSales = input.availableSales ?? [];
  const unassigned = input.unassigned ?? [];

  return {
    generatedAt: input.now.toISOString(),
    scope: input.scope,
    blockingIssue: input.blockingIssue,
    strategy: setting.autoAssignStrategy,
    strategyLabel: publicPoolAutoAssignStrategyLabels[setting.autoAssignStrategy],
    ruleSummary: input.blockingIssue.detail,
    config: {
      autoAssignEnabled: setting.autoAssignEnabled,
      autoAssignBatchSize: setting.autoAssignBatchSize,
      maxActiveCustomersPerSales: setting.maxActiveCustomersPerSales,
      roundRobinCursorUserId: setting.roundRobinCursorUserId,
    },
    counts: {
      publicCandidates: input.publicCandidatesCount ?? unassigned.length,
      assignableCustomers: 0,
      unassignedCustomers: unassigned.length,
      availableSales: availableSales.length,
    },
    availableSales: availableSales.map((sales) => ({
      salesId: sales.id,
      salesName: sales.name,
      salesUsername: sales.username,
      currentPrivateCustomerCount: sales.currentPrivateCustomerCount,
    })),
    ownerBuckets: [],
    unassignedReasonSummaries: buildUnassignedReasonSummaries(unassigned),
    sampleAssignments: [],
    sampleUnassigned: unassigned
      .slice(0, previewSampleSize)
      .map((item) => mapUnassignedSample(item)),
  };
}

async function resolveAutoAssignActor(
  input: AutoAssignRequestInput,
): Promise<OwnershipTransitionActorContext> {
  if (input.actor) {
    return input.actor;
  }

  if (input.actorId) {
    return getCustomerOwnershipActorContext(input.actorId);
  }

  return createSystemOwnershipActorContext();
}

function assertAutoAssignActorCanManage(actor: OwnershipTransitionActorContext) {
  if (actor.role === "SYSTEM") {
    return;
  }

  if (!canManageCustomerPublicPool(actor.role)) {
    throw new Error("Current role cannot manage automated public-pool assign.");
  }
}

async function resolveAutoAssignScope(
  actor: OwnershipTransitionActorContext,
  requestedTeamId?: string | null,
) {
  let teamId: string | null = null;

  if (actor.role === "SYSTEM") {
    teamId = requestedTeamId?.trim() || actor.teamId || null;
  } else if (actor.role === "ADMIN") {
    teamId = requestedTeamId?.trim() || null;
  } else if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      throw new Error("Current supervisor account has no team scope.");
    }

    teamId = actor.teamId;
  } else {
    throw new Error("Current role cannot manage automated public-pool assign.");
  }

  if (!teamId) {
    return {
      teamId: null,
      teamName: null,
    } satisfies AutoAssignScopeSummary;
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
  } satisfies AutoAssignScopeSummary;
}

async function getScopedPublicCustomers(scope: AutoAssignScopeSummary) {
  if (!scope.teamId) {
    return [] as AutoAssignCustomerRecord[];
  }

  return prisma.customer.findMany({
    where: {
      ownerId: null,
      ownershipMode: CustomerOwnershipMode.PUBLIC,
      publicPoolTeamId: scope.teamId,
      status: {
        notIn: [...customerPublicPoolRecycleConfig.excludedCustomerStatuses],
      },
    },
    orderBy: [{ publicPoolEnteredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: publicPoolAutoAssignCustomerSelect,
  });
}

async function getEligibleSalesCandidates(
  scope: AutoAssignScopeSummary,
  maxActiveCustomersPerSales: number | null,
) {
  if (!scope.teamId) {
    return [] as AutoAssignSalesCandidate[];
  }

  const sales = await prisma.user.findMany({
    where: {
      teamId: scope.teamId,
      userStatus: UserStatus.ACTIVE,
      disabledAt: null,
      role: {
        code: "SALES",
      },
    },
    orderBy: [{ name: "asc" }, { username: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
    },
  });

  const salesIds = sales.map((item) => item.id);
  const loadBuckets =
    salesIds.length > 0
      ? await prisma.customer.groupBy({
          by: ["ownerId"],
          where: {
            ownerId: {
              in: salesIds,
            },
            ownershipMode: {
              in: [CustomerOwnershipMode.PRIVATE, CustomerOwnershipMode.LOCKED],
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];
  const loadMap = new Map(
    loadBuckets.map((item) => [item.ownerId ?? "__null__", item._count._all]),
  );

  return sales
    .flatMap((item) => {
      if (!item.teamId) {
        return [];
      }

      const currentPrivateCustomerCount = loadMap.get(item.id) ?? 0;

      if (
        maxActiveCustomersPerSales !== null &&
        currentPrivateCustomerCount >= maxActiveCustomersPerSales
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name,
          username: item.username,
          teamId: item.teamId,
          currentPrivateCustomerCount,
        } satisfies AutoAssignSalesCandidate,
      ];
    });
}

function toInternalCandidate(
  row: AutoAssignCustomerRecord,
  scope: AutoAssignScopeSummary,
): InternalAutoAssignCandidate {
  return {
    customerId: row.id,
    customerName: row.name,
    phone: row.phone,
    publicPoolEnteredAt: row.publicPoolEnteredAt,
    publicPoolReason: row.publicPoolReason,
    claimLockedUntil: row.claimLockedUntil,
    teamId: scope.teamId ?? row.publicPoolTeamId ?? "",
    teamName: row.publicPoolTeam?.name ?? scope.teamName,
    lastOwnerName: row.lastOwner?.name ?? null,
  };
}

function buildLoadBalancingPlans(
  customers: InternalAutoAssignCandidate[],
  sales: AutoAssignSalesCandidate[],
  setting: ResolvedTeamPublicPoolSetting,
) {
  const mutableLoads = new Map(
    sales.map((item) => [item.id, item.currentPrivateCustomerCount]),
  );
  const assignments: InternalAssignmentPlan[] = [];
  const unassigned: InternalUnassignedPlan[] = [];

  for (const customer of customers) {
    const rankedSales = [...sales].sort((left, right) => {
      const leftLoad = mutableLoads.get(left.id) ?? left.currentPrivateCustomerCount;
      const rightLoad = mutableLoads.get(right.id) ?? right.currentPrivateCustomerCount;

      if (leftLoad !== rightLoad) {
        return leftLoad - rightLoad;
      }

      if (left.name !== right.name) {
        return left.name.localeCompare(right.name, "zh-Hans-CN");
      }

      if (left.username !== right.username) {
        return left.username.localeCompare(right.username, "zh-Hans-CN");
      }

      return left.id.localeCompare(right.id, "zh-Hans-CN");
    });
    const candidate = rankedSales.find((salesItem) => {
      if (setting.maxActiveCustomersPerSales === null) {
        return true;
      }

      return (
        (mutableLoads.get(salesItem.id) ?? salesItem.currentPrivateCustomerCount) <
        setting.maxActiveCustomersPerSales
      );
    });

    if (!candidate) {
      unassigned.push({
        customer,
        issue: buildIssue(
          "ALL_SALES_AT_CAPACITY",
          "全部销售已达容量上限",
          "当前候选 SALES 都已达到团队设置的最大承接客户数，本轮不再继续自动分配。",
        ),
      });
      continue;
    }

    const currentLoad = mutableLoads.get(candidate.id) ?? candidate.currentPrivateCustomerCount;
    const projectedLoad = currentLoad + 1;
    mutableLoads.set(candidate.id, projectedLoad);
    assignments.push({
      customer,
      sales: candidate,
      strategy: "LOAD_BALANCING",
      currentLoad,
      projectedLoad,
    });
  }

  return { assignments, unassigned };
}

function buildRoundRobinPlans(
  customers: InternalAutoAssignCandidate[],
  sales: AutoAssignSalesCandidate[],
  setting: ResolvedTeamPublicPoolSetting,
) {
  const mutableLoads = new Map(
    sales.map((item) => [item.id, item.currentPrivateCustomerCount]),
  );
  const assignments: InternalAssignmentPlan[] = [];
  const unassigned: InternalUnassignedPlan[] = [];

  if (sales.length === 0) {
    return { assignments, unassigned };
  }

  const cursorIndex = setting.roundRobinCursorUserId
    ? sales.findIndex((item) => item.id === setting.roundRobinCursorUserId)
    : -1;
  let nextIndex = cursorIndex >= 0 ? (cursorIndex + 1) % sales.length : 0;

  for (const customer of customers) {
    let chosen: AutoAssignSalesCandidate | null = null;

    for (let offset = 0; offset < sales.length; offset += 1) {
      const salesItem = sales[(nextIndex + offset) % sales.length];
      const currentLoad = mutableLoads.get(salesItem.id) ?? salesItem.currentPrivateCustomerCount;

      if (
        setting.maxActiveCustomersPerSales !== null &&
        currentLoad >= setting.maxActiveCustomersPerSales
      ) {
        continue;
      }

      chosen = salesItem;
      nextIndex = (nextIndex + offset + 1) % sales.length;
      break;
    }

    if (!chosen) {
      unassigned.push({
        customer,
        issue: buildIssue(
          "ALL_SALES_AT_CAPACITY",
          "全部销售已达容量上限",
          "当前轮转候选 SALES 都已达到团队设置的最大承接客户数，本轮不再继续自动分配。",
        ),
      });
      continue;
    }

    const currentLoad = mutableLoads.get(chosen.id) ?? chosen.currentPrivateCustomerCount;
    const projectedLoad = currentLoad + 1;
    mutableLoads.set(chosen.id, projectedLoad);
    assignments.push({
      customer,
      sales: chosen,
      strategy: "ROUND_ROBIN",
      currentLoad,
      projectedLoad,
    });
  }

  return { assignments, unassigned };
}

async function buildAutoAssignPreviewData(
  scope: AutoAssignScopeSummary,
  input: AutoAssignRequestInput,
): Promise<InternalPreviewBuild> {
  const now = input.now ?? new Date();

  if (!scope.teamId) {
    return {
      preview: buildEmptyPreview({
        now,
        scope,
        setting: null,
        publicCandidatesCount: 0,
        blockingIssue: buildIssue(
          "TEAM_SCOPE_REQUIRED",
          "需要先选择团队",
          "自动分配按团队规则执行。ADMIN 请先在当前公海池里切到一个具体团队，再进行预览或执行。",
        ),
      }),
      assignments: [],
      setting: null,
    };
  }

  const [setting, customerRows] = await Promise.all([
    getResolvedTeamPublicPoolSetting(scope.teamId),
    getScopedPublicCustomers(scope),
  ]);
  const customers = customerRows.map((row) => toInternalCandidate(row, scope));
  const lockedCustomers = customers
    .filter(
      (item) => item.claimLockedUntil && item.claimLockedUntil.getTime() > now.getTime(),
    )
    .map((customer) => ({
      customer,
      issue: buildIssue(
        "CUSTOMER_PROTECTED",
        "客户仍在保护期内",
        "客户当前仍处于 claim lock / 保护期内，自动分配不会抢占竞争态客户。",
      ),
    }));
  const assignableCustomers = customers.filter(
    (item) => !item.claimLockedUntil || item.claimLockedUntil.getTime() <= now.getTime(),
  );

  if (!setting.autoAssignEnabled) {
    return {
      preview: buildEmptyPreview({
        now,
        scope,
        setting,
        publicCandidatesCount: customerRows.length,
        unassigned: customers.map((customer) => ({
          customer,
          issue: buildIssue(
            "AUTO_ASSIGN_DISABLED",
            "当前团队未启用自动分配",
            "团队规则里还没有开启自动分配，当前只允许手动认领或主管手动指派。",
          ),
        })),
        blockingIssue: buildIssue(
          "AUTO_ASSIGN_DISABLED",
          "当前团队未启用自动分配",
          "团队规则里还没有开启自动分配，当前只允许手动认领或主管手动指派。",
        ),
      }),
      assignments: [],
      setting,
    };
  }

  if (setting.autoAssignStrategy === "NONE") {
    return {
      preview: buildEmptyPreview({
        now,
        scope,
        setting,
        publicCandidatesCount: customerRows.length,
        unassigned: customers.map((customer) => ({
          customer,
          issue: buildIssue(
            "AUTO_ASSIGN_STRATEGY_NONE",
            "当前团队未选择自动分配策略",
            "自动分配已开启，但策略仍是 NONE。请先在团队规则页选择 round robin 或 load balancing。",
          ),
        })),
        blockingIssue: buildIssue(
          "AUTO_ASSIGN_STRATEGY_NONE",
          "当前团队未选择自动分配策略",
          "自动分配已开启，但策略仍是 NONE。请先在团队规则页选择 round robin 或 load balancing。",
        ),
      }),
      assignments: [],
      setting,
    };
  }

  const sales = await getEligibleSalesCandidates(
    scope,
    setting.maxActiveCustomersPerSales,
  );

  if (sales.length === 0) {
    return {
      preview: buildEmptyPreview({
        now,
        scope,
        setting,
        publicCandidatesCount: customerRows.length,
        availableSales: [],
        unassigned: [
          ...lockedCustomers,
          ...assignableCustomers.map((customer) => ({
            customer,
            issue: buildIssue(
              "NO_ELIGIBLE_SALES",
              "没有可用 SALES 候选人",
              "当前团队下没有 active 且具备承接资格的 SALES，或全部销售已被容量规则排除。",
            ),
          })),
        ],
        blockingIssue: buildIssue(
          "NO_ELIGIBLE_SALES",
          "没有可用 SALES 候选人",
          "当前团队下没有 active 且具备承接资格的 SALES，自动分配无法执行。",
        ),
      }),
      assignments: [],
      setting,
    };
  }

  const dynamicPlans =
    setting.autoAssignStrategy === "ROUND_ROBIN"
      ? buildRoundRobinPlans(assignableCustomers, sales, setting)
      : buildLoadBalancingPlans(assignableCustomers, sales, setting);
  const unassigned = [...lockedCustomers, ...dynamicPlans.unassigned];
  const ruleSummary =
    setting.autoAssignStrategy === "ROUND_ROBIN"
      ? `当前团队按 round robin 轮转分配，续位游标 ${
          setting.roundRobinCursorUserId ? "已记录" : "尚未记录"
        }，每次 apply 最多处理 ${setting.autoAssignBatchSize} 位客户。`
      : `当前团队按私有客户负载低优先分配，每次 apply 最多处理 ${setting.autoAssignBatchSize} 位客户。`;

  return {
    preview: {
      generatedAt: now.toISOString(),
      scope,
      blockingIssue: null,
      strategy: setting.autoAssignStrategy,
      strategyLabel: publicPoolAutoAssignStrategyLabels[setting.autoAssignStrategy],
      ruleSummary,
      config: {
        autoAssignEnabled: setting.autoAssignEnabled,
        autoAssignBatchSize: setting.autoAssignBatchSize,
        maxActiveCustomersPerSales: setting.maxActiveCustomersPerSales,
        roundRobinCursorUserId: setting.roundRobinCursorUserId,
      },
      counts: {
        publicCandidates: customerRows.length,
        assignableCustomers: dynamicPlans.assignments.length,
        unassignedCustomers: unassigned.length,
        availableSales: sales.length,
      },
      availableSales: sales.map((salesItem) => ({
        salesId: salesItem.id,
        salesName: salesItem.name,
        salesUsername: salesItem.username,
        currentPrivateCustomerCount: salesItem.currentPrivateCustomerCount,
      })),
      ownerBuckets: buildOwnerBuckets(dynamicPlans.assignments),
      unassignedReasonSummaries: buildUnassignedReasonSummaries(unassigned),
      sampleAssignments: dynamicPlans.assignments
        .slice(0, input.sampleSize ?? previewSampleSize)
        .map((item) => mapAssignmentSample(item)),
      sampleUnassigned: unassigned
        .slice(0, input.sampleSize ?? previewSampleSize)
        .map((item) => mapUnassignedSample(item)),
    },
    assignments: dynamicPlans.assignments,
    setting,
  };
}

function classifyApplyError(error: unknown) {
  const message = error instanceof Error ? error.message : "Auto-assign failed.";
  const skippedMessages = new Set([
    "Customer is outside the current public-pool scope.",
    "Customer is unavailable.",
    "Target sales user is unavailable.",
    "Target sales user has reached the current capacity limit.",
  ]);

  return {
    bucket: skippedMessages.has(message) ? "skipped" : "failed",
    reason: message,
  } as const;
}

async function getLiveAssignableSalesCandidate(
  tx: Prisma.TransactionClient,
  input: {
    teamId: string;
    salesId: string;
  },
) {
  return tx.user.findFirst({
    where: {
      id: input.salesId,
      teamId: input.teamId,
      userStatus: UserStatus.ACTIVE,
      disabledAt: null,
      role: {
        code: "SALES",
      },
    },
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
    },
  });
}

async function validateLiveSalesCapacity(
  tx: Prisma.TransactionClient,
  input: {
    salesId: string;
    maxActiveCustomersPerSales: number | null;
  },
) {
  if (input.maxActiveCustomersPerSales === null) {
    return true;
  }

  const currentPrivateCustomerCount = await tx.customer.count({
    where: {
      ownerId: input.salesId,
      ownershipMode: {
        in: [CustomerOwnershipMode.PRIVATE, CustomerOwnershipMode.LOCKED],
      },
    },
  });

  return currentPrivateCustomerCount < input.maxActiveCustomersPerSales;
}

function resolveAutoAssignSource(actor: OwnershipTransitionActorContext) {
  if (actor.role === "ADMIN") {
    return "ADMIN_MANUAL_APPLY";
  }

  if (actor.role === "SUPERVISOR") {
    return "SUPERVISOR_MANUAL_APPLY";
  }

  return "SYSTEM_AUTO_ASSIGN";
}

export async function previewAutoAssign(
  input: AutoAssignRequestInput = {},
) {
  const actor = await resolveAutoAssignActor(input);
  assertAutoAssignActorCanManage(actor);
  const scope = await resolveAutoAssignScope(actor, input.teamId);
  const preview = await buildAutoAssignPreviewData(scope, input);
  return preview.preview;
}

export async function applyAutoAssign(
  input: AutoAssignRequestInput = {},
) {
  const actor = await resolveAutoAssignActor(input);
  assertAutoAssignActorCanManage(actor);
  const scope = await resolveAutoAssignScope(actor, input.teamId);
  const previewBuild = await buildAutoAssignPreviewData(scope, input);
  const preview = previewBuild.preview;
  const strategy = previewBuild.setting?.autoAssignStrategy ?? "NONE";
  const batchSize = Math.max(
    1,
    input.batchSize ??
      previewBuild.setting?.autoAssignBatchSize ??
      defaultTeamPublicPoolSettingValues.autoAssignBatchSize,
  );

  if (preview.blockingIssue) {
    return {
      generatedAt: new Date().toISOString(),
      scope,
      blockingIssue: preview.blockingIssue,
      strategy,
      strategyLabel: publicPoolAutoAssignStrategyLabels[strategy],
      batchSize,
      remainingAssignableCount: 0,
      nextRoundRobinCursorUserId: previewBuild.setting?.roundRobinCursorUserId ?? null,
      counts: {
        previewAssignable: 0,
        attempted: 0,
        success: 0,
        skipped: 0,
        failed: 0,
      },
      appliedCustomerIds: [],
      appliedSamples: [],
      skipped: [],
      failed: [],
      unassignedReasonSummaries: preview.unassignedReasonSummaries,
    } satisfies CustomerPublicPoolAutoAssignApplyResult;
  }

  const attempts = previewBuild.assignments.slice(0, batchSize);
  const appliedCustomerIds: string[] = [];
  const appliedSamples: CustomerPublicPoolAutoAssignPreviewAssignmentSample[] = [];
  const skipped: Array<{ customerId: string; reason: string }> = [];
  const failed: Array<{ customerId: string; reason: string }> = [];
  let lastSuccessfulSalesId: string | null = null;

  for (const assignment of attempts) {
    try {
      const transition = await prisma.$transaction(async (tx) => {
        const liveSales = await getLiveAssignableSalesCandidate(tx, {
          teamId: assignment.sales.teamId,
          salesId: assignment.sales.id,
        });

        if (!liveSales || !liveSales.teamId) {
          throw new Error("Target sales user is unavailable.");
        }

        const hasCapacity = await validateLiveSalesCapacity(tx, {
          salesId: liveSales.id,
          maxActiveCustomersPerSales:
            previewBuild.setting?.maxActiveCustomersPerSales ?? null,
        });

        if (!hasCapacity) {
          throw new Error("Target sales user has reached the current capacity limit.");
        }

        return assignCustomerToSalesTx(tx, {
          actor,
          targetSales: liveSales,
          customerId: assignment.customer.customerId,
          reason: CustomerOwnershipEventReason.AUTO_ASSIGN,
          note: input.note,
          requireCurrentPublicPool: true,
          operationAction:
            actor.role === "SYSTEM"
              ? "customer.public_pool.auto_assign.system_applied"
              : "customer.public_pool.auto_assign.manual_applied",
          operationDescription: `Auto-assigned ${assignment.customer.customerName} to ${assignment.sales.name}.`,
          operationMetadata: {
            autoAssignSource: resolveAutoAssignSource(actor),
            autoAssignStrategy: strategy,
            autoAssignTeamId: scope.teamId,
            autoAssignSalesId: assignment.sales.id,
          },
        });
      });

      if (!transition) {
        skipped.push({
          customerId: assignment.customer.customerId,
          reason: "Customer is already claimed or no longer public.",
        });
        continue;
      }

      lastSuccessfulSalesId = assignment.sales.id;
      appliedCustomerIds.push(assignment.customer.customerId);
      appliedSamples.push(mapAssignmentSample(assignment));
    } catch (error) {
      const classified = classifyApplyError(error);

      if (classified.bucket === "skipped") {
        skipped.push({
          customerId: assignment.customer.customerId,
          reason: classified.reason,
        });
      } else {
        failed.push({
          customerId: assignment.customer.customerId,
          reason: classified.reason,
        });
      }
    }
  }

  let nextRoundRobinCursorUserId = previewBuild.setting?.roundRobinCursorUserId ?? null;

  if (
    scope.teamId &&
    strategy === "ROUND_ROBIN" &&
    lastSuccessfulSalesId
  ) {
    const updated = await updateTeamPublicPoolAutoAssignCursor(
      scope.teamId,
      lastSuccessfulSalesId,
    );
    nextRoundRobinCursorUserId = updated.roundRobinCursorUserId;
  }

  const remainingPreview = await buildAutoAssignPreviewData(scope, input);

  return {
    generatedAt: new Date().toISOString(),
    scope,
    blockingIssue: null,
    strategy,
    strategyLabel: publicPoolAutoAssignStrategyLabels[strategy],
    batchSize: attempts.length,
    remainingAssignableCount: remainingPreview.preview.counts.assignableCustomers,
    nextRoundRobinCursorUserId,
    counts: {
      previewAssignable: preview.counts.assignableCustomers,
      attempted: attempts.length,
      success: appliedCustomerIds.length,
      skipped: skipped.length,
      failed: failed.length,
    },
    appliedCustomerIds,
    appliedSamples: appliedSamples.slice(0, previewSampleSize),
    skipped: skipped.slice(0, 10),
    failed: failed.slice(0, 10),
    unassignedReasonSummaries: remainingPreview.preview.unassignedReasonSummaries,
  } satisfies CustomerPublicPoolAutoAssignApplyResult;
}
