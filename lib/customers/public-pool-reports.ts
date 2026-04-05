import {
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { canAccessCustomerPublicPoolReports } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { getCustomerOwnershipActorContext } from "@/lib/customers/ownership";
import {
  ownershipEventReasonLabels,
  publicPoolReasonLabels,
} from "@/lib/customers/public-pool-metadata";

type SearchParamsValue = string | string[] | undefined;

const WINDOW_OPTIONS = [7, 30] as const;
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_LINGER_DAYS = 14;
const CLAIM_EVENT_REASONS = new Set<CustomerOwnershipEventReason>([
  CustomerOwnershipEventReason.SALES_CLAIM,
  CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
  CustomerOwnershipEventReason.AUTO_ASSIGN,
  CustomerOwnershipEventReason.OWNER_RESTORE,
]);
const RECYCLE_EVENT_REASONS = new Set<CustomerOwnershipEventReason>([
  CustomerOwnershipEventReason.MANUAL_RELEASE,
  CustomerOwnershipEventReason.INACTIVE_RECYCLE,
  CustomerOwnershipEventReason.OWNER_LEFT_TEAM,
  CustomerOwnershipEventReason.BATCH_REALLOCATION,
  CustomerOwnershipEventReason.MERGE_RELEASE,
  CustomerOwnershipEventReason.INVALID_FOLLOWUP_RECYCLE,
  CustomerOwnershipEventReason.UNASSIGNED_IMPORT,
]);

const currentPublicCustomerSelect = {
  id: true,
  name: true,
  phone: true,
  publicPoolEnteredAt: true,
  publicPoolReason: true,
  claimLockedUntil: true,
  lastEffectiveFollowUpAt: true,
  publicPoolTeam: {
    select: {
      id: true,
      name: true,
    },
  },
  lastOwner: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.CustomerSelect;

const reportEventSelect = {
  id: true,
  customerId: true,
  teamId: true,
  createdAt: true,
  reason: true,
  fromOwnershipMode: true,
  toOwnershipMode: true,
  actor: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
  toOwner: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
  fromOwner: {
    select: {
      id: true,
      name: true,
      username: true,
      team: {
        select: {
          name: true,
        },
      },
    },
  },
} satisfies Prisma.CustomerOwnershipEventSelect;

type ReportEvent = Prisma.CustomerOwnershipEventGetPayload<{
  select: typeof reportEventSelect;
}>;

export type CustomerPublicPoolReportsData = {
  actor: {
    id: string;
    role: RoleCode;
    teamId: string | null;
  };
  filters: {
    teamId: string;
    windowDays: 7 | 30;
    lingerDays: number;
  };
  selectedTeam: {
    id: string;
    name: string;
    code: string;
  } | null;
  teamOptions: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  summaryCards: Array<{
    label: string;
    value: string;
    note: string;
  }>;
  trends: Array<{
    date: string;
    enteredCount: number;
    claimedCount: number;
  }>;
  currentReasonDistribution: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  recycleReasonDistribution: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  claimSourceDistribution: Array<{
    code: string;
    label: string;
    count: number;
  }>;
  teamPerformance: Array<{
    teamId: string | null;
    teamName: string;
    currentPublicCount: number;
    todayClaimCount: number;
    todayRecycleCount: number;
    longStayCount: number;
    averageClaimHours: number | null;
    averageDwellDays: number | null;
  }>;
  ownerPerformance: Array<{
    ownerId: string;
    ownerName: string;
    ownerUsername: string;
    teamName: string | null;
    claimCount: number;
    recycledBackCount: number;
    ownerExitRecycleCount: number;
  }>;
  longStayItems: Array<{
    customerId: string;
    customerName: string;
    phone: string;
    teamName: string | null;
    publicReasonLabel: string | null;
    inPoolDays: number;
    publicEntryCount: number;
    recycleCount: number;
    lastOwnerName: string | null;
    lastEffectiveFollowUpAt: Date | null;
  }>;
  definitions: Array<{
    label: string;
    description: string;
  }>;
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function getRollingRange(days: number, now = new Date()) {
  const end = endOfDay(now);
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isClaimFromPoolEvent(event: Pick<ReportEvent, "fromOwnershipMode" | "toOwnershipMode" | "reason">) {
  return (
    (event.fromOwnershipMode === CustomerOwnershipMode.PUBLIC ||
      event.fromOwnershipMode === CustomerOwnershipMode.LOCKED) &&
    event.toOwnershipMode === CustomerOwnershipMode.PRIVATE &&
    CLAIM_EVENT_REASONS.has(event.reason)
  );
}

function isPublicEntryEvent(event: Pick<ReportEvent, "toOwnershipMode">) {
  return event.toOwnershipMode === CustomerOwnershipMode.PUBLIC;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function getVisibleTeamOptions(actor: {
  role: RoleCode;
  teamId: string | null;
}) {
  if (actor.role === "ADMIN") {
    return prisma.team.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
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
      name: true,
      code: true,
    },
  });
}

function buildCurrentPublicWhere(teamId: string | null): Prisma.CustomerWhereInput {
  return {
    AND: [
      {
        ownerId: null,
      },
      {
        ownershipMode: {
          in: [CustomerOwnershipMode.PUBLIC, CustomerOwnershipMode.LOCKED],
        },
      },
      teamId
        ? {
            publicPoolTeamId: teamId,
          }
        : {},
    ],
  };
}

function buildEventWhere(input: {
  teamId: string | null;
  start?: Date;
  end?: Date;
  customerIds?: string[];
}) {
  const clauses: Prisma.CustomerOwnershipEventWhereInput[] = [];

  if (input.teamId) {
    clauses.push({
      teamId: input.teamId,
    });
  }

  if (input.start || input.end) {
    clauses.push({
      createdAt: {
        gte: input.start,
        lte: input.end,
      },
    });
  }

  if (input.customerIds && input.customerIds.length > 0) {
    clauses.push({
      customerId: {
        in: input.customerIds,
      },
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function getCustomerPublicPoolReportsData(
  viewer: {
    id: string;
    role: RoleCode;
  },
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<CustomerPublicPoolReportsData> {
  if (!canAccessCustomerPublicPoolReports(viewer.role)) {
    throw new Error("You do not have access to customer public-pool reports.");
  }

  const actor = await getCustomerOwnershipActorContext(viewer.id);
  const teamOptions = await getVisibleTeamOptions(actor);
  const requestedTeamId = getParamValue(rawSearchParams?.teamId);
  const selectedTeamId =
    actor.role === "ADMIN" ? requestedTeamId || "" : actor.teamId ?? "";
  const selectedTeam =
    teamOptions.find((team) => team.id === selectedTeamId) ?? null;
  const parsedWindow = Number(getParamValue(rawSearchParams?.windowDays));
  const windowDays = WINDOW_OPTIONS.includes(parsedWindow as 7 | 30)
    ? (parsedWindow as 7 | 30)
    : DEFAULT_WINDOW_DAYS;
  const parsedLingerDays = Number(getParamValue(rawSearchParams?.lingerDays));
  const lingerDays =
    Number.isFinite(parsedLingerDays) && parsedLingerDays >= 1
      ? Math.min(Math.max(Math.floor(parsedLingerDays), 1), 180)
      : DEFAULT_LINGER_DAYS;
  const now = new Date();
  const todayStart = startOfDay(now);
  const range = getRollingRange(windowDays, now);
  const scopedTeamId = selectedTeamId || null;

  const [currentPublicCustomers, rangeEvents] = await Promise.all([
    prisma.customer.findMany({
      where: buildCurrentPublicWhere(scopedTeamId),
      select: currentPublicCustomerSelect,
    }),
    prisma.customerOwnershipEvent.findMany({
      where: buildEventWhere({
        teamId: scopedTeamId,
        start: range.start,
        end: range.end,
      }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: reportEventSelect,
    }),
  ]);

  const currentReasonBuckets = new Map<string, { label: string; count: number }>();
  const recycleReasonBuckets = new Map<string, { label: string; count: number }>();
  const claimReasonBuckets = new Map<string, { label: string; count: number }>();
  const todayClaimCountByTeam = new Map<string, number>();
  const todayRecycleCountByTeam = new Map<string, number>();
  const trends = new Map<string, { date: string; enteredCount: number; claimedCount: number }>();
  const ownerPerformanceMap = new Map<
    string,
    {
      ownerId: string;
      ownerName: string;
      ownerUsername: string;
      teamName: string | null;
      claimCount: number;
      recycledBackCount: number;
      ownerExitRecycleCount: number;
    }
  >();

  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = startOfDay(range.start);
    day.setDate(day.getDate() + offset);
    trends.set(getDateKey(day), {
      date: getDateKey(day),
      enteredCount: 0,
      claimedCount: 0,
    });
  }

  for (const customer of currentPublicCustomers) {
    const code = customer.publicPoolReason ?? "UNKNOWN";
    const label = customer.publicPoolReason
      ? publicPoolReasonLabels[customer.publicPoolReason]
      : "未记录原因";
    const current = currentReasonBuckets.get(code);

    if (current) {
      current.count += 1;
    } else {
      currentReasonBuckets.set(code, { label, count: 1 });
    }
  }

  for (const event of rangeEvents) {
    const dayKey = getDateKey(event.createdAt);
    const trend = trends.get(dayKey);

    if (trend && isPublicEntryEvent(event)) {
      trend.enteredCount += 1;
    }

    if (trend && isClaimFromPoolEvent(event)) {
      trend.claimedCount += 1;
    }

    if (isPublicEntryEvent(event) && RECYCLE_EVENT_REASONS.has(event.reason)) {
      const current = recycleReasonBuckets.get(event.reason);

      if (current) {
        current.count += 1;
      } else {
        recycleReasonBuckets.set(event.reason, {
          label: ownershipEventReasonLabels[event.reason],
          count: 1,
        });
      }
    }

    if (isClaimFromPoolEvent(event)) {
      const current = claimReasonBuckets.get(event.reason);

      if (current) {
        current.count += 1;
      } else {
        claimReasonBuckets.set(event.reason, {
          label: ownershipEventReasonLabels[event.reason],
          count: 1,
        });
      }
    }

    if (event.createdAt >= todayStart && isClaimFromPoolEvent(event)) {
      const teamKey = event.teamId ?? "__unknown_team__";
      todayClaimCountByTeam.set(teamKey, (todayClaimCountByTeam.get(teamKey) ?? 0) + 1);
    }

    if (event.createdAt >= todayStart && isPublicEntryEvent(event)) {
      const teamKey = event.teamId ?? "__unknown_team__";
      todayRecycleCountByTeam.set(teamKey, (todayRecycleCountByTeam.get(teamKey) ?? 0) + 1);
    }

    const claimOwner = event.toOwner ?? event.actor;

    if (isClaimFromPoolEvent(event) && claimOwner) {
      const current = ownerPerformanceMap.get(claimOwner.id) ?? {
        ownerId: claimOwner.id,
        ownerName: claimOwner.name,
        ownerUsername: claimOwner.username,
        teamName: claimOwner.team?.name ?? null,
        claimCount: 0,
        recycledBackCount: 0,
        ownerExitRecycleCount: 0,
      };
      current.claimCount += 1;
      ownerPerformanceMap.set(claimOwner.id, current);
    }

    if (isPublicEntryEvent(event) && event.fromOwner) {
      const current = ownerPerformanceMap.get(event.fromOwner.id) ?? {
        ownerId: event.fromOwner.id,
        ownerName: event.fromOwner.name,
        ownerUsername: event.fromOwner.username,
        teamName: event.fromOwner.team?.name ?? null,
        claimCount: 0,
        recycledBackCount: 0,
        ownerExitRecycleCount: 0,
      };
      current.recycledBackCount += 1;

      if (event.reason === CustomerOwnershipEventReason.OWNER_LEFT_TEAM) {
        current.ownerExitRecycleCount += 1;
      }

      ownerPerformanceMap.set(event.fromOwner.id, current);
    }
  }

  const claimEvents = rangeEvents.filter((event) => isClaimFromPoolEvent(event));
  const claimHistoryCustomerIds = [...new Set(claimEvents.map((event) => event.customerId))];
  const claimHistoryEvents =
    claimHistoryCustomerIds.length > 0
      ? await prisma.customerOwnershipEvent.findMany({
          where: buildEventWhere({
            teamId: scopedTeamId,
            end: range.end,
            customerIds: claimHistoryCustomerIds,
          }),
          orderBy: [{ customerId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            customerId: true,
            teamId: true,
            createdAt: true,
            reason: true,
            fromOwnershipMode: true,
            toOwnershipMode: true,
          },
        })
      : [];

  const claimDurationsByTeam = new Map<string, number[]>();
  const publicEnteredAtByCustomer = new Map<string, Date | null>();

  for (const event of claimHistoryEvents) {
    if (event.toOwnershipMode === CustomerOwnershipMode.PUBLIC) {
      publicEnteredAtByCustomer.set(event.customerId, event.createdAt);
      continue;
    }

    if (
      (event.fromOwnershipMode === CustomerOwnershipMode.PUBLIC ||
        event.fromOwnershipMode === CustomerOwnershipMode.LOCKED) &&
      event.toOwnershipMode === CustomerOwnershipMode.PRIVATE &&
      CLAIM_EVENT_REASONS.has(event.reason)
    ) {
      const enteredAt = publicEnteredAtByCustomer.get(event.customerId);

      if (!enteredAt) {
        continue;
      }

      const durationHours = (event.createdAt.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
      const teamKey = event.teamId ?? "__unknown_team__";
      const values = claimDurationsByTeam.get(teamKey) ?? [];
      values.push(durationHours);
      claimDurationsByTeam.set(teamKey, values);
    }
  }

  const currentPublicCountByTeam = new Map<string, number>();
  const longStayCountByTeam = new Map<string, number>();
  const dwellDaysByTeam = new Map<string, number[]>();

  for (const customer of currentPublicCustomers) {
    const teamKey = customer.publicPoolTeam?.id ?? "__unknown_team__";
    currentPublicCountByTeam.set(teamKey, (currentPublicCountByTeam.get(teamKey) ?? 0) + 1);

    const inPoolDays = customer.publicPoolEnteredAt
      ? Math.max(
          Math.floor((now.getTime() - customer.publicPoolEnteredAt.getTime()) / (1000 * 60 * 60 * 24)),
          0,
        )
      : 0;
    const dwellValues = dwellDaysByTeam.get(teamKey) ?? [];
    dwellValues.push(inPoolDays);
    dwellDaysByTeam.set(teamKey, dwellValues);

    if (customer.publicPoolEnteredAt && customer.publicPoolEnteredAt <= startOfDay(addDays(now, -lingerDays))) {
      longStayCountByTeam.set(teamKey, (longStayCountByTeam.get(teamKey) ?? 0) + 1);
    }
  }

  const currentPublicCustomerIds = currentPublicCustomers.map((customer) => customer.id);
  const currentCustomerEvents =
    currentPublicCustomerIds.length > 0
      ? await prisma.customerOwnershipEvent.findMany({
          where: buildEventWhere({
            teamId: scopedTeamId,
            customerIds: currentPublicCustomerIds,
          }),
          orderBy: [{ customerId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: {
            customerId: true,
            toOwnershipMode: true,
            reason: true,
          },
        })
      : [];

  const customerEntryStats = new Map<string, { publicEntryCount: number; recycleCount: number }>();

  for (const event of currentCustomerEvents) {
    const stats = customerEntryStats.get(event.customerId) ?? {
      publicEntryCount: 0,
      recycleCount: 0,
    };

    if (event.toOwnershipMode === CustomerOwnershipMode.PUBLIC) {
      stats.publicEntryCount += 1;
    }

    if (RECYCLE_EVENT_REASONS.has(event.reason)) {
      stats.recycleCount += 1;
    }

    customerEntryStats.set(event.customerId, stats);
  }

  const overdueThreshold = startOfDay(addDays(now, -lingerDays));
  const longStayItems = currentPublicCustomers
    .flatMap((customer) => {
      const stats = customerEntryStats.get(customer.id) ?? {
        publicEntryCount: 0,
        recycleCount: 0,
      };
      const inPoolDays = customer.publicPoolEnteredAt
        ? Math.max(
            Math.floor((now.getTime() - customer.publicPoolEnteredAt.getTime()) / (1000 * 60 * 60 * 24)),
            0,
          )
        : 0;

      const nextItem = {
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        teamName: customer.publicPoolTeam?.name ?? null,
        publicReasonLabel: customer.publicPoolReason
          ? publicPoolReasonLabels[customer.publicPoolReason]
          : null,
        inPoolDays,
        publicEntryCount: stats.publicEntryCount,
        recycleCount: stats.recycleCount,
        lastOwnerName: customer.lastOwner?.name ?? null,
        lastEffectiveFollowUpAt: customer.lastEffectiveFollowUpAt,
      };

      const isLongStay =
        Boolean(customer.publicPoolEnteredAt && customer.publicPoolEnteredAt <= overdueThreshold) ||
        stats.publicEntryCount >= 2 ||
        stats.recycleCount >= 2;

      return isLongStay ? [nextItem] : [];
    })
    .sort((left, right) => {
      if (right.inPoolDays !== left.inPoolDays) {
        return right.inPoolDays - left.inPoolDays;
      }

      if (right.publicEntryCount !== left.publicEntryCount) {
        return right.publicEntryCount - left.publicEntryCount;
      }

      return right.recycleCount - left.recycleCount;
    })
    .slice(0, 30);

  const visibleTeamRows =
    selectedTeam !== null
      ? [selectedTeam]
      : teamOptions.length > 0
        ? teamOptions
        : [{ id: "__unknown_team__", name: "未记录团队", code: "UNKNOWN" }];
  const hasUnknownTeamData =
    currentPublicCountByTeam.has("__unknown_team__") ||
    todayClaimCountByTeam.has("__unknown_team__") ||
    todayRecycleCountByTeam.has("__unknown_team__") ||
    longStayCountByTeam.has("__unknown_team__");
  const normalizedVisibleTeamRows =
    hasUnknownTeamData && !visibleTeamRows.some((team) => team.id === "__unknown_team__")
      ? [
          ...visibleTeamRows,
          { id: "__unknown_team__", name: "未记录团队", code: "UNKNOWN" },
        ]
      : visibleTeamRows;

  return {
    actor: {
      id: actor.id,
      role: actor.role,
      teamId: actor.teamId,
    },
    filters: {
      teamId: selectedTeamId,
      windowDays,
      lingerDays,
    },
    selectedTeam,
    teamOptions,
    summaryCards: [
      {
        label: "当前公海池总量",
        value: String(currentPublicCustomers.length),
        note: "当前仍处于 PUBLIC / LOCKED 且没有 owner 的客户数。",
      },
      {
        label: "今日新入池",
        value: String(
          rangeEvents.filter(
            (event) => event.createdAt >= todayStart && isPublicEntryEvent(event),
          ).length,
        ),
        note: "今天发生的全部入池事件，包含导入入池和各类回收。",
      },
      {
        label: "今日认领数",
        value: String(claimEvents.filter((event) => event.createdAt >= todayStart).length),
        note: "今天从公海回到私有承接的客户数。",
      },
      {
        label: "今日回收数",
        value: String(
          rangeEvents.filter(
            (event) =>
              event.createdAt >= todayStart &&
              isPublicEntryEvent(event) &&
              event.reason !== CustomerOwnershipEventReason.UNASSIGNED_IMPORT,
          ).length,
        ),
        note: "今天发生的 PRIVATE -> PUBLIC 回收 / 释放事件数。",
      },
      {
        label: "超时未领数",
        value: String(
          currentPublicCustomers.filter(
            (customer) => customer.publicPoolEnteredAt && customer.publicPoolEnteredAt <= overdueThreshold,
          ).length,
        ),
        note: `当前已滞留超过 ${lingerDays} 天的公海客户。`,
      },
      {
        label: "锁定中数量",
        value: String(
          currentPublicCustomers.filter(
            (customer) => customer.claimLockedUntil && customer.claimLockedUntil > now,
          ).length,
        ),
        note: "仍在 claim lock / 保护期中的公海客户数。",
      },
    ],
    trends: [...trends.values()],
    currentReasonDistribution: [...currentReasonBuckets.entries()]
      .map(([code, item]) => ({
        code,
        label: item.label,
        count: item.count,
      }))
      .sort((left, right) => right.count - left.count),
    recycleReasonDistribution: [...recycleReasonBuckets.entries()]
      .map(([code, item]) => ({
        code,
        label: item.label,
        count: item.count,
      }))
      .sort((left, right) => right.count - left.count),
    claimSourceDistribution: [...claimReasonBuckets.entries()]
      .map(([code, item]) => ({
        code,
        label: item.label,
        count: item.count,
      }))
      .sort((left, right) => right.count - left.count),
    teamPerformance: normalizedVisibleTeamRows.map((team) => {
      const teamKey = team.id;
      const claimDurations = claimDurationsByTeam.get(teamKey) ?? [];
      const dwellDays = dwellDaysByTeam.get(teamKey) ?? [];

      return {
        teamId: team.id,
        teamName: team.name,
        currentPublicCount: currentPublicCountByTeam.get(teamKey) ?? 0,
        todayClaimCount: todayClaimCountByTeam.get(teamKey) ?? 0,
        todayRecycleCount: todayRecycleCountByTeam.get(teamKey) ?? 0,
        longStayCount: longStayCountByTeam.get(teamKey) ?? 0,
        averageClaimHours: average(claimDurations),
        averageDwellDays: average(dwellDays),
      };
    }),
    ownerPerformance: [...ownerPerformanceMap.values()]
      .filter(
        (item) =>
          item.claimCount > 0 || item.recycledBackCount > 0 || item.ownerExitRecycleCount > 0,
      )
      .sort((left, right) => {
        if (right.claimCount !== left.claimCount) {
          return right.claimCount - left.claimCount;
        }

        if (right.recycledBackCount !== left.recycledBackCount) {
          return right.recycledBackCount - left.recycledBackCount;
        }

        return right.ownerExitRecycleCount - left.ownerExitRecycleCount;
      })
      .slice(0, 20),
    longStayItems,
    definitions: [
      {
        label: "今日认领数",
        description: "只统计从 PUBLIC / LOCKED 回到 PRIVATE 的 ownership 事件，包含销售认领和主管指派。",
      },
      {
        label: "今日回收数",
        description: "统计当日 PRIVATE -> PUBLIC 的 ownership 事件，包含手动释放、自动回收、离职回收和批量回收。",
      },
      {
        label: "平均认领时长",
        description: "按选定窗口内的 claim / assign 事件回看最近一次入池时间，计算从入池到被领用的平均小时数。",
      },
      {
        label: "长期滞留明细",
        description: `默认筛出滞留超过 ${lingerDays} 天、或多次进出公海、或高频回收的当前池内客户。`,
      },
      {
        label: "当前入池原因分布",
        description: "按当前仍在公海中的客户 `publicPoolReason` 聚合，反映今天池子里积压的成因结构。",
      },
    ],
  };
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}
