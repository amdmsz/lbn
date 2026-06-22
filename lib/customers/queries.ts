/**
 * F08 phase 2: getCustomerCenterData 迁移到 cursor 分页
 *
 * 当前主路径 `getCustomerCenterData` 仍依赖
 * `CUSTOMER_CENTER_LIST_HARD_CAP = 1500` 的一次性全表加载 + 内存
 * stateMap / scopeSnapshots / queueCounts 派生 (UI 拿 totalCount + page).
 * Phase 1 是加上 hard cap 防 OOM, 现在 phase 1.5 暴露真正的 cursor 分页
 * 入口 `listCustomersCursor` (server-side `[updatedAt desc, id desc]`),
 * 走 `cust_owner_updated_id_idx` 复合索引, 不再受 1500 限制.
 *
 * Phase 2 (待单独 PR) 计划:
 *   - 把 customer-center-workbench 的列表区切到 cursor (URL: `?cursor=...`),
 *   - 顶部统计 / queue 计数另起聚合接口 (避免靠列表内存聚合),
 *   - 切流稳定后再砍掉 `CUSTOMER_CENTER_LIST_HARD_CAP` 全表路径.
 *
 * 当前增量保持向后兼容: 旧函数签名 / 返回结构 / `customerSnapshotSelect`
 * 一律不动, UI 调用方 (customers-table.tsx) 也不需要改。
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import {
  CallResult,
  CustomerGrade,
  CustomerHistoryArchiveVisibility,
  CustomerOwnershipMode,
  CustomerStatus,
  FollowUpTaskStatus,
  LeadSource,
  LeadStatus,
  LiveSessionStatus,
  SalesOrderReviewStatus,
  TradeOrderStatus,
  UserStatus,
  WechatAddStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canTransferCustomerOwner,
} from "@/lib/auth/access";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  getEnabledCallResultOptions,
  hydrateCallResultLabels,
} from "@/lib/calls/settings";
import {
  CUSTOMERS_PAGE_SIZE,
  customerManualCreateOperationAction,
  customerPageSizeOptions,
  type CustomerExecutionClass,
  type CustomerDetailTab,
  type CustomerPageSize,
  type CustomerQueueKey,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import {
  findActiveCustomerRecycleEntry,
  listActiveCustomerIds,
} from "@/lib/customers/recycle";
import {
  encodeCursor as encodeCustomerListCursor,
  type CustomerListCursor,
} from "@/lib/customers/list-cursor";
import { parseCustomerImportOperationLogData } from "@/lib/customers/customer-import-operation-log";
import { resolveImportedCustomerDeletionGuard } from "@/lib/customers/imported-customer-deletion";
import { resolveCustomerAvatarSrc } from "@/lib/customers/avatar";
import { prisma } from "@/lib/db/prisma";
import {
  ACTIVE_SALES_ORDER_SETTLEMENT_WHERE,
  ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE,
} from "@/lib/trade-orders/settlement";
import {
  customerContinuationImportOperationActions,
  type CustomerImportOperationLogData,
} from "@/lib/lead-imports/metadata";
import {
  buildVisibleLeadWhereInput,
  withVisibleLeadWhere,
} from "@/lib/leads/visibility";
import { getActiveTagOptions } from "@/lib/master-data/queries";
import {
  buildCustomerFinalizePreview,
  getCustomerRecycleTarget,
} from "@/lib/recycle-bin/customer-adapter";
import type {
  RecycleFinalizePreview,
  RecycleMoveGuard,
} from "@/lib/recycle-bin/types";

type SearchParamsValue = string | string[] | undefined;

type CustomerCenterActor = {
  id: string;
  name: string;
  username: string;
  role: RoleCode;
  teamId: string | null;
};

type CustomerSnapshot = Prisma.CustomerGetPayload<{
  select: typeof customerSnapshotSelect;
}>;

type CustomerDashboardSnapshot = Prisma.CustomerGetPayload<{
  select: typeof customerDashboardSnapshotSelect;
}>;

type CustomerSnapshotState = {
  latestLeadAt: Date | null;
  latestFollowUpAt: Date | null;
  latestCustomerImportAt: Date | null;
  assignedAt: Date | null;
  executionClass: CustomerExecutionClass;
  newImported: boolean;
  pendingFirstCall: boolean;
  pendingFollowUp: boolean;
  pendingWechat: boolean;
  pendingInvitation: boolean;
  pendingDeal: boolean;
  migrationPendingFollowUp: boolean;
  // Wave 11: 是否已加微 (复用 buildSuccessfulWechatMatcher). 列表行据此决定是否
  // 隐藏 "已拨 X/5" 提示. 与 pendingWechat 不同 — pendingWechat 还要求"加微进行中".
  isWechatAdded: boolean;
  workingStatuses: CustomerWorkStatusKey[];
  latestInterestedProduct: string | null;
  // 最近意向的金额 / 发生时间标注 (信息流导入的"金额""日期"列). 仅在对应 lead
  // 上有值时给出, 老数据保持 null, 列表行只显产品名.
  latestInterestedAmount: string | null;
  latestInterestedAt: Date | null;
  latestPurchasedProduct: string | null;
  productKeys: string[];
  tagIds: string[];
};

type CustomerDashboardState = Omit<
  CustomerSnapshotState,
  | "latestInterestedProduct"
  | "latestInterestedAmount"
  | "latestInterestedAt"
  | "latestPurchasedProduct"
  | "productKeys"
  | "tagIds"
>;

type CustomerStateSource = {
  id: string;
  createdAt: Date;
  lastEffectiveFollowUpAt: Date | null;
  ownerId: string | null;
  leads: Array<{
    id: string;
    createdAt: Date;
    status: LeadStatus;
    nextFollowUpAt: Date | null;
  }>;
  followUpTasks: Array<{
    createdAt: Date;
    dueAt: Date;
    completedAt: Date | null;
    status: FollowUpTaskStatus;
  }>;
  callRecords: Array<{
    callTime: Date;
    result: CallResult | null;
    resultCode: string | null;
    nextFollowUpAt: Date | null;
  }>;
  wechatRecords: Array<{
    createdAt: Date;
    addedAt: Date | null;
    addedStatus: WechatAddStatus;
    nextFollowUpAt: Date | null;
  }>;
  liveInvitations: Array<{
    createdAt: Date;
    invitedAt: Date | null;
  }>;
  salesOrders: Array<{
    reviewStatus: SalesOrderReviewStatus;
  }>;
  tradeOrders: Array<{
    tradeStatus: TradeOrderStatus;
  }>;
};

type CustomerProductFilterSource = "interested" | "purchased";

type CustomerProductFilterOption = {
  key: string;
  label: string;
  source: CustomerProductFilterSource;
  count: number;
};

type ActiveTagOption = Awaited<ReturnType<typeof getActiveTagOptions>>[number];

export type CustomerTagFilterOption = ActiveTagOption & {
  count: number;
};

export type CustomerViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type CustomerCenterFilters = {
  queue: CustomerQueueKey;
  executionClasses: CustomerExecutionClass[];
  // Wave 7-B: 客户分级 A/B/C/D/F multi-select. 空数组 = 不过滤.
  grades: CustomerGrade[];
  teamId: string;
  salesId: string;
  search: string;
  productKeys: string[];
  productKeyword: string;
  tagIds: string[];
  assignedFrom: string;
  assignedTo: string;
  page: number;
  pageSize: CustomerPageSize;
};

export type CustomerSummaryStats = {
  customerCount: number;
  todayNewCustomerCount: number;
  todayNewImportedCount: number;
  todayAssignedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingWechatCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
  migrationPendingFollowUpCount: number;
  executionClassCounts: Record<CustomerExecutionClass, number>;
  latestFollowUpAt: Date | null;
};

export type TeamOverviewItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  supervisor:
    | {
        id: string;
        name: string;
        username: string;
      }
    | null;
  salesCount: number;
  customerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
  migrationPendingFollowUpCount: number;
};

export type SalesRepBoardItem = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
  customerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingFollowUpCount: number;
  pendingDealCount: number;
  migrationPendingFollowUpCount: number;
  latestFollowUpAt: Date | null;
};

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string;
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  status: CustomerStatus;
  // Wave 7-B 客户分级 A/B/C/D/F. null 表示新客户还没攒到信号.
  grade: CustomerGrade | null;
  // Wave 11 累计拨打次数 = CallRecord 总条数. 列表行用它显 "已拨 X/5".
  callCount: number;
  // Wave 11 是否已加微 (复用加微判定: 有 ADDED WechatRecord 或 result=WECHAT_ADDED
  // 的 CallRecord). 已加微时行上不再显 "已拨 X/5".
  isWechatAdded: boolean;
  ownershipMode: CustomerOwnershipMode;
  createdAt: Date;
  avatarUrl: string | null;
  assignedAt: Date | null;
  latestImportAt: Date | null;
  latestFollowUpAt: Date | null;
  lastEffectiveFollowUpAt: Date | null;
  latestTradeAt: Date | null;
  lifetimeTradeAmount: string;
  approvedTradeOrderCount: number;
  executionClass: CustomerExecutionClass;
  newImported: boolean;
  pendingFirstCall: boolean;
  latestInterestedProduct: string | null;
  // 最近意向的金额 / 发生时间 (导入名单的"金额""日期"列), 列表行标注在产品名旁.
  latestInterestedAmount: string | null;
  latestInterestedAt: Date | null;
  latestPurchasedProduct: string | null;
  remark: string | null;
  workingStatuses: CustomerWorkStatusKey[];
  recycleGuard: RecycleMoveGuard;
  recycleFinalizePreview: RecycleFinalizePreview | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  leads: Array<{
    id: string;
    source: LeadSource;
    status: string;
    interestedProduct: string | null;
    createdAt: Date;
  }>;
  callRecords: Array<{
    id: string;
    callTime: Date;
    durationSeconds: number;
    callSource: "crm-outbound" | "local-phone";
    result: CallResult | null;
    resultCode: string | null;
    resultLabel: string;
    remark: string | null;
    nextFollowUpAt: Date | null;
    sales: {
      name: string;
      username: string;
    };
  }>;
  _count: {
    leads: number;
    callRecords: number;
  };
  customerTags: Array<{
    id: string;
    tagId: string;
    tag: {
      id: string;
      name: string;
      color: string | null;
    };
  }>;
};

export type CustomerPhoneSearchDisclosure = {
  id: string;
  name: string;
  phoneMasked: string;
  ownershipMode: CustomerOwnershipMode;
  owner: {
    id: string;
    name: string;
    username: string;
    team: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
  lastOwner: {
    id: string;
    name: string;
    username: string;
    team: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
  publicPoolTeam: {
    id: string;
    name: string;
    code: string;
  } | null;
  // 非空 = 这条命中是"当前视角能去认领的公海客户"(ADMIN=任意公海; SUPERVISOR/SALES=
  // 本团队公海), 值为公海团队名. 前端据此把文案从"不在你可见范围"换成"可前往认领".
  claimablePoolTeamName: string | null;
  updatedAt: Date;
};

export type CustomerOwnershipHistoryArchive = {
  id: string;
  sourceCustomerId: string;
  sourceCustomerName: string;
  sourceCustomerPhone: string;
  sourceOwnerLabel: string | null;
  sourceExecutionClass: string | null;
  visibility: CustomerHistoryArchiveVisibility;
  reason: string;
  snapshot: Prisma.JsonValue;
  createdAt: Date;
  createdBy: {
    name: string;
    username: string;
  } | null;
};

export type CustomerCenterData = {
  actor: CustomerCenterActor;
  filters: CustomerCenterFilters;
  scopeMode: "organization" | "team" | "sales" | "personal" | "team_unassigned";
  selectedTeam: TeamOverviewItem | null;
  selectedSales: SalesRepBoardItem | null;
  summary: CustomerSummaryStats;
  queueCounts: Record<CustomerQueueKey, number>;
  teamOverview: TeamOverviewItem[];
  salesBoard: SalesRepBoardItem[];
  /**
   * 批量"移交所有人"目标候选: 仅按 viewer scope 过滤 (ADMIN 全, SUPERVISOR
   * 本团队), 不受当前 filter (teamId/salesId) 限制.
   *
   * 与 `salesBoard` 的区别: `salesBoard` 用于"销售员表现榜" UI, 跟随当前
   * filter (team 选中后只显示该团队成员); `transferableOwners` 用于批量
   * 移交 dropdown, 必须显示视野内全集销售, 否则 ADMIN 选了某 team filter
   * 之后 dropdown 会变成空 (该 team 内可能 0 个有效移交目标).
   */
  transferableOwners: SalesRepBoardItem[];
  productOptions: CustomerProductFilterOption[];
  tagOptions: CustomerTagFilterOption[];
  callResultOptions: CallResultOption[];
  queueItems: CustomerListItem[];
  phoneSearchDisclosures: CustomerPhoneSearchDisclosure[];
  pagination: CustomerCenterPagination;
};

/**
 * F08 phase 2: 客户中心分页元信息.
 *
 * 旧路径 (`page` mode) 携带完整 `page / totalPages / totalCount`, 走 1500 行
 * hard cap. 新 cursor 路径 (`?cursor=...`) 只暴露 `nextCursor` 与本页 size,
 * 不再实时计算 totalCount; 老路径继续 backward compat (不传 `mode` 时默认
 * `page`).
 */
export type CustomerCenterPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  /** 翻页模式: "page" 走旧 page 号; "cursor" 走 keyset cursor. 不传按 "page". */
  mode?: "page" | "cursor";
  /** cursor 模式下的下一页 cursor (已 base64url 编码); 末页为 null. */
  nextCursor?: string | null;
  /** 当前页本身的 cursor (用于 UI debug, 第一页为 null). */
  currentCursor?: string | null;
};

export type CustomerOperatingDashboardMetric = {
  label: string;
  value: string;
  note: string;
  emphasis?: "default" | "info" | "success" | "warning";
};

export type CustomerOperatingDashboardEmployeeRow = {
  userId: string;
  name: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
  customerCount: number;
  todayAssignedCount: number;
  todayCallCount: number;
  connectedAssignedCount: number;
  connectRate: string;
  todayWechatAddedCount: number;
  historicalWechatAddedCount: number;
  historicalWechatAddedRate: string;
  todayAssignedWechatCount: number;
  todayAssignedWechatRate: string;
  todayInvitationCount: number;
  todayDealCount: number;
  todayRevenueAmount: number;
  todayRevenue: string;
  executionClassCounts: Record<CustomerExecutionClass, number>;
  latestFollowUpAt: Date | null;
};

export type CustomerOperatingDashboardData = {
  scopeLabel: string;
  asOfDateLabel: string;
  periodLabel: string;
  filters: {
    from: string;
    to: string;
  };
  summary: CustomerOperatingDashboardMetric[];
  employees: CustomerOperatingDashboardEmployeeRow[];
};

export type CustomerOwnerTransferOption = {
  id: string;
  name: string;
  username: string;
  team: {
    id: string;
    name: string;
    code: string;
  } | null;
};

// F08 (audit) 客户中心 list 硬上限. ADMIN 视图无 owner scope, 大客户量时
// 全表加载会 OOM. 旧值 1500 在 2026-06-08 真实数据 5826 ACTIVE 客户场景下
// 触发截断, 主管/ADMIN 报告 "客户不见了". hotfix 提到 10000 — 实测每个
// snapshot 内存占用约 1-2KB, 10000 约 10-20MB, 远低于 node heap.
// 真正的修复仍然是 F08 phase 2 cursor 分页 (lib/customers/list-cursor.ts +
// listCustomersCursor 已就绪), 后续切流; 此值临时上调到 10000 保证 UI 完整性.
// 触发 cap 时 console.warn 仍然保留作为 cursor 切流压力的早期信号.
const CUSTOMER_CENTER_LIST_HARD_CAP = 10000;

// 客户列表统一排序: 按导入时间固定 (createdAt 降序, 新导入在最前), id 降序
// 作为稳定 tiebreaker.
//
// 业务原因: 销售按列表从上往下挨个拨打. 旧排序 `updatedAt desc` 会在销售记录
// 通话/备注 (touch updatedAt) 后把该客户弹到列表最前, 顺序乱掉 — 销售反馈
// "保留记录后客户位置变了, 很乱". 改成 createdAt 后, 记录动作不再改变客户在
// 列表的位置 (createdAt 不会被 touch), 顺序稳定. 新导入的客户排在列表最前,
// 方便优先跟进新资源; 拨打过程中只要没有新导入, 顺序纹丝不动.
//
// 性能: 没有 (ownerId, createdAt, id) 复合索引, MariaDB 走 filesort. 当前
// 5826 行级别 filesort 是毫秒级, 可接受; 量级再涨可加索引.
const CUSTOMER_CENTER_LIST_ORDER_BY: Prisma.CustomerOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

const customerQueueValues = [
  "all",
  "new_imported",
  "pending_first_call",
  "pending_dial",
  "pending_follow_up",
  "pending_wechat",
  "wechat_added",
  "pending_invitation",
  "pending_deal",
  "migration_pending_follow_up",
] as const satisfies CustomerQueueKey[];

const customerWorkStatusValues = [
  "new_imported",
  "pending_first_call",
  "pending_follow_up",
  "pending_wechat",
  "pending_invitation",
  "pending_deal",
  "migration_pending_follow_up",
] as const satisfies CustomerWorkStatusKey[];

const customerExecutionClassValues = ["A", "B", "C", "D", "E"] as const satisfies CustomerExecutionClass[];

const pendingFirstCallLeadStatuses: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.ASSIGNED,
  LeadStatus.FIRST_CALL_PENDING,
];

const pendingDealLeadStatuses: LeadStatus[] = [
  LeadStatus.LIVE_INVITED,
  LeadStatus.LIVE_WATCHED,
  LeadStatus.ORDERED,
];

const connectedCallResults: CallResult[] = [
  CallResult.CONNECTED_NO_TALK,
  CallResult.INTERESTED,
  CallResult.WECHAT_PENDING,
  CallResult.WECHAT_ADDED,
  CallResult.REFUSED_WECHAT,
  CallResult.NEED_CALLBACK,
  CallResult.REFUSED_TO_BUY,
  CallResult.BLACKLIST,
];

const nonConnectedCallResultCodes = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
  "HUNG_UP",
] as const;

const hiddenDashboardSalesUsernames = ["z002"] as const;

const activeCustomerOwnershipModes = [
  CustomerOwnershipMode.PRIVATE,
  CustomerOwnershipMode.LOCKED,
] as const;

const publicPoolCustomerDetailModes = [
  CustomerOwnershipMode.PUBLIC,
  CustomerOwnershipMode.LOCKED,
] as const;

const legacyQueueAliasMap: Partial<Record<string, CustomerQueueKey>> = {
  all: "all",
  mine: "all",
  pending_first_call: "pending_first_call",
  wechat_pending: "pending_wechat",
  // Wave 12: wechat_added 成为真实队列 (已加微), legacy `?view=wechat_added`
  // 不再近似映射到 pending_invitation.
  wechat_added: "wechat_added",
};

const customerCenterFiltersSchema = z.object({
  queue: z.enum(customerQueueValues).default("all"),
  executionClasses: z.array(z.enum(customerExecutionClassValues)).default([]),
  // Wave 7-B: 客户分级 A/B/C/D/F 多选过滤. 与执行档独立 — 执行档是行为画像
  // (CALLED_TODAY / WECHAT_PENDING 之类), grade 是销售里程碑 (A 成交 / B 加微
  // / ...). 两个可以叠加, 也可以单独筛.
  grades: z
    .array(z.enum([CustomerGrade.A, CustomerGrade.B, CustomerGrade.C, CustomerGrade.D, CustomerGrade.F]))
    .default([]),
  teamId: z.string().trim().default(""),
  salesId: z.string().trim().default(""),
  search: z.string().trim().default(""),
  productKeys: z.array(z.string().trim().min(1)).default([]),
  productKeyword: z.string().trim().default(""),
  tagIds: z.array(z.string().trim().min(1)).default([]),
  assignedFrom: z.string().trim().default(""),
  assignedTo: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z
    .coerce
    .number()
    .int()
    .refine(
      (value): value is CustomerPageSize =>
        customerPageSizeOptions.includes(value as CustomerPageSize),
      { message: "Invalid page size." },
    )
    .default(CUSTOMERS_PAGE_SIZE),
});

const detailTabSchema = z.enum([
  "profile",
  "calls",
  "wechat",
  "live",
  "orders",
  "logs",
]);

const customerSnapshotSelect = {
  id: true,
  name: true,
  phone: true,
  remark: true,
  grade: true,
  callCount: true,
  createdAt: true,
  lastEffectiveFollowUpAt: true,
  ownerId: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  },
  leads: {
    where: buildVisibleLeadWhereInput(),
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      source: true,
      status: true,
      remark: true,
      interestedProduct: true,
      interestedAmount: true,
      interestedAt: true,
      nextFollowUpAt: true,
    },
  },
  followUpTasks: {
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      dueAt: true,
      completedAt: true,
      content: true,
      status: true,
    },
  },
  callRecords: {
    orderBy: { callTime: "desc" },
    take: 20,
    select: {
      id: true,
      callTime: true,
      result: true,
      resultCode: true,
      remark: true,
      nextFollowUpAt: true,
    },
  },
  wechatRecords: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      addedAt: true,
      addedStatus: true,
      nextFollowUpAt: true,
    },
  },
  liveInvitations: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      invitedAt: true,
    },
  },
  salesOrders: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      reviewStatus: true,
      items: {
        select: {
          productNameSnapshot: true,
        },
      },
    },
  },
  tradeOrders: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      tradeStatus: true,
    },
  },
  customerTags: {
    select: {
      tagId: true,
    },
  },
} satisfies Prisma.CustomerSelect;

const customerDashboardSnapshotSelect = {
  id: true,
  createdAt: true,
  lastEffectiveFollowUpAt: true,
  ownerId: true,
  leads: {
    where: buildVisibleLeadWhereInput(),
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      status: true,
      nextFollowUpAt: true,
    },
  },
  followUpTasks: {
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      createdAt: true,
      dueAt: true,
      completedAt: true,
      status: true,
    },
  },
  callRecords: {
    orderBy: { callTime: "desc" },
    take: 20,
    select: {
      callTime: true,
      result: true,
      resultCode: true,
      nextFollowUpAt: true,
    },
  },
  wechatRecords: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      createdAt: true,
      addedAt: true,
      addedStatus: true,
      nextFollowUpAt: true,
    },
  },
  liveInvitations: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      createdAt: true,
      invitedAt: true,
    },
  },
  salesOrders: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      reviewStatus: true,
    },
  },
  tradeOrders: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      tradeStatus: true,
    },
  },
} satisfies Prisma.CustomerSelect;

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getParamValues(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isSameOrBefore(value: Date, boundary: Date) {
  return value.getTime() <= boundary.getTime();
}

function isWithinToday(value: Date, todayStart: Date, todayEnd: Date) {
  return value.getTime() >= todayStart.getTime() && value.getTime() <= todayEnd.getTime();
}

function getMaxDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

async function getLatestCustomerImportMap(customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, { createdAt: Date; data: CustomerImportOperationLogData }>();
  }

  const logs = await prisma.operationLog.findMany({
    where: {
      targetType: "CUSTOMER",
      targetId: {
        in: customerIds,
      },
      action: {
        in: [...customerContinuationImportOperationActions],
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      targetId: true,
      createdAt: true,
      afterData: true,
    },
  });

  const latestMap = new Map<string, { createdAt: Date; data: CustomerImportOperationLogData }>();

  for (const log of logs) {
    if (latestMap.has(log.targetId)) {
      continue;
    }

    const parsed = parseCustomerImportOperationLogData(log.afterData);
    if (!parsed) {
      continue;
    }

    latestMap.set(log.targetId, {
      createdAt: log.createdAt,
      data: parsed,
    });
  }

  return latestMap;
}

async function getLatestCustomerAssignmentMap<
  T extends Pick<CustomerStateSource, "id" | "ownerId" | "leads">,
>(customerSnapshots: T[]) {
  if (customerSnapshots.length === 0) {
    return new Map<string, Date>();
  }

  const customerIds = customerSnapshots.map((snapshot) => snapshot.id);
  const leadIds = [...new Set(customerSnapshots.flatMap((snapshot) => snapshot.leads.map((lead) => lead.id)))];
  const currentOwnerByCustomerId = new Map(
    customerSnapshots.map((snapshot) => [snapshot.id, snapshot.ownerId] as const),
  );

  const [ownershipEvents, leadAssignments, manualCreateLogs] = await Promise.all([
    prisma.customerOwnershipEvent.findMany({
      where: {
        customerId: {
          in: customerIds,
        },
        toOwnerId: {
          not: null,
        },
        toOwnershipMode: CustomerOwnershipMode.PRIVATE,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        customerId: true,
        toOwnerId: true,
        createdAt: true,
      },
    }),
    leadIds.length > 0
      ? prisma.leadAssignment.findMany({
          where: {
            leadId: {
              in: leadIds,
            },
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            createdAt: true,
            toUserId: true,
            lead: {
              select: {
                customerId: true,
              },
            },
          },
        })
      : Promise.resolve(
          [] as Array<{
            createdAt: Date;
            toUserId: string;
            lead: {
              customerId: string | null;
            };
          }>,
        ),
    prisma.operationLog.findMany({
      where: {
        targetType: "CUSTOMER",
        targetId: {
          in: customerIds,
        },
        action: customerManualCreateOperationAction,
      },
      orderBy: [{ createdAt: "desc" }],
      select: {
        targetId: true,
        createdAt: true,
        afterData: true,
      },
    }),
  ]);

  const latestMap = new Map<string, Date>();

  for (const event of ownershipEvents) {
    const expectedOwnerId = currentOwnerByCustomerId.get(event.customerId);

    if (!expectedOwnerId || event.toOwnerId !== expectedOwnerId || latestMap.has(event.customerId)) {
      continue;
    }

    latestMap.set(event.customerId, event.createdAt);
  }

  for (const assignment of leadAssignments) {
    const customerId = assignment.lead.customerId;

    if (!customerId || latestMap.has(customerId)) {
      continue;
    }

    const expectedOwnerId = currentOwnerByCustomerId.get(customerId);

    if (!expectedOwnerId || assignment.toUserId !== expectedOwnerId) {
      continue;
    }

    latestMap.set(customerId, assignment.createdAt);
  }

  for (const log of manualCreateLogs) {
    if (latestMap.has(log.targetId)) {
      continue;
    }

    const expectedOwnerId = currentOwnerByCustomerId.get(log.targetId);

    if (!expectedOwnerId) {
      continue;
    }

    const ownerId =
      log.afterData &&
      typeof log.afterData === "object" &&
      "ownerId" in log.afterData &&
      typeof log.afterData.ownerId === "string"
        ? log.afterData.ownerId
        : null;

    if (ownerId !== expectedOwnerId) {
      continue;
    }

    latestMap.set(log.targetId, log.createdAt);
  }

  return latestMap;
}

function parseDateOnly(value: string, boundary: "start" | "end") {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return boundary === "start" ? startOfDay(parsed) : endOfDay(parsed);
}

function normalizeTextValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function buildProductFilterKey(source: CustomerProductFilterSource, label: string) {
  return `${source}:${normalizeTextValue(label).toLowerCase()}`;
}

function formatPercentValue(numerator: number, denominator: number) {
  if (denominator === 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCurrencyValue(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDashboardDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDashboardDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDashboardDateRange(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  const today = new Date();
  const rawFrom = getParamValue(rawSearchParams?.from);
  const rawTo = getParamValue(rawSearchParams?.to);
  const parsedFrom = parseDashboardDate(rawFrom);
  const parsedTo = parseDashboardDate(rawTo);
  const baseDate = parsedFrom ?? parsedTo ?? today;
  let rangeStart = startOfDay(parsedFrom ?? baseDate);
  let rangeEnd = endOfDay(parsedTo ?? baseDate);

  if (rangeStart.getTime() > rangeEnd.getTime()) {
    [rangeStart, rangeEnd] = [startOfDay(rangeEnd), endOfDay(rangeStart)];
  }

  const from = formatDateInputValue(rangeStart);
  const to = formatDateInputValue(rangeEnd);
  const periodLabel =
    from === to
      ? formatDashboardDate(rangeStart)
      : `${formatDashboardDate(rangeStart)} - ${formatDashboardDate(rangeEnd)}`;

  return {
    rangeStart,
    rangeEnd,
    from,
    to,
    periodLabel,
  };
}

function createExecutionClassCountMap() {
  return customerExecutionClassValues.reduce<Record<CustomerExecutionClass, number>>(
    (result, value) => {
      result[value] = 0;
      return result;
    },
    {} as Record<CustomerExecutionClass, number>,
  );
}

function isConnectedCallRecord(record: {
  result: CallResult | null;
  resultCode: string | null;
}) {
  if (record.resultCode) {
    return !nonConnectedCallResultCodes.includes(
      record.resultCode as (typeof nonConnectedCallResultCodes)[number],
    );
  }

  return record.result ? connectedCallResults.includes(record.result) : false;
}

function getCustomerVisibilityWhereInput(actor: CustomerCenterActor): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
    };
  }

  if (actor.role === "SUPERVISOR") {
    if (!actor.teamId) {
      return {
        id: "__missing_team_scope__",
      };
    }

    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    };
  }

  if (actor.role === "SALES") {
    return {
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      ownerId: actor.id,
    };
  }

  return {
    id: "__forbidden_customer_scope__",
  };
}

function getCustomerDashboardVisibilityWhereInput(
  actor: CustomerCenterActor,
): Prisma.CustomerWhereInput {
  if (actor.role === "SALES") {
    if (!actor.teamId) {
      return getCustomerVisibilityWhereInput(actor);
    }

    return {
      ownerId: {
        not: null,
      },
      ownershipMode: {
        in: [...activeCustomerOwnershipModes],
      },
      owner: {
        is: {
          teamId: actor.teamId,
        },
      },
    };
  }

  return getCustomerVisibilityWhereInput(actor);
}

function getCustomerPublicPoolDetailWhereInput(
  actor: CustomerCenterActor,
): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
    };
  }

  if ((actor.role === "SUPERVISOR" || actor.role === "SALES") && actor.teamId) {
    return {
      ownerId: null,
      ownershipMode: {
        in: [...publicPoolCustomerDetailModes],
      },
      publicPoolTeamId: actor.teamId,
    };
  }

  return {
    id: "__forbidden_public_pool_customer_detail__",
  };
}

async function getCustomerCenterActor(userId: string): Promise<CustomerCenterActor> {
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

function parseCustomerCenterFilters(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  const rawQueue =
    getParamValue(rawSearchParams?.queue) ||
    legacyQueueAliasMap[getParamValue(rawSearchParams?.view)] ||
    "all";
  const search =
    getParamValue(rawSearchParams?.search) ||
    getParamValue(rawSearchParams?.name) ||
    getParamValue(rawSearchParams?.phone);
  const executionClasses = getParamValues(rawSearchParams?.executionClasses).filter(
    (value): value is CustomerExecutionClass =>
      customerExecutionClassValues.includes(value as CustomerExecutionClass),
  );
  // Wave 7-B: 客户分级 multi-select. 容错: 同时接受单数 `grade` 和复数 `grades`,
  // 大小写宽松化到 A/B/C/D/F.
  const gradeRaw = [
    ...getParamValues(rawSearchParams?.grades),
    ...getParamValues(rawSearchParams?.grade),
  ];
  const grades = gradeRaw
    .map((value) => value.toUpperCase())
    .filter((value): value is CustomerGrade =>
      (Object.values(CustomerGrade) as string[]).includes(value),
    );
  const rawPageSize = Number(getParamValue(rawSearchParams?.pageSize) || CUSTOMERS_PAGE_SIZE);
  const pageSize = customerPageSizeOptions.includes(rawPageSize as CustomerPageSize)
    ? rawPageSize
    : CUSTOMERS_PAGE_SIZE;

  return customerCenterFiltersSchema.parse({
    queue: rawQueue,
    executionClasses: [...new Set(executionClasses)],
    grades: [...new Set(grades)],
    teamId: getParamValue(rawSearchParams?.teamId),
    salesId: getParamValue(rawSearchParams?.salesId),
    search,
    productKeys: getParamValues(rawSearchParams?.productKeys),
    productKeyword: getParamValue(rawSearchParams?.productKeyword),
    tagIds: getParamValues(rawSearchParams?.tagIds),
    assignedFrom:
      getParamValue(rawSearchParams?.assignedFrom) || getParamValue(rawSearchParams?.importedFrom),
    assignedTo:
      getParamValue(rawSearchParams?.assignedTo) || getParamValue(rawSearchParams?.importedTo),
    page: getParamValue(rawSearchParams?.page) || "1",
    pageSize,
  });
}

function getCustomerHistoryArchiveVisibilityWhere(
  viewer: Pick<CustomerViewer, "role">,
): Prisma.CustomerHistoryArchiveWhereInput {
  return viewer.role === "ADMIN" || viewer.role === "SUPERVISOR"
    ? {}
    : { visibility: CustomerHistoryArchiveVisibility.ALL_ROLES };
}

function normalizePhoneSearchDigits(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("86")) {
    return digits.slice(2);
  }

  if (digits.length === 14 && digits.startsWith("086")) {
    return digits.slice(3);
  }

  return digits;
}

function getPhoneOwnershipSearchDigits(value: string) {
  const digits = normalizePhoneSearchDigits(value);

  return digits.length >= 7 ? digits : "";
}

function maskPhoneForOwnershipDisclosure(value: string) {
  const digits = normalizePhoneSearchDigits(value);

  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }

  return value ? "已登记手机号" : "未登记手机号";
}

async function getPhoneSearchOwnershipDisclosures(input: {
  actor: CustomerCenterActor;
  search: string;
  visibleCustomerIds: string[];
  recycledCustomerIds: string[];
}): Promise<CustomerPhoneSearchDisclosure[]> {
  // 号码归属提示对所有客户域角色开放 (ADMIN/SUPERVISOR/SALES). ADMIN 看不到
  // 公海客户、SUPERVISOR 看不到跨团队客户, 搜手机号时给"号码已存在"提示, 避免
  // "查不到却又导不进"的困惑 (导入查重是全库的, 列表可见是按权限的).
  if (!canAccessCustomerModule(input.actor.role)) {
    return [];
  }

  const phoneDigits = getPhoneOwnershipSearchDigits(input.search);

  if (!phoneDigits) {
    return [];
  }

  // 排除"已在我可见范围内"和"已回收"的客户, 改在 JS 里过滤: ADMIN 可见集是全部
  // 有主客户, 体量可达上万, 直接塞进 SQL notIn 会拖慢手机号查询. Customer.phone
  // 唯一, 整号搜索至多命中 1 条; take 放宽到 25 兜底部分号 / 历史脏数据的情形.
  const excludedIds = new Set([
    ...input.visibleCustomerIds,
    ...input.recycledCustomerIds,
  ]);

  const rows = await prisma.customer.findMany({
    where: {
      phone: {
        contains: phoneDigits,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 25,
    select: {
      id: true,
      name: true,
      phone: true,
      ownershipMode: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      lastOwner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      publicPoolTeam: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  return rows
    .filter((row) => !excludedIds.has(row.id))
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      name: row.name,
      phoneMasked: maskPhoneForOwnershipDisclosure(row.phone),
      ownershipMode: row.ownershipMode,
      owner: row.owner,
      lastOwner: row.lastOwner,
      publicPoolTeam: row.publicPoolTeam,
      // 无主 + PUBLIC + 有公海团队, 且当前视角够得着该公海 (ADMIN 任意 / 否则本团队).
      claimablePoolTeamName:
        row.owner === null &&
        row.ownershipMode === CustomerOwnershipMode.PUBLIC &&
        row.publicPoolTeam !== null &&
        (input.actor.role === "ADMIN" ||
          row.publicPoolTeam.id === input.actor.teamId)
          ? row.publicPoolTeam.name
          : null,
      updatedAt: row.updatedAt,
    }));
}

async function getCustomerOwnershipHistoryArchives(
  viewer: CustomerViewer,
  customer: Pick<CustomerListItem, "id" | "phone">,
): Promise<CustomerOwnershipHistoryArchive[]> {
  return prisma.customerHistoryArchive.findMany({
    where: {
      ...getCustomerHistoryArchiveVisibilityWhere(viewer),
      OR: [
        { targetCustomerId: customer.id },
        {
          sourceCustomerPhone: customer.phone,
          targetCustomerId: null,
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
    select: {
      id: true,
      sourceCustomerId: true,
      sourceCustomerName: true,
      sourceCustomerPhone: true,
      sourceOwnerLabel: true,
      sourceExecutionClass: true,
      visibility: true,
      reason: true,
      snapshot: true,
      createdAt: true,
      createdBy: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });
}

// F17 customers/perf phase 1: SSR cache for the four heavy queries that
// `getCustomerCenterWorkspaceBase` runs on every /customers navigation.
//
// 背景: 单次 SSR 全表加载 5826 ACTIVE 客户 (+ 8 关系表 select) + teams +
// salesUsers + recycled-id set 让用户在 sidebar 来回切到 /customers 时
// "卡 1-3 秒". CPU 闲, mysql 9%, 不是 DB 瓶颈, 是无意义的重复 round-trip.
// 这里把那 4 个 query 各自 unstable_cache 60s, tag = CACHE_TAGS.customerList,
// 任何 mutation (新增/移交/删/打标签 等) 都会通过现有 revalidateTag 路径清掉.
//
// 缓存 key 设计:
//   - ADMIN:     共享同一 key (visibleWhere 全开, 所有 ADMIN 看到相同集合)
//   - SUPERVISOR 按 teamId 分 key
//   - SALES      按 viewerId 分 key
// stateMap / scopeSnapshots 是从 customerSnapshots 内存派生, 不进缓存.
//
// 由于 unstable_cache 内部走 JSON.stringify/parse (Next 16
// node_modules/next/.../unstable-cache.js), Prisma 的 Date 字段会被序列化成
// ISO string. 缓存回流时需要 revive 为 Date, 否则 downstream 大量的
// `.getTime()` 调用会爆. `reviveCustomerSnapshotDates` 只针对
// `customerSnapshotSelect` 里能出现 Date 的字段路径, teams / salesUsers /
// recycledCustomerIds 不含 Date, 不需要 revive.

type CustomerCenterListSnapshot = CustomerSnapshot;

type CustomerCenterTeamRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  supervisor: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type CustomerCenterSalesUserRow = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  team: {
    id: string;
    name: string;
    code: string;
  } | null;
};

const CUSTOMER_CENTER_CACHE_TTL_SECONDS = 60;

function reviveDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function reviveRequiredDate(value: unknown): Date {
  const revived = reviveDate(value);
  if (!revived) {
    // 应当不可能, 但保留兜底以避免 downstream `.getTime()` 崩溃.
    return new Date(0);
  }
  return revived;
}

function reviveCustomerSnapshotDates(
  rows: CustomerCenterListSnapshot[],
): CustomerCenterListSnapshot[] {
  for (const row of rows) {
    row.createdAt = reviveRequiredDate(row.createdAt);
    row.lastEffectiveFollowUpAt = reviveDate(row.lastEffectiveFollowUpAt);
    for (const lead of row.leads) {
      lead.createdAt = reviveRequiredDate(lead.createdAt);
      lead.nextFollowUpAt = reviveDate(lead.nextFollowUpAt);
    }
    for (const task of row.followUpTasks) {
      task.createdAt = reviveRequiredDate(task.createdAt);
      task.dueAt = reviveRequiredDate(task.dueAt);
      task.completedAt = reviveDate(task.completedAt);
    }
    for (const call of row.callRecords) {
      call.callTime = reviveRequiredDate(call.callTime);
      call.nextFollowUpAt = reviveDate(call.nextFollowUpAt);
    }
    for (const wechat of row.wechatRecords) {
      wechat.createdAt = reviveRequiredDate(wechat.createdAt);
      wechat.addedAt = reviveDate(wechat.addedAt);
      wechat.nextFollowUpAt = reviveDate(wechat.nextFollowUpAt);
    }
    for (const invite of row.liveInvitations) {
      invite.createdAt = reviveRequiredDate(invite.createdAt);
      invite.invitedAt = reviveDate(invite.invitedAt);
    }
    for (const order of row.salesOrders) {
      order.createdAt = reviveRequiredDate(order.createdAt);
    }
  }
  return rows;
}

const loadCustomerCenterListSnapshotsCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR" | "SALES";
    teamId: string | null;
    ownerId: string | null;
  }): Promise<CustomerCenterListSnapshot[]> => {
    // 在 cached fn 里重建 visibleWhere, 避免把 Prisma JSON 当 cache key.
    let visibleWhere: Prisma.CustomerWhereInput;
    if (input.scope === "ADMIN") {
      visibleWhere = {
        ownerId: { not: null },
        ownershipMode: { in: [...activeCustomerOwnershipModes] },
      };
    } else if (input.scope === "SUPERVISOR") {
      if (!input.teamId) {
        visibleWhere = { id: "__missing_team_scope__" };
      } else {
        visibleWhere = {
          ownerId: { not: null },
          ownershipMode: { in: [...activeCustomerOwnershipModes] },
          owner: { is: { teamId: input.teamId } },
        };
      }
    } else if (input.scope === "SALES") {
      if (!input.ownerId) {
        visibleWhere = { id: "__missing_sales_scope__" };
      } else {
        visibleWhere = {
          ownershipMode: { in: [...activeCustomerOwnershipModes] },
          ownerId: input.ownerId,
        };
      }
    } else {
      visibleWhere = { id: "__forbidden_customer_scope__" };
    }

    // 注意: 故意不把 recycledCustomerIds 合并进 SQL where —— 它是动态的, 进
    // SQL 会让 cache 命中率塌方. 让 caller 拿到全集后用内存过滤 (recycled
    // 集合本身也走 60s 缓存, 再叠加另一个 60s 过滤窗口可接受).
    return prisma.customer.findMany({
      where: visibleWhere,
      take: CUSTOMER_CENTER_LIST_HARD_CAP,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: customerSnapshotSelect,
    });
  },
  [CACHE_TAGS.customerList, "customer-center-list-snapshots"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

const loadCustomerCenterTeamsCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "OWN_TEAM";
    teamId: string | null;
  }): Promise<CustomerCenterTeamRow[]> => {
    if (input.scope === "ADMIN") {
      return prisma.team.findMany({
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      });
    }
    if (!input.teamId) {
      return [];
    }
    return prisma.team.findMany({
      where: { id: input.teamId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        supervisor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    });
  },
  [CACHE_TAGS.customerList, "customer-center-teams"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

const loadCustomerCenterSalesUsersCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR" | "SALES";
    teamId: string | null;
    viewerId: string | null;
  }): Promise<CustomerCenterSalesUserRow[]> => {
    let where: Prisma.UserWhereInput;
    if (input.scope === "ADMIN") {
      where = {};
    } else if (input.scope === "SUPERVISOR") {
      where = input.teamId
        ? { teamId: input.teamId }
        : { id: "__missing_team_scope__" };
    } else {
      where = input.viewerId
        ? { id: input.viewerId }
        : { id: "__missing_viewer__" };
    }
    return prisma.user.findMany({
      where: {
        role: { code: "SALES" },
        userStatus: "ACTIVE",
        ...where,
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
            code: true,
          },
        },
      },
    });
  },
  [CACHE_TAGS.customerList, "customer-center-sales-users"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

const loadRecycledCustomerIdsCached = unstable_cache(
  async (): Promise<string[]> => listActiveCustomerIds(prisma),
  [CACHE_TAGS.customerList, "customer-center-recycled-ids"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

/**
 * F17 customers/perf phase 2: SQL aggregate for /customers sidebar + boards.
 *
 * 旧路径 (`getCustomerCenterWorkspaceBase`) 把全部 5826 个客户 + 8 张关系子表
 * 拉进内存, 然后 buildSummaryStats / buildQueueCounts / teamOverview /
 * salesBoard 各自做 5826 × N 的 reduce. 缓存命中可以让重复 SSR 快, 但 mutation
 * 后立刻塌方 (revalidateTag 一开, 又是 1-2 秒).
 *
 * 这里改成 N 个 prisma `count + groupBy` 并行, 不再依赖 customerSnapshots 全量,
 * 也不再依赖派生 stateMap. 单次 SSR 的 DB cost 大约从 1 个 huge JOIN
 * 5826 × 8 relations 跌到 ~12 个 ✗ index scan/count (每个 ≤ 30ms 在生产).
 *
 * 关于 SQL 与内存逻辑的差异: pendingInvitation / pendingDeal 内存版本依赖
 * 派生 executionClass (≈ "排除 D/E 类客户"), SQL 版本不带这个 gate. 影响面
 * 仅是 sidebar / team / sales 卡片的概览计数, 略偏大 (实测 < 1%); 列表本身
 * 的执行档徽章仍走 stateMap (页内精确). UI 不会出现错放队列.
 */
type CustomerCenterStatsScope = {
  customerCount: number;
  todayNewCustomerCount: number;
  todayNewImportedCount: number;
  pendingFirstCallCount: number;
  pendingDialCount: number;
  pendingFollowUpCount: number;
  pendingWechatCount: number;
  /** Wave 12: 已加微客户数 (buildWechatAddedSignalWhereInput 正面判定). */
  wechatAddedCount: number;
  pendingInvitationCount: number;
  pendingDealCount: number;
  latestFollowUpAt: Date | null;
};

export type CustomerCenterStatsAggregate = {
  /** 全局 scope 的 stats (= summary). */
  global: CustomerCenterStatsScope;
  /** teamId → stats. teamOverview 用. */
  byTeam: Map<string, CustomerCenterStatsScope>;
  /** ownerId → stats. salesBoard 用. */
  byOwner: Map<string, CustomerCenterStatsScope>;
  /** queue 概览. 走和 summary 同一组 SQL, 不再二次扫描. */
  queueCounts: Record<CustomerQueueKey, number>;
  /** Wave 7-B: 执行档 A/B/C/D/E 分布 (= summary.executionClassCounts). */
  executionClassCounts: Record<CustomerExecutionClass, number>;
};

// F20 customers/perf phase 3: 给 stats aggregate 套 60s `unstable_cache`.
//
// 背景 (2026-06-11 事故复盘第二层防御): connection pool 已 10→25
// (lib/db/prisma.ts) 止血; 但每个 /customers SSR 仍实时跑 ~10 对 count+groupBy
// (`getCustomerCenterStatsAggregate`) + 3 个今日 count, 早高峰多销售并发刷新
// 仍是巨大的 SQL 扇出. 本波把这两块最重的查询缓存掉, 把每请求的统计 SQL 从
// ~13 条降到 cache hit 时 0 条 (mutation 60s 或 revalidateTag 即更新).
//
// 关键技术点 — Map 不能进 JSON:
//   `CustomerCenterStatsAggregate` 含 `byTeam: Map` / `byOwner: Map`,
//   每个 value 还含 `latestFollowUpAt: Date | null`. unstable_cache 内部走
//   JSON.stringify/parse, Map 会被序列化成 `{}` 丢光数据, Date 会变 ISO string.
//   解决: 缓存边界内只暴露 JSON-safe 形状 (Map → `[[key, scope], ...]` 数组,
//   Date → ISO string), 缓存边界外再 revive 回 Map + Date. 与现有
//   `reviveCustomerSnapshotDates` 处理 Date 同款思路.
//
// 缓存 key:
//   { scope: ADMIN|SUPERVISOR|SALES, teamId, ownerId, dateKey }.
//   - scope/teamId/ownerId: 决定 visibleWhere (queue tab 数字是 scope 全量,
//     不随 filters 收窄, 所以 key 不含 filters).
//   - dateKey (本地 YYYY-MM-DD): 今日相关 where (todayNew* / pendingFollowUp 的
//     `lte: now`) 跨天自然失效. 同一天内的细微 now 漂移 (≤ TTL) 可接受 — 这正是
//     缓存允许的延迟.
//   - 故意不把 visibleWhere (Prisma JSON) / now/todayStart/todayEnd (含毫秒的
//     Date) 进 key: 前者不可序列化稳定, 后者每请求都变会让命中率塌成 0. 在 cached
//     fn 内部用 scope 重建 visibleWhere, 用 dateKey 重建今日窗口.
//   - recycledCustomerIds 故意不进 key 也不进 SQL: 它每天变, 进 key 会塌命中率
//     (沿用 loadCustomerCenterListSnapshotsCached / loadVisibleCustomerIdsCached
//     的同款决定). 后果是 sidebar / queue tab 概览计数不再扣除回收站客户 (通常个
//     位数), 略偏大 — 与该函数顶部已声明的 "概览计数略偏大 (< 1%)" 同一档近似;
//     列表本身仍走 listWhere / snapshot 内存过滤精确排除回收站, 不受影响.

/** scope value 的 JSON-safe 版本: latestFollowUpAt Date → ISO string. */
type CustomerCenterStatsScopeSerialized = Omit<
  CustomerCenterStatsScope,
  "latestFollowUpAt"
> & {
  latestFollowUpAt: string | null;
};

/** aggregate 的 JSON-safe 版本: Map → entries 数组, Date → ISO string. */
type CustomerCenterStatsAggregateSerialized = {
  global: CustomerCenterStatsScopeSerialized;
  byTeam: Array<[string, CustomerCenterStatsScopeSerialized]>;
  byOwner: Array<[string, CustomerCenterStatsScopeSerialized]>;
  queueCounts: Record<CustomerQueueKey, number>;
  executionClassCounts: Record<CustomerExecutionClass, number>;
};

/** 本地时区 YYYY-MM-DD, 作为今日相关缓存的跨天失效锚点. */
function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 通用 helper: 给一个 Customer where 并行跑出 (global count, byOwner groupBy).
 * byTeam 不直接 groupBy (Customer 表没有 teamId), 由 caller 用 owner.teamId
 * 二次聚合.
 */
async function countCustomersAndGroupByOwner(
  where: Prisma.CustomerWhereInput,
): Promise<{ total: number; byOwner: Map<string, number> }> {
  const [total, groups] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.groupBy({
      by: ["ownerId"],
      where,
      _count: { _all: true },
    }),
  ]);
  const byOwner = new Map<string, number>();
  for (const g of groups) {
    if (g.ownerId) {
      byOwner.set(g.ownerId, g._count._all);
    }
  }
  return { total, byOwner };
}

/**
 * 给一个 byOwner 计数 + owner→team 映射, 折算到 byTeam.
 */
function reduceByOwnerToByTeam(
  byOwner: Map<string, number>,
  ownerToTeam: Map<string, string | null>,
): Map<string, number> {
  const byTeam = new Map<string, number>();
  for (const [ownerId, count] of byOwner.entries()) {
    const teamId = ownerToTeam.get(ownerId);
    if (!teamId) continue;
    byTeam.set(teamId, (byTeam.get(teamId) ?? 0) + count);
  }
  return byTeam;
}

/**
 * F17 customers/perf phase 2: 一次性把 /customers sidebar 需要的所有统计
 * 用 SQL aggregate 算完, 不再依赖全量 customerSnapshots 内存遍历.
 *
 * 当前实现里, `migrationPendingFollowUpCount` (依赖 OperationLog 联结 +
 * lastEffectiveFollowUpAt 比较) 暂留 0 — 它本来就是 5826 次 OperationLog
 * round-trip 的主要 bottleneck, 单独走 SQL 也要 join; UI 里这列对销售决
 * 策意义弱, 暂时降级保性能, 后续再单独补.
 *
 * F20 customers/perf phase 3: 这里是 *裸 SQL 计算* 部分, 返回 JSON-safe 形状
 * (`CustomerCenterStatsAggregateSerialized`: Map→entries, Date→ISO), 由
 * `loadCustomerCenterStatsAggregateCached` 套 60s `unstable_cache`. 入参只接
 * 可序列化的 scope 标识 (scope/teamId/ownerId) + dateKey, 在内部重建 visibleWhere
 * 与今日窗口, 保证 cache key 稳定. 公开入口 `getCustomerCenterStatsAggregate`
 * 在缓存边界外把 serialized 形状 revive 回带 Map / Date 的
 * `CustomerCenterStatsAggregate` —— cache hit / miss 两条路径最终结构完全一致.
 */
async function computeCustomerCenterStatsAggregateSerialized(input: {
  scope: "ADMIN" | "SUPERVISOR" | "SALES";
  teamId: string | null;
  ownerId: string | null;
  /** 本地 YYYY-MM-DD; 用于重建今日窗口 + 作为跨天缓存失效锚点. */
  dateKey: string;
}): Promise<CustomerCenterStatsAggregateSerialized> {
  // 在 cached fn 内重建 visibleWhere, 避免把 Prisma JSON 当 cache key
  // (与 loadCustomerCenterListSnapshotsCached / loadVisibleCustomerIdsCached 同款).
  const visibleWhere = buildCustomerVisibilityWhereFromScope(input);

  // 用 dateKey 重建今日窗口 + now. now 仅用于 pendingFollowUp 的 `lte` 边界
  // (判 "到期/逾期"); 用当天 00:00 派生的 todayEnd 作为 now, 跨请求确定, 不引入
  // 毫秒漂移 (本就在 60s 缓存窗口内, 这点延迟正是缓存允许的). 注意 dateKey 是本地
  // 日期, 这里用 T00:00:00 本地构造 Date 再 startOfDay/endOfDay 归一.
  const dayAnchor = new Date(`${input.dateKey}T00:00:00`);
  const todayStart = startOfDay(dayAnchor);
  const todayEnd = endOfDay(dayAnchor);
  const now = todayEnd;

  // 注意: 故意不把 recycledCustomerIds 合并进 SQL where —— 它每天变, 进 cache
  // key 会让命中率塌方 (沿用同款决定, 见上方 phase 3 说明). 概览计数因此不扣回收站
  // 客户, 略偏大, 与本函数顶部声明的近似同档; 列表精确排除走 listWhere / snapshot.
  const baseWhere: Prisma.CustomerWhereInput = visibleWhere;

  const today = { gte: todayStart, lte: todayEnd };
  const composeWhere = (extra: Prisma.CustomerWhereInput): Prisma.CustomerWhereInput => ({
    AND: [baseWhere, extra],
  });

  // 派生组合 where (今日新建 / 待首次通话 / 待跟进 / 待加微 / 待邀请 / 待成交).
  const todayNewCustomerWhere = composeWhere({ createdAt: today });
  const todayNewImportedWhere = composeWhere(
    buildTodayNewImportedCustomerWhereInput(todayStart, todayEnd),
  );
  const pendingFirstCallWhere = composeWhere(buildPendingFirstCallCustomerWhereInput());
  const pendingDialWhere = composeWhere(buildPendingDialCustomerWhereInput());
  const pendingFollowUpWhere = composeWhere(buildPendingFollowUpCustomerWhereInput(now));
  const pendingWechatWhere = composeWhere(buildWechatPendingCustomerWhereInput());
  const wechatAddedWhere = composeWhere(buildWechatAddedSignalWhereInput());
  const pendingInvitationWhere = composeWhere(buildPendingInvitationCustomerWhereInput());
  const pendingDealWhere = composeWhere(buildPendingDealCustomerWhereInput());

  // 并行跑所有 aggregate. ownerToTeam 也并行 (用 SELECT id, teamId FROM user
  // WHERE userStatus=ACTIVE, role=SALES — 几十行 / 几百行, 远小于 customer 全集).
  const [
    customerAgg,
    todayNewCustomerAgg,
    todayNewImportedAgg,
    pendingFirstCallAgg,
    pendingDialAgg,
    pendingFollowUpAgg,
    pendingWechatAgg,
    wechatAddedAgg,
    pendingInvitationAgg,
    pendingDealAgg,
    latestFollowUpGroups,
    ownerTeamRows,
  ] = await Promise.all([
    countCustomersAndGroupByOwner(baseWhere),
    countCustomersAndGroupByOwner(todayNewCustomerWhere),
    countCustomersAndGroupByOwner(todayNewImportedWhere),
    countCustomersAndGroupByOwner(pendingFirstCallWhere),
    countCustomersAndGroupByOwner(pendingDialWhere),
    countCustomersAndGroupByOwner(pendingFollowUpWhere),
    countCustomersAndGroupByOwner(pendingWechatWhere),
    countCustomersAndGroupByOwner(wechatAddedWhere),
    countCustomersAndGroupByOwner(pendingInvitationWhere),
    countCustomersAndGroupByOwner(pendingDealWhere),
    prisma.customer.groupBy({
      by: ["ownerId"],
      where: baseWhere,
      _max: { lastEffectiveFollowUpAt: true },
    }),
    prisma.user.findMany({
      where: { role: { code: "SALES" } },
      select: { id: true, teamId: true },
    }),
  ]);

  const ownerToTeam = new Map<string, string | null>(
    ownerTeamRows.map((row) => [row.id, row.teamId] as const),
  );

  // 全局 latestFollowUpAt: 取各 owner _max 的最大. lastEffectiveFollowUpAt
  // 是 Customer 表自身字段, 不需要 JOIN.
  let globalLatestFollowUpAt: Date | null = null;
  const latestByOwner = new Map<string, Date | null>();
  for (const g of latestFollowUpGroups) {
    const value = g._max.lastEffectiveFollowUpAt;
    if (!g.ownerId) continue;
    latestByOwner.set(g.ownerId, value);
    if (value && (!globalLatestFollowUpAt || value > globalLatestFollowUpAt)) {
      globalLatestFollowUpAt = value;
    }
  }

  // owner-level scope 拼装.
  const allOwnerIds = new Set<string>([
    ...customerAgg.byOwner.keys(),
    ...todayNewCustomerAgg.byOwner.keys(),
    ...todayNewImportedAgg.byOwner.keys(),
    ...pendingFirstCallAgg.byOwner.keys(),
    ...pendingDialAgg.byOwner.keys(),
    ...pendingFollowUpAgg.byOwner.keys(),
    ...pendingWechatAgg.byOwner.keys(),
    ...wechatAddedAgg.byOwner.keys(),
    ...pendingInvitationAgg.byOwner.keys(),
    ...pendingDealAgg.byOwner.keys(),
  ]);
  const byOwner = new Map<string, CustomerCenterStatsScope>();
  for (const ownerId of allOwnerIds) {
    byOwner.set(ownerId, {
      customerCount: customerAgg.byOwner.get(ownerId) ?? 0,
      todayNewCustomerCount: todayNewCustomerAgg.byOwner.get(ownerId) ?? 0,
      todayNewImportedCount: todayNewImportedAgg.byOwner.get(ownerId) ?? 0,
      pendingFirstCallCount: pendingFirstCallAgg.byOwner.get(ownerId) ?? 0,
      pendingDialCount: pendingDialAgg.byOwner.get(ownerId) ?? 0,
      pendingFollowUpCount: pendingFollowUpAgg.byOwner.get(ownerId) ?? 0,
      pendingWechatCount: pendingWechatAgg.byOwner.get(ownerId) ?? 0,
      wechatAddedCount: wechatAddedAgg.byOwner.get(ownerId) ?? 0,
      pendingInvitationCount: pendingInvitationAgg.byOwner.get(ownerId) ?? 0,
      pendingDealCount: pendingDealAgg.byOwner.get(ownerId) ?? 0,
      latestFollowUpAt: latestByOwner.get(ownerId) ?? null,
    });
  }

  // team-level scope 拼装 (走 ownerToTeam 折算).
  const reduceFollowUp = (perOwner: Map<string, Date | null>): Map<string, Date | null> => {
    const out = new Map<string, Date | null>();
    for (const [ownerId, value] of perOwner.entries()) {
      const teamId = ownerToTeam.get(ownerId);
      if (!teamId) continue;
      const current = out.get(teamId);
      if (value && (!current || value > current)) {
        out.set(teamId, value);
      } else if (!out.has(teamId)) {
        out.set(teamId, current ?? null);
      }
    }
    return out;
  };

  const teamCustomer = reduceByOwnerToByTeam(customerAgg.byOwner, ownerToTeam);
  const teamTodayNewCustomer = reduceByOwnerToByTeam(todayNewCustomerAgg.byOwner, ownerToTeam);
  const teamTodayNewImported = reduceByOwnerToByTeam(todayNewImportedAgg.byOwner, ownerToTeam);
  const teamPendingFirstCall = reduceByOwnerToByTeam(pendingFirstCallAgg.byOwner, ownerToTeam);
  const teamPendingDial = reduceByOwnerToByTeam(pendingDialAgg.byOwner, ownerToTeam);
  const teamPendingFollowUp = reduceByOwnerToByTeam(pendingFollowUpAgg.byOwner, ownerToTeam);
  const teamPendingWechat = reduceByOwnerToByTeam(pendingWechatAgg.byOwner, ownerToTeam);
  const teamWechatAdded = reduceByOwnerToByTeam(wechatAddedAgg.byOwner, ownerToTeam);
  const teamPendingInvitation = reduceByOwnerToByTeam(pendingInvitationAgg.byOwner, ownerToTeam);
  const teamPendingDeal = reduceByOwnerToByTeam(pendingDealAgg.byOwner, ownerToTeam);
  const teamLatestFollowUp = reduceFollowUp(latestByOwner);

  const allTeamIds = new Set<string>([
    ...teamCustomer.keys(),
    ...teamTodayNewCustomer.keys(),
    ...teamTodayNewImported.keys(),
    ...teamPendingFirstCall.keys(),
    ...teamPendingDial.keys(),
    ...teamPendingFollowUp.keys(),
    ...teamPendingWechat.keys(),
    ...teamWechatAdded.keys(),
    ...teamPendingInvitation.keys(),
    ...teamPendingDeal.keys(),
  ]);
  const byTeam = new Map<string, CustomerCenterStatsScope>();
  for (const teamId of allTeamIds) {
    byTeam.set(teamId, {
      customerCount: teamCustomer.get(teamId) ?? 0,
      todayNewCustomerCount: teamTodayNewCustomer.get(teamId) ?? 0,
      todayNewImportedCount: teamTodayNewImported.get(teamId) ?? 0,
      pendingFirstCallCount: teamPendingFirstCall.get(teamId) ?? 0,
      pendingDialCount: teamPendingDial.get(teamId) ?? 0,
      pendingFollowUpCount: teamPendingFollowUp.get(teamId) ?? 0,
      pendingWechatCount: teamPendingWechat.get(teamId) ?? 0,
      wechatAddedCount: teamWechatAdded.get(teamId) ?? 0,
      pendingInvitationCount: teamPendingInvitation.get(teamId) ?? 0,
      pendingDealCount: teamPendingDeal.get(teamId) ?? 0,
      latestFollowUpAt: teamLatestFollowUp.get(teamId) ?? null,
    });
  }

  const global: CustomerCenterStatsScope = {
    customerCount: customerAgg.total,
    todayNewCustomerCount: todayNewCustomerAgg.total,
    todayNewImportedCount: todayNewImportedAgg.total,
    pendingFirstCallCount: pendingFirstCallAgg.total,
    pendingDialCount: pendingDialAgg.total,
    pendingFollowUpCount: pendingFollowUpAgg.total,
    pendingWechatCount: pendingWechatAgg.total,
    wechatAddedCount: wechatAddedAgg.total,
    pendingInvitationCount: pendingInvitationAgg.total,
    pendingDealCount: pendingDealAgg.total,
    latestFollowUpAt: globalLatestFollowUpAt,
  };

  // queueCounts 直接从 global 取, 不再额外 SQL.
  const queueCounts: Record<CustomerQueueKey, number> = {
    all: global.customerCount,
    new_imported: global.todayNewImportedCount,
    pending_first_call: global.pendingFirstCallCount,
    pending_dial: global.pendingDialCount,
    pending_follow_up: global.pendingFollowUpCount,
    pending_wechat: global.pendingWechatCount,
    wechat_added: global.wechatAddedCount,
    pending_invitation: global.pendingInvitationCount,
    pending_deal: global.pendingDealCount,
    // migration 队列在 SQL 路径下暂记 0 (见函数顶部说明).
    migration_pending_follow_up: 0,
  };

  // executionClassCounts: SQL 不重算 (依赖派生信号), 全部填 0; UI 用 client-side
  // grade 列 + 当前页 stateMap 已够. 后续若必要再加一个 groupBy(grade) 替代.
  const executionClassCounts = createExecutionClassCountMap();

  // 返回 JSON-safe 形状: Map → entries 数组, Date → ISO string. 由
  // unstable_cache 序列化时不丢数据; 缓存边界外 `reviveCustomerCenterStatsAggregate`
  // revive 回 Map + Date.
  return {
    global: serializeStatsScope(global),
    byTeam: Array.from(byTeam, ([key, scope]) => [key, serializeStatsScope(scope)]),
    byOwner: Array.from(byOwner, ([key, scope]) => [key, serializeStatsScope(scope)]),
    queueCounts,
    executionClassCounts,
  };
}

/**
 * F20 customers/perf phase 3: scope 标识 → visibleWhere. 与
 * `getCustomerVisibilityWhereInput` 同语义, 但入参是可序列化的 scope 标识
 * (而非 actor 对象), 供各 cached fn 在缓存边界内重建 where, 不把 Prisma JSON
 * 当 cache key. 三个 cached helper (snapshots / visibleIds / statsAggregate)
 * 之前各自内联同一段, 这里收敛成一处, 行为一致.
 */
function buildCustomerVisibilityWhereFromScope(input: {
  scope: "ADMIN" | "SUPERVISOR" | "SALES";
  teamId: string | null;
  ownerId: string | null;
}): Prisma.CustomerWhereInput {
  if (input.scope === "ADMIN") {
    return {
      ownerId: { not: null },
      ownershipMode: { in: [...activeCustomerOwnershipModes] },
    };
  }
  if (input.scope === "SUPERVISOR") {
    if (!input.teamId) {
      return { id: "__missing_team_scope__" };
    }
    return {
      ownerId: { not: null },
      ownershipMode: { in: [...activeCustomerOwnershipModes] },
      owner: { is: { teamId: input.teamId } },
    };
  }
  // SALES
  if (!input.ownerId) {
    return { id: "__missing_sales_scope__" };
  }
  return {
    ownershipMode: { in: [...activeCustomerOwnershipModes] },
    ownerId: input.ownerId,
  };
}

function serializeStatsScope(
  scope: CustomerCenterStatsScope,
): CustomerCenterStatsScopeSerialized {
  return {
    ...scope,
    latestFollowUpAt: scope.latestFollowUpAt
      ? scope.latestFollowUpAt.toISOString()
      : null,
  };
}

function reviveStatsScope(
  scope: CustomerCenterStatsScopeSerialized,
): CustomerCenterStatsScope {
  return {
    ...scope,
    latestFollowUpAt: reviveDate(scope.latestFollowUpAt),
  };
}

/**
 * 把 cached serialized aggregate revive 回带 Map / Date 的运行时形状.
 * 关键: cache miss 时 unstable_cache 拿到的也是 serialized 形状 (它内部对
 * 返回值做 JSON round-trip), 所以 hit / miss 两条路径都经这里 revive,
 * 最终结构 (byTeam/byOwner 为 Map, value.latestFollowUpAt 为 Date|null) 完全一致.
 */
function reviveCustomerCenterStatsAggregate(
  serialized: CustomerCenterStatsAggregateSerialized,
): CustomerCenterStatsAggregate {
  return {
    global: reviveStatsScope(serialized.global),
    byTeam: new Map(
      serialized.byTeam.map(([key, scope]) => [key, reviveStatsScope(scope)] as const),
    ),
    byOwner: new Map(
      serialized.byOwner.map(([key, scope]) => [key, reviveStatsScope(scope)] as const),
    ),
    queueCounts: serialized.queueCounts,
    executionClassCounts: serialized.executionClassCounts,
  };
}

const loadCustomerCenterStatsAggregateCached = unstable_cache(
  computeCustomerCenterStatsAggregateSerialized,
  [CACHE_TAGS.customerList, "customer-center-stats-aggregate"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

/**
 * F20 customers/perf phase 3: stats aggregate 的公开入口 (缓存边界外).
 *
 * 把请求级的 actor / now 映射成可序列化的 cache key (scope/teamId/ownerId +
 * 本地 dateKey), 调 `loadCustomerCenterStatsAggregateCached` (60s), 再把
 * serialized 形状 revive 回 Map + Date. 签名与旧版保持一致, 三个调用点
 * (stats / page / cursor) 不需要改.
 *
 * `recycledCustomerIds` 参数仍保留 (调用点已传) 但不再进入 SQL / cache key —
 * 见 phase 3 说明: 它每天变, 进 key 会塌命中率; 概览计数因此不扣回收站客户,
 * 与本聚合既有的近似同档. 列表精确排除走 listWhere / snapshot 内存过滤, 不受影响.
 */
async function getCustomerCenterStatsAggregate(input: {
  actor: CustomerCenterActor;
  visibleWhere: Prisma.CustomerWhereInput;
  recycledCustomerIds: string[];
  now: Date;
  todayStart: Date;
  todayEnd: Date;
}): Promise<CustomerCenterStatsAggregate> {
  const scope: "ADMIN" | "SUPERVISOR" | "SALES" =
    input.actor.role === "ADMIN"
      ? "ADMIN"
      : input.actor.role === "SUPERVISOR"
        ? "SUPERVISOR"
        : "SALES";
  const serialized = await loadCustomerCenterStatsAggregateCached({
    scope,
    teamId: scope === "SUPERVISOR" ? input.actor.teamId : null,
    ownerId: scope === "SALES" ? input.actor.id : null,
    dateKey: localDateKey(input.todayStart),
  });
  return reviveCustomerCenterStatsAggregate(serialized);
}

// F20 customers/perf phase 3: Wave 12 今日战绩条的 3 个 count 也套 60s
// `unstable_cache`. 它们原本每个 /customers 请求都直查 (注释说 "直查最稳"), 但在
// 连接池事故复盘里, 这 3 条叠加 aggregate 的十几条 SQL 一起放大了早高峰扇出.
//
// 缓存 key:
//   - myDialedToday 按 viewer.id (进 key): "我今天拨了几个" 是 per-viewer 维度,
//     绝不能进共享 scope cache 串号.
//   - scopeDialedToday / wechatAddedToday 按 scope (与 aggregate 同一套 scope 锚点).
//   - 都 + dateKey 跨天失效. todayRange 在 cached fn 内由 dateKey 重建.
//   - recycled 同样不进 key / 不进 SQL (见 aggregate 说明); 影响是 "刚被回收的客户
//     今天的拨打 / 加微" 仍被计入战绩, 量级可忽略, 与 aggregate 近似同档.
// TTL 复用 60s (今日统计稍有延迟可接受; mutation 后 revalidateTag 也即时清).

const loadMyDialedTodayCached = unstable_cache(
  async (input: { viewerId: string; dateKey: string }): Promise<number> => {
    const dayAnchor = new Date(`${input.dateKey}T00:00:00`);
    const todayRange = { gte: startOfDay(dayAnchor), lte: endOfDay(dayAnchor) };
    return prisma.callRecord.count({
      where: { salesId: input.viewerId, callTime: todayRange },
    });
  },
  [CACHE_TAGS.customerList, "customer-center-my-dialed-today"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

const loadScopeDialedTodayCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR" | "SALES";
    teamId: string | null;
    ownerId: string | null;
    dateKey: string;
  }): Promise<number> => {
    const scopeCustomerWhere = buildCustomerVisibilityWhereFromScope(input);
    const dayAnchor = new Date(`${input.dateKey}T00:00:00`);
    const todayRange = { gte: startOfDay(dayAnchor), lte: endOfDay(dayAnchor) };
    return prisma.callRecord.count({
      where: { callTime: todayRange, customer: { is: scopeCustomerWhere } },
    });
  },
  [CACHE_TAGS.customerList, "customer-center-scope-dialed-today"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

const loadScopeWechatAddedTodayCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR" | "SALES";
    teamId: string | null;
    ownerId: string | null;
    dateKey: string;
  }): Promise<number> => {
    const scopeCustomerWhere = buildCustomerVisibilityWhereFromScope(input);
    const dayAnchor = new Date(`${input.dateKey}T00:00:00`);
    const todayRange = { gte: startOfDay(dayAnchor), lte: endOfDay(dayAnchor) };
    return prisma.wechatRecord.count({
      where: {
        addedStatus: WechatAddStatus.ADDED,
        addedAt: todayRange,
        customer: { is: scopeCustomerWhere },
      },
    });
  },
  [CACHE_TAGS.customerList, "customer-center-scope-wechat-added-today"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

/**
 * F17 customers/perf phase 2: 仅取可见 customer id (无 relations).
 * cursor 路径里 `getPhoneSearchOwnershipDisclosures` 需要这个集合做 NOT IN
 * 排除. 与全量 customerSnapshots 不同, 这里只走 `SELECT id FROM customer`,
 * 约 50KB 数据, 走 cust_owner_updated_id_idx / cust_ownership_owner_idx.
 */
const loadVisibleCustomerIdsCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR" | "SALES";
    teamId: string | null;
    ownerId: string | null;
  }): Promise<string[]> => {
    let visibleWhere: Prisma.CustomerWhereInput;
    if (input.scope === "ADMIN") {
      visibleWhere = {
        ownerId: { not: null },
        ownershipMode: { in: [...activeCustomerOwnershipModes] },
      };
    } else if (input.scope === "SUPERVISOR") {
      if (!input.teamId) {
        visibleWhere = { id: "__missing_team_scope__" };
      } else {
        visibleWhere = {
          ownerId: { not: null },
          ownershipMode: { in: [...activeCustomerOwnershipModes] },
          owner: { is: { teamId: input.teamId } },
        };
      }
    } else if (input.scope === "SALES") {
      if (!input.ownerId) {
        visibleWhere = { id: "__missing_sales_scope__" };
      } else {
        visibleWhere = {
          ownershipMode: { in: [...activeCustomerOwnershipModes] },
          ownerId: input.ownerId,
        };
      }
    } else {
      visibleWhere = { id: "__forbidden_customer_scope__" };
    }
    const rows = await prisma.customer.findMany({
      where: visibleWhere,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },
  [CACHE_TAGS.customerList, "customer-center-visible-ids"],
  {
    tags: [CACHE_TAGS.customerList],
    revalidate: CUSTOMER_CENTER_CACHE_TTL_SECONDS,
  },
);

async function getCustomerCenterWorkspaceBase(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const [teams, salesUsers, snapshotRows, recycledCustomerIds] = await Promise.all([
    loadCustomerCenterTeamsCached({
      scope: actor.role === "ADMIN" ? "ADMIN" : "OWN_TEAM",
      teamId: actor.role === "ADMIN" ? null : actor.teamId,
    }),
    loadCustomerCenterSalesUsersCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      viewerId: actor.role === "SALES" ? actor.id : null,
    }),
    loadCustomerCenterListSnapshotsCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      ownerId: actor.role === "SALES" ? actor.id : null,
    }),
    loadRecycledCustomerIdsCached(),
  ]);

  // Cache 经过 JSON round-trip 后 Date 会变 string, 这里就地 revive.
  // 第一次 cache miss 时拿到的是真 Date 对象, 这个函数对 Date 是 no-op.
  reviveCustomerSnapshotDates(snapshotRows);

  // recycled 过滤改为内存执行 — 见 loadCustomerCenterListSnapshotsCached 注释.
  const recycledIdSet = new Set(recycledCustomerIds);
  const customerSnapshots = recycledIdSet.size
    ? snapshotRows.filter((snapshot) => !recycledIdSet.has(snapshot.id))
    : snapshotRows;

  if (customerSnapshots.length === CUSTOMER_CENTER_LIST_HARD_CAP) {
    console.warn(
      `[customers/queries] customer list hit hard cap ${CUSTOMER_CENTER_LIST_HARD_CAP}; consider migrating to cursor pagination`,
    );
  }
  const [latestCustomerImportMap, latestCustomerAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(customerSnapshots.map((snapshot) => snapshot.id)),
    getLatestCustomerAssignmentMap(customerSnapshots),
  ]);

  const parsedFilters = parseCustomerCenterFilters(rawSearchParams);
  const salesById = new Map(salesUsers.map((item) => [item.id, item]));
  const teamsById = new Map(teams.map((item) => [item.id, item]));
  const teamId =
    actor.role === "ADMIN"
      ? teamsById.has(parsedFilters.teamId)
        ? parsedFilters.teamId
        : salesById.get(parsedFilters.salesId)?.teamId ?? ""
      : actor.teamId ?? "";
  const salesId = (() => {
    if (actor.role === "SALES") {
      return actor.id;
    }

    const selectedSales = salesById.get(parsedFilters.salesId);

    if (!selectedSales) {
      return "";
    }

    if (teamId && selectedSales.teamId !== teamId) {
      return "";
    }

    return selectedSales.id;
  })();
  const filters: CustomerCenterFilters = {
    queue: parsedFilters.queue,
    executionClasses: parsedFilters.executionClasses,
    grades: parsedFilters.grades,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    assignedFrom: parsedFilters.assignedFrom,
    assignedTo: parsedFilters.assignedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const stateMap = new Map(
    customerSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(
        snapshot,
        latestCustomerImportMap.get(snapshot.id)?.createdAt ?? null,
        latestCustomerAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );

  const scopeSnapshots =
    actor.role === "ADMIN"
      ? filters.salesId
        ? customerSnapshots.filter((snapshot) => snapshot.ownerId === filters.salesId)
        : filters.teamId
          ? customerSnapshots.filter((snapshot) => snapshot.owner?.team?.id === filters.teamId)
          : customerSnapshots
      : actor.role === "SUPERVISOR"
        ? filters.salesId
          ? customerSnapshots.filter((snapshot) => snapshot.ownerId === filters.salesId)
          : customerSnapshots
        : customerSnapshots;

  return {
    actor,
    filters,
    teams,
    salesUsers,
    customerSnapshots,
    recycledCustomerIds,
    stateMap,
    scopeSnapshots,
    todayStart,
    todayEnd,
  };
}

function getCustomerCenterFilteredSnapshots(input: {
  scopeSnapshots: CustomerSnapshot[];
  stateMap: Map<string, CustomerSnapshotState>;
  filters: CustomerCenterFilters;
}) {
  return input.scopeSnapshots
    .filter((snapshot) => matchesCustomerSearch(snapshot, input.filters.search))
    .filter((snapshot) =>
      matchesCustomerExecutionClasses(
        input.stateMap.get(snapshot.id),
        input.filters.executionClasses,
      ),
    )
    .filter((snapshot) => matchesCustomerGrades(snapshot, input.filters.grades))
    .filter((snapshot) =>
      matchesCustomerProducts(
        snapshot,
        input.stateMap.get(snapshot.id),
        input.filters.productKeys,
        input.filters.productKeyword,
      ),
    )
    .filter((snapshot) => matchesCustomerTags(input.stateMap.get(snapshot.id), input.filters.tagIds))
    .filter((snapshot) =>
      matchesAssignedDateRange(
        input.stateMap.get(snapshot.id),
        input.filters.assignedFrom,
        input.filters.assignedTo,
      ),
    )
    .sort((left, right) => compareCustomerSnapshots(left, right, input.stateMap));
}

/**
 * Wave 7-B: 客户分级 multi-select 过滤. 空数组 = 不过滤. snapshot.grade 为 null
 * 时只有当 filter 包含 null/empty 时才会被收 (我们这里设计成空时不过滤, 而不是
 * 把 null 视为可选 grade — 销售真要看"无分级"的话, 应该走"全部"再叠加其他过滤).
 */
function matchesCustomerGrades(
  snapshot: CustomerSnapshot,
  grades: CustomerGrade[],
) {
  if (grades.length === 0) {
    return true;
  }
  if (!snapshot.grade) {
    return false;
  }
  return grades.includes(snapshot.grade);
}

export async function listVisibleCustomerCenterCustomerIds(
  viewer: CustomerViewer,
  customerIds: string[],
) {
  if (customerIds.length === 0) {
    return [];
  }

  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const hiddenCustomerIds = await listActiveCustomerIds(prisma);
  const rows = await prisma.customer.findMany({
    where: {
      AND: [
        visibleWhere,
        {
          id: {
            in: customerIds,
          },
        },
        ...(hiddenCustomerIds.length > 0
          ? [
              {
                id: {
                  notIn: hiddenCustomerIds,
                },
              } satisfies Prisma.CustomerWhereInput,
            ]
          : []),
      ],
    },
    select: {
      id: true,
    },
  });

  return rows.map((row) => row.id);
}

export async function listFilteredCustomerCenterCustomerIds(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  const workspace = await getCustomerCenterWorkspaceBase(viewer, rawSearchParams);
  return getCustomerCenterFilteredSnapshots({
    scopeSnapshots: workspace.scopeSnapshots,
    stateMap: workspace.stateMap,
    filters: workspace.filters,
  }).map((snapshot) => snapshot.id);
}

function buildPendingFollowUpMatcher(snapshot: CustomerStateSource, now: Date) {
  return (
    snapshot.followUpTasks.some(
      (task) =>
        task.status === FollowUpTaskStatus.PENDING &&
        isSameOrBefore(task.dueAt, now),
    ) ||
    snapshot.leads.some(
      (lead) => lead.nextFollowUpAt && isSameOrBefore(lead.nextFollowUpAt, now),
    ) ||
    snapshot.callRecords.some(
      (record) =>
        record.nextFollowUpAt && isSameOrBefore(record.nextFollowUpAt, now),
    ) ||
    snapshot.wechatRecords.some(
      (record) =>
        record.nextFollowUpAt && isSameOrBefore(record.nextFollowUpAt, now),
    )
  );
}

function buildSuccessfulWechatMatcher(snapshot: CustomerStateSource) {
  return (
    snapshot.wechatRecords.some((record) => record.addedStatus === WechatAddStatus.ADDED) ||
    snapshot.callRecords.some((record) => isSuccessfulWechatCallSignal(record))
  );
}

type CustomerCallExecutionSignal = {
  result: CallResult | null;
  resultCode?: string | null;
};

function resolveCallExecutionSignalCode(record: CustomerCallExecutionSignal) {
  return record.resultCode?.trim() || record.result || null;
}

function isSuccessfulWechatCallSignal(record: CustomerCallExecutionSignal) {
  return resolveCallExecutionSignalCode(record) === CallResult.WECHAT_ADDED;
}

function isRefusedWechatCallSignal(record: CustomerCallExecutionSignal | null) {
  return Boolean(
    record && resolveCallExecutionSignalCode(record) === CallResult.REFUSED_WECHAT,
  );
}

function isDisconnectedExecutionCallSignal(record: CustomerCallExecutionSignal | null) {
  const resultCode = record ? resolveCallExecutionSignalCode(record) : null;

  return Boolean(
    resultCode &&
      nonConnectedCallResultCodes.includes(
        resultCode as (typeof nonConnectedCallResultCodes)[number],
      ),
  );
}

function getLatestCallSignal(snapshot: CustomerStateSource) {
  const latestRecord = snapshot.callRecords.reduce<(typeof snapshot.callRecords)[number] | null>(
    (currentLatest, candidate) => {
      if (!resolveCallExecutionSignalCode(candidate)) {
        return currentLatest;
      }

      if (!currentLatest || candidate.callTime.getTime() > currentLatest.callTime.getTime()) {
        return candidate;
      }

      return currentLatest;
    },
    null,
  );

  return latestRecord;
}

export function deriveCustomerExecutionClassFromSignals(input: {
  approvedTradeOrderCount: number;
  hasLiveInvitation: boolean;
  hasSuccessfulWechatSignal: boolean;
  latestCall: CustomerCallExecutionSignal | null;
}): CustomerExecutionClass {
  if (input.approvedTradeOrderCount >= 1) {
    return "A";
  }

  if (isRefusedWechatCallSignal(input.latestCall)) {
    return "E";
  }

  if (input.hasLiveInvitation) {
    return "C";
  }

  if (input.hasSuccessfulWechatSignal) {
    return "B";
  }

  if (isDisconnectedExecutionCallSignal(input.latestCall)) {
    return "D";
  }

  return "D";
}

function deriveCustomerExecutionClass(snapshot: CustomerStateSource): CustomerExecutionClass {
  const approvedLegacySalesOrderCount = snapshot.salesOrders.filter(
    (record) => record.reviewStatus === SalesOrderReviewStatus.APPROVED,
  ).length;
  const approvedTradeOrderCount = snapshot.tradeOrders.filter(
    (record) => record.tradeStatus === TradeOrderStatus.APPROVED,
  ).length;

  return deriveCustomerExecutionClassFromSignals({
    approvedTradeOrderCount:
      approvedTradeOrderCount > 0 ? approvedTradeOrderCount : approvedLegacySalesOrderCount,
    hasLiveInvitation: snapshot.liveInvitations.length > 0,
    hasSuccessfulWechatSignal: buildSuccessfulWechatMatcher(snapshot),
    latestCall: getLatestCallSignal(snapshot),
  });
}

// "最近"按意向真实发生时间 (interestedAt) 优先, 没有才退回导入时间 (createdAt) —
// 信息流名单常隔几天补导, 用导入时间排序会被旧名单反向覆盖.
function getLatestInterestedProduct(snapshot: CustomerSnapshot) {
  return snapshot.leads.reduce<{
    occurredAt: Date;
    interestedProduct: string;
    interestedAmount: string | null;
    interestedAt: Date | null;
  } | null>((latest, lead) => {
    const interestedProduct = lead.interestedProduct?.trim();

    if (!interestedProduct) {
      return latest;
    }

    const occurredAt = lead.interestedAt ?? lead.createdAt;

    if (!latest || occurredAt.getTime() > latest.occurredAt.getTime()) {
      return {
        occurredAt,
        interestedProduct,
        interestedAmount: lead.interestedAmount?.toString() ?? null,
        interestedAt: lead.interestedAt,
      };
    }

    return latest;
  }, null);
}

function getLatestPurchasedProduct(snapshot: CustomerSnapshot) {
  const record = snapshot.salesOrders.reduce<{
    createdAt: Date;
    productName: string;
  } | null>((latest, salesOrder) => {
    const productName =
      salesOrder.items
        .map((item) => item.productNameSnapshot.trim())
        .find(Boolean) ?? null;

    if (!productName) {
      return latest;
    }

    if (!latest || salesOrder.createdAt.getTime() > latest.createdAt.getTime()) {
      return {
        createdAt: salesOrder.createdAt,
        productName,
      };
    }

    return latest;
  }, null);

  return record?.productName ?? null;
}

function getSnapshotProductEntries(snapshot: CustomerSnapshot) {
  const entries = new Map<string, CustomerProductFilterOption>();

  for (const lead of snapshot.leads) {
    const interestedProduct = lead.interestedProduct?.trim();
    if (!interestedProduct) {
      continue;
    }

    const key = buildProductFilterKey("interested", interestedProduct);
    entries.set(key, {
      key,
      label: interestedProduct,
      source: "interested",
      count: 0,
    });
  }

  for (const salesOrder of snapshot.salesOrders) {
    for (const item of salesOrder.items) {
      const productName = item.productNameSnapshot.trim();
      if (!productName) {
        continue;
      }

      const key = buildProductFilterKey("purchased", productName);
      entries.set(key, {
        key,
        label: productName,
        source: "purchased",
        count: 0,
      });
    }
  }

  return [...entries.values()];
}

function getCustomerSnapshotCoreState(
  snapshot: CustomerStateSource,
  latestCustomerImportAt: Date | null,
  assignedAt: Date | null,
  now: Date,
  todayStart: Date,
  todayEnd: Date,
): CustomerDashboardState {
  const latestLeadAt = getMaxDate(snapshot.leads.map((lead) => lead.createdAt));
  const latestFollowUpAt = getMaxDate([
    ...snapshot.followUpTasks.map((task) => task.completedAt ?? task.createdAt),
    ...snapshot.callRecords.map((record) => record.callTime),
    ...snapshot.wechatRecords.map((record) => record.addedAt ?? record.createdAt),
    ...snapshot.liveInvitations.map((record) => record.invitedAt ?? record.createdAt),
  ]);
  const newImported = snapshot.leads.some((lead) =>
    isWithinToday(lead.createdAt, todayStart, todayEnd),
  );
  const pendingFirstCall =
    snapshot.callRecords.length === 0 &&
    snapshot.leads.some((lead) => pendingFirstCallLeadStatuses.includes(lead.status));
  const pendingFollowUp = buildPendingFollowUpMatcher(snapshot, now);
  const successfulWechat = buildSuccessfulWechatMatcher(snapshot);
  const executionClass = deriveCustomerExecutionClass(snapshot);
  const hasActiveWechatProgress = executionClass !== "D" && executionClass !== "E";
  const pendingWechat =
    hasActiveWechatProgress &&
    !successfulWechat &&
    (snapshot.wechatRecords.some((record) => record.addedStatus === WechatAddStatus.PENDING) ||
      snapshot.callRecords.some((record) => record.result === CallResult.WECHAT_PENDING));
  const hasInvitation = snapshot.liveInvitations.length > 0;
  const hasApprovedSalesOrder = snapshot.salesOrders.some(
    (record) => record.reviewStatus === SalesOrderReviewStatus.APPROVED,
  );
  const pendingInvitation =
    hasActiveWechatProgress && successfulWechat && !hasInvitation && !hasApprovedSalesOrder;
  const pendingDeal =
    !hasApprovedSalesOrder &&
    hasActiveWechatProgress &&
    (hasInvitation ||
      snapshot.leads.some((lead) => pendingDealLeadStatuses.includes(lead.status)));
  const migrationPendingFollowUp = Boolean(
    latestCustomerImportAt &&
      (!snapshot.lastEffectiveFollowUpAt ||
        snapshot.lastEffectiveFollowUpAt.getTime() < latestCustomerImportAt.getTime()),
  );
  const workingStatuses = customerWorkStatusValues.filter((status) => {
    switch (status) {
      case "new_imported":
        return newImported;
      case "pending_first_call":
        return pendingFirstCall;
      case "pending_follow_up":
        return pendingFollowUp;
      case "pending_wechat":
        return pendingWechat;
      case "pending_invitation":
        return pendingInvitation;
      case "pending_deal":
        return pendingDeal;
      case "migration_pending_follow_up":
        return migrationPendingFollowUp;
      default:
        return false;
    }
  });
  return {
    latestLeadAt,
    latestFollowUpAt,
    latestCustomerImportAt,
    assignedAt,
    executionClass,
    newImported,
    pendingFirstCall,
    pendingFollowUp,
    pendingWechat,
    pendingInvitation,
    pendingDeal,
    migrationPendingFollowUp,
    isWechatAdded: successfulWechat,
    workingStatuses,
  };
}

function getCustomerSnapshotState(
  snapshot: CustomerSnapshot,
  latestCustomerImportAt: Date | null,
  assignedAt: Date | null,
  now: Date,
  todayStart: Date,
  todayEnd: Date,
): CustomerSnapshotState {
  const latestInterest = getLatestInterestedProduct(snapshot);

  return {
    ...getCustomerSnapshotCoreState(
      snapshot,
      latestCustomerImportAt,
      assignedAt,
      now,
      todayStart,
      todayEnd,
    ),
    latestInterestedProduct: latestInterest?.interestedProduct ?? null,
    latestInterestedAmount: latestInterest?.interestedAmount ?? null,
    latestInterestedAt: latestInterest?.interestedAt ?? null,
    latestPurchasedProduct: getLatestPurchasedProduct(snapshot),
    productKeys: getSnapshotProductEntries(snapshot).map((item) => item.key),
    tagIds: [...new Set(snapshot.customerTags.map((item) => item.tagId))],
  };
}

function buildSummaryStats<T extends Pick<CustomerStateSource, "id" | "createdAt">>(
  snapshots: T[],
  stateMap: Map<string, CustomerDashboardState | CustomerSnapshotState>,
  todayStart: Date,
  todayEnd: Date,
): CustomerSummaryStats {
  const executionClassCounts = createExecutionClassCountMap();

  for (const snapshot of snapshots) {
    const executionClass = stateMap.get(snapshot.id)?.executionClass;

    if (executionClass) {
      executionClassCounts[executionClass] += 1;
    }
  }

  return {
    customerCount: snapshots.length,
    todayNewCustomerCount: snapshots.filter((item) =>
      isWithinToday(item.createdAt, todayStart, todayEnd),
    ).length,
    todayNewImportedCount: snapshots.filter((item) => stateMap.get(item.id)?.newImported).length,
    todayAssignedCount: snapshots.filter((item) => {
      const assignedAt = stateMap.get(item.id)?.assignedAt;
      return assignedAt ? isWithinToday(assignedAt, todayStart, todayEnd) : false;
    }).length,
    pendingFirstCallCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFirstCall)
      .length,
    pendingFollowUpCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingFollowUp)
      .length,
    pendingWechatCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingWechat).length,
    pendingInvitationCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingInvitation)
      .length,
    pendingDealCount: snapshots.filter((item) => stateMap.get(item.id)?.pendingDeal).length,
    migrationPendingFollowUpCount: snapshots.filter(
      (item) => stateMap.get(item.id)?.migrationPendingFollowUp,
    ).length,
    executionClassCounts,
    latestFollowUpAt: getMaxDate(
      snapshots.map((item) => stateMap.get(item.id)?.latestFollowUpAt ?? null),
    ),
  };
}

// F18 customers/perf phase 3: buildQueueCounts(全表内存版) 已不再被任何主路径
// 引用 — page mode + cursor mode 都从 SQL aggregate (`getCustomerCenterStatsAggregate`)
// 取 queueCounts. 此处删除避免长期吸引误用.

function matchesCustomerExecutionClasses(
  state: CustomerSnapshotState | undefined,
  executionClasses: CustomerExecutionClass[],
) {
  if (executionClasses.length === 0) {
    return true;
  }

  if (!state) {
    return false;
  }

  return executionClasses.includes(state.executionClass);
}

function matchesCustomerProducts(
  snapshot: CustomerSnapshot,
  state: CustomerSnapshotState | undefined,
  productKeys: string[],
  productKeyword: string,
) {
  if (productKeys.length === 0 && !productKeyword) {
    return true;
  }

  if (!state) {
    return false;
  }

  const hasSelectedProduct =
    productKeys.length === 0 || productKeys.some((key) => state.productKeys.includes(key));

  if (!hasSelectedProduct) {
    return false;
  }

  if (!productKeyword) {
    return true;
  }

  const normalizedKeyword = productKeyword.toLowerCase();
  return getSnapshotProductEntries(snapshot).some((entry) =>
    entry.label.toLowerCase().includes(normalizedKeyword),
  );
}

function matchesCustomerTags(state: CustomerSnapshotState | undefined, tagIds: string[]) {
  if (tagIds.length === 0) {
    return true;
  }

  if (!state) {
    return false;
  }

  return tagIds.some((tagId) => state.tagIds.includes(tagId));
}

function matchesAssignedDateRange(
  state: CustomerSnapshotState | undefined,
  assignedFrom: string,
  assignedTo: string,
) {
  if (!assignedFrom && !assignedTo) {
    return true;
  }

  const assignedAt = state?.assignedAt ?? null;
  if (!assignedAt) {
    return false;
  }

  const from = parseDateOnly(assignedFrom, "start");
  const to = parseDateOnly(assignedTo, "end");

  if (from && assignedAt.getTime() < from.getTime()) {
    return false;
  }

  if (to && assignedAt.getTime() > to.getTime()) {
    return false;
  }

  return true;
}

function matchesCustomerSearch(snapshot: CustomerSnapshot, search: string) {
  if (!search) {
    return true;
  }

  const keyword = search.toLowerCase();
  const searchableTexts = [
    snapshot.name,
    snapshot.phone,
    snapshot.remark ?? "",
    snapshot.owner?.name ?? "",
    snapshot.owner?.username ?? "",
    ...snapshot.leads.flatMap((lead) => [
      lead.interestedProduct ?? "",
      lead.remark ?? "",
    ]),
    ...snapshot.followUpTasks.map((task) => task.content ?? ""),
    ...snapshot.callRecords.map((record) => record.remark ?? ""),
    ...snapshot.salesOrders.flatMap((order) =>
      order.items.map((item) => item.productNameSnapshot),
    ),
  ];

  return searchableTexts.some((value) => value.toLowerCase().includes(keyword));
}

function compareCustomerSnapshots(
  left: CustomerSnapshot,
  right: CustomerSnapshot,
  stateMap: Map<string, CustomerSnapshotState>,
) {
  const leftState = stateMap.get(left.id);
  const rightState = stateMap.get(right.id);
  // Keep the customer center stable after follow-up actions; sort by assignment/entry time instead.
  const leftAnchor =
    leftState?.assignedAt ??
    leftState?.latestCustomerImportAt ??
    leftState?.latestLeadAt ??
    left.createdAt;
  const rightAnchor =
    rightState?.assignedAt ??
    rightState?.latestCustomerImportAt ??
    rightState?.latestLeadAt ??
    right.createdAt;

  if (rightAnchor.getTime() !== leftAnchor.getTime()) {
    return rightAnchor.getTime() - leftAnchor.getTime();
  }

  if (right.createdAt.getTime() !== left.createdAt.getTime()) {
    return right.createdAt.getTime() - left.createdAt.getTime();
  }

  return left.id.localeCompare(right.id);
}

function buildProductFilterOptions(snapshots: CustomerSnapshot[]) {
  const options = new Map<string, CustomerProductFilterOption>();

  for (const snapshot of snapshots) {
    for (const entry of getSnapshotProductEntries(snapshot)) {
      const existing = options.get(entry.key);

      if (existing) {
        existing.count += 1;
        continue;
      }

      options.set(entry.key, {
        ...entry,
        count: 1,
      });
    }
  }

  return [...options.values()]
    .sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "purchased" ? -1 : 1;
      }

      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label, "zh-CN");
    });
}

function buildTagFilterOptions(
  snapshots: CustomerSnapshot[],
  activeTags: ActiveTagOption[],
) {
  const counts = new Map<string, number>();

  for (const snapshot of snapshots) {
    const seen = new Set(snapshot.customerTags.map((item) => item.tagId));

    for (const tagId of seen) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }

  return activeTags
    .map((tag) => ({
      ...tag,
      count: counts.get(tag.id) ?? 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
}

async function fetchCustomerListItems(
  customerIds: string[],
  stateMap: Map<string, CustomerSnapshotState>,
): Promise<CustomerListItem[]> {
  if (customerIds.length === 0) {
    return [];
  }

  const fallbackRecycleGuard: RecycleMoveGuard = {
    canMoveToRecycleBin: false,
    fallbackAction: "/customers",
    fallbackActionLabel: "返回客户工作台",
    blockerSummary: "当前客户回收判断暂时不可用，请刷新后重试。",
    blockers: [],
    futureRestoreBlockers: [],
  };

  const [items, tradeOrderSummaries, recycleSnapshots] = await Promise.all([
    prisma.customer.findMany({
      where: {
        id: {
          in: customerIds,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        province: true,
        city: true,
        district: true,
        address: true,
        avatarPath: true,
        remark: true,
        status: true,
        // Wave 7-B 客户分级 A/B/C/D/F (可空).
        grade: true,
        // Wave 11 累计拨打次数 → 列表行 "已拨 X/5".
        callCount: true,
        ownershipMode: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        leads: {
          where: buildVisibleLeadWhereInput(),
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            source: true,
            status: true,
            interestedProduct: true,
            createdAt: true,
          },
        },
        callRecords: {
          orderBy: [{ callTime: "desc" }, { id: "desc" }],
          take: 8,
          select: {
            id: true,
            callTime: true,
            durationSeconds: true,
            result: true,
            resultCode: true,
            remark: true,
            nextFollowUpAt: true,
            outboundSession: {
              select: {
                id: true,
              },
            },
            sales: {
              select: {
                name: true,
                username: true,
              },
            },
          },
        },
        _count: {
          select: {
            leads: {
              where: buildVisibleLeadWhereInput(),
            },
            callRecords: true,
          },
        },
        customerTags: {
          orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
          take: 5,
          select: {
            id: true,
            tagId: true,
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    }),
    prisma.tradeOrder.groupBy({
      by: ["customerId"],
      where: {
        AND: [
          {
            customerId: {
              in: customerIds,
            },
            tradeStatus: TradeOrderStatus.APPROVED,
          },
          ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE,
        ],
      },
      _sum: {
        finalAmount: true,
      },
      _max: {
        createdAt: true,
      },
      _count: {
        _all: true,
      },
    }),
    Promise.all(
      customerIds.map(async (customerId) => {
        const [target, finalizePreview] = await Promise.all([
          getCustomerRecycleTarget(prisma, "CUSTOMER", customerId),
          buildCustomerFinalizePreview(prisma, {
            targetType: "CUSTOMER",
            targetId: customerId,
            domain: "CUSTOMER",
          }),
        ]);

        return [
          customerId,
          {
            recycleGuard: target?.guard ?? fallbackRecycleGuard,
            recycleFinalizePreview: finalizePreview,
          },
        ] as const;
      }),
    ),
  ]);

  const recycleSnapshotMap = new Map(recycleSnapshots);
  const labeledCallRecords = await hydrateCallResultLabels(
    items.flatMap((item) => item.callRecords),
  );
  const labeledCallRecordMap = new Map(
    labeledCallRecords.map((item) => [item.id, item]),
  );
  const tradeOrderSummaryMap = new Map(
    tradeOrderSummaries.map((item) => [
      item.customerId,
      {
        lifetimeTradeAmount: item._sum.finalAmount?.toString() ?? "0",
        latestTradeAt: item._max.createdAt ?? null,
        approvedTradeOrderCount: item._count._all ?? 0,
      },
    ]),
  );
  const itemMap = new Map(items.map((item) => [item.id, item]));
  return customerIds.reduce<CustomerListItem[]>((result, id) => {
    const item = itemMap.get(id);
    const state = stateMap.get(id);
    const tradeOrderSummary = tradeOrderSummaryMap.get(id);
    const recycleSnapshot = recycleSnapshotMap.get(id);

    if (item) {
      result.push({
        ...item,
        avatarUrl: resolveCustomerAvatarSrc(item.avatarPath),
        // Wave 11: callCount 来自 select 标量; isWechatAdded 来自 stateMap 的加微
        // 判定 (buildSuccessfulWechatMatcher). 行上据此显/隐 "已拨 X/5".
        callCount: item.callCount,
        isWechatAdded: state?.isWechatAdded ?? false,
        assignedAt: state?.assignedAt ?? null,
        callRecords: item.callRecords.map((record) => {
          const labeled = labeledCallRecordMap.get(record.id);

          return {
            id: record.id,
            callTime: record.callTime,
            durationSeconds: record.durationSeconds,
            callSource: record.outboundSession ? "crm-outbound" : "local-phone",
            result: record.result,
            resultCode: labeled?.resultCode ?? record.resultCode ?? record.result ?? null,
            resultLabel:
              labeled?.resultLabel ?? record.resultCode ?? record.result ?? "未记录",
            remark: record.remark,
            nextFollowUpAt: record.nextFollowUpAt,
            sales: record.sales,
          };
        }),
        latestImportAt: state?.latestLeadAt ?? null,
        latestFollowUpAt: state?.latestFollowUpAt ?? null,
        lastEffectiveFollowUpAt: state?.latestFollowUpAt ?? null,
        latestTradeAt: tradeOrderSummary?.latestTradeAt ?? null,
        lifetimeTradeAmount: tradeOrderSummary?.lifetimeTradeAmount ?? "0",
        approvedTradeOrderCount: tradeOrderSummary?.approvedTradeOrderCount ?? 0,
        executionClass: state?.executionClass ?? "D",
        newImported: state?.newImported ?? false,
        pendingFirstCall: state?.pendingFirstCall ?? false,
        latestInterestedProduct: state?.latestInterestedProduct ?? null,
        latestInterestedAmount: state?.latestInterestedAmount ?? null,
        latestInterestedAt: state?.latestInterestedAt ?? null,
        latestPurchasedProduct: state?.latestPurchasedProduct ?? null,
        remark: item.remark,
        workingStatuses: state?.workingStatuses ?? [],
        recycleGuard: recycleSnapshot?.recycleGuard ?? fallbackRecycleGuard,
        recycleFinalizePreview: recycleSnapshot?.recycleFinalizePreview ?? null,
      });
    }

    return result;
  }, []);
}

export function buildPendingFirstCallCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    callRecords: {
      none: {},
    },
    leads: {
      some: {
        rolledBackAt: null,
        status: {
          in: [LeadStatus.NEW, LeadStatus.ASSIGNED, LeadStatus.FIRST_CALL_PENDING],
        },
      },
    },
  };
}

export function buildPendingFollowUpCustomerWhereInput(now = new Date()): Prisma.CustomerWhereInput {
  return {
    OR: [
      {
        followUpTasks: {
          some: {
            status: FollowUpTaskStatus.PENDING,
            dueAt: {
              lte: now,
            },
          },
        },
      },
      {
        leads: {
          some: {
            rolledBackAt: null,
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
      {
        callRecords: {
          some: {
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
      {
        wechatRecords: {
          some: {
            nextFollowUpAt: {
              lte: now,
            },
          },
        },
      },
    ],
  };
}

/**
 * "已成功加微" 信号 (SQL OR 片段): 有 WechatRecord.addedStatus = ADDED, 或有
 * CallRecord.result = WECHAT_ADDED. 与内存版 `buildSuccessfulWechatMatcher` /
 * `isSuccessfulWechatCallSignal` 同语义, SQL 侧单一真相, 供 pending_wechat /
 * pending_dial / isWechatAdded / wechat_added 队列复用, 避免判定漂移.
 *
 * Wave 12: 本身也是 `wechat_added` 队列 (已加微) 的 where —
 * `buildNotAddedWechatCustomerWhereInput` 的正面.
 */
function buildWechatAddedSignalWhereInput(): Prisma.CustomerWhereInput {
  return {
    OR: [
      {
        wechatRecords: {
          some: {
            addedStatus: WechatAddStatus.ADDED,
          },
        },
      },
      {
        callRecords: {
          some: {
            result: CallResult.WECHAT_ADDED,
          },
        },
      },
    ],
  };
}

/**
 * "未加微" (SQL): 取 `buildWechatAddedSignalWhereInput` 的反面 —— 既无 ADDED 的
 * WechatRecord, 也无 result = WECHAT_ADDED 的 CallRecord. pending_dial 队列与
 * pending_wechat 都用它做 "还没加上微信" 的判定锚点.
 */
export function buildNotAddedWechatCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    NOT: buildWechatAddedSignalWhereInput(),
  };
}

export function buildWechatPendingCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    AND: [
      buildNotAddedWechatCustomerWhereInput(),
      {
        OR: [
          {
            wechatRecords: {
              some: {
                addedStatus: WechatAddStatus.PENDING,
              },
            },
          },
          {
            callRecords: {
              some: {
                result: CallResult.WECHAT_PENDING,
              },
            },
          },
        ],
      },
    ],
  };
}

/**
 * Wave 11 待拨打队列 (pending_dial) 的 SQL where.
 *
 * 业务定义 (销售口述): "未加微客户至少拨打 5 遍". 队列纳入条件:
 *   - 未加微: 取 `buildNotAddedWechatCustomerWhereInput` (无 ADDED WechatRecord
 *     且无 result = WECHAT_ADDED 的 CallRecord).
 *   - 非稳定结论: grade 不在 (E 拒加, F 空号). 两者都是 grade.ts 派生的终态 —
 *     空号拨不通, 明确拒加再拨只会惹反感, 都不该再占用销售拨打额度.
 *     grade = null (新客户还没攒到信号) 仍留在队列, 用显式 OR 把 null 包进来
 *     (SQL `NOT IN` 会把 null 行排除, 不能直接用 notIn 一把梭).
 *
 * 注意 (用户明确要求): 不按 callCount >= 5 把 "已拨满 5 次" 切出去 —— 5 只是
 * 列表行上的提示 (已拨 X/5), 拨满后客户仍留在 pending_dial, 直到加上微信或被
 * 判为空号/拒加才离开. 因此本 where 不含任何 callCount 过滤. (砍掉的
 * dial_exhausted 队列也不再存在.)
 */
export function buildPendingDialCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    AND: [
      buildNotAddedWechatCustomerWhereInput(),
      {
        OR: [
          { grade: null },
          {
            grade: {
              notIn: [CustomerGrade.E, CustomerGrade.F],
            },
          },
        ],
      },
    ],
  };
}

/**
 * F17 customers/perf phase 2: SQL-side approximation of pendingInvitation.
 *
 * 原内存逻辑:
 *   `hasActiveWechatProgress && successfulWechat && !hasInvitation && !hasApprovedSalesOrder`
 *
 * SQL 近似 (省略 executionClass gate):
 *   "有微信加成功 (wechat=ADDED 或 call.result=WECHAT_ADDED), 没有直播邀请,
 *    没有 APPROVED 的 TradeOrder, 也没有 APPROVED 的 legacy SalesOrder."
 *
 * 与内存版本的差异: executionClass = D/E 的客户 (无连接通话 + 拒微) 在内存
 * 版本被排除; SQL 版本会包含他们. 实测占比极小 (≪1%), 用于 sidebar 概览
 * 计数完全够用; 详细 queue UI 仍然走 stateMap (页面级精确).
 */
function buildPendingInvitationCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    AND: [
      {
        OR: [
          {
            wechatRecords: {
              some: {
                addedStatus: WechatAddStatus.ADDED,
              },
            },
          },
          {
            callRecords: {
              some: {
                result: CallResult.WECHAT_ADDED,
              },
            },
          },
        ],
      },
      {
        liveInvitations: {
          none: {},
        },
      },
      {
        salesOrders: {
          none: { reviewStatus: SalesOrderReviewStatus.APPROVED },
        },
      },
      {
        tradeOrders: {
          none: { tradeStatus: TradeOrderStatus.APPROVED },
        },
      },
    ],
  };
}

/**
 * F17 customers/perf phase 2: SQL-side approximation of pendingDeal.
 *
 * 原内存逻辑:
 *   `!hasApprovedSalesOrder && hasActiveWechatProgress &&
 *    (hasInvitation || lead.status in pendingDealLeadStatuses)`
 *
 * SQL 近似 (省略 executionClass gate):
 *   "无 APPROVED 订单 (TradeOrder + legacy SalesOrder), 且 (有 LiveInvitation
 *    或 lead 状态在 LIVE_INVITED/LIVE_WATCHED/ORDERED)".
 */
function buildPendingDealCustomerWhereInput(): Prisma.CustomerWhereInput {
  return {
    AND: [
      {
        tradeOrders: {
          none: { tradeStatus: TradeOrderStatus.APPROVED },
        },
      },
      {
        salesOrders: {
          none: { reviewStatus: SalesOrderReviewStatus.APPROVED },
        },
      },
      {
        OR: [
          {
            liveInvitations: {
              some: {},
            },
          },
          {
            leads: {
              some: {
                rolledBackAt: null,
                status: { in: pendingDealLeadStatuses },
              },
            },
          },
        ],
      },
    ],
  };
}

/**
 * F17 customers/perf phase 2: SQL-side todayNewImported.
 *
 * 原内存逻辑: `snapshot.leads.some(lead.createdAt today)`.
 * SQL 等价: 客户当天有任意活跃 lead 创建.
 */
function buildTodayNewImportedCustomerWhereInput(
  todayStart: Date,
  todayEnd: Date,
): Prisma.CustomerWhereInput {
  return {
    leads: {
      some: {
        rolledBackAt: null,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    },
  };
}

/**
 * 分配时间 (assignedFrom / assignedTo) → SQL where.
 *
 * 真相: 客户被"分配/接手"的时间 = CustomerOwnershipEvent (PRIVATE 承接) 的
 * createdAt; 早期 lead 期分配走 LeadAssignment.createdAt. 与内存 assignedAt
 * 派生 (getLatestCustomerAssignmentMap) 同源.
 *
 * 关键修复 (2026-06-10): 之前 SQL 端图省事用 customer.createdAt 近似, 导致
 * "老客户(createdAt 旧) 今天重新分配给某销售" 时, 按 分配时间=今天 + 该销售
 * 过滤 → 列表空 (createdAt 不在今天). 现在改查 ownershipEvents / leadAssignments
 * 的 createdAt, 老客户重分配能正确命中.
 *
 * salesId 存在时: "分配时间" = 分配给该销售的事件时间 (toOwnerId / toUserId
 * 限定到该销售). 不传 salesId (ADMIN 看全量): 任意 PRIVATE 承接 / lead 分配在
 * 窗口内即算.
 */
function buildAssignedRangeCustomerWhereInput(
  assignedFrom: string,
  assignedTo: string,
  salesId: string,
): Prisma.CustomerWhereInput | null {
  const fromDate = parseDateOnly(assignedFrom, "start");
  const toDate = parseDateOnly(assignedTo, "end");
  if (!fromDate && !toDate) {
    return null;
  }
  const range: { gte?: Date; lte?: Date } = {};
  if (fromDate) range.gte = fromDate;
  if (toDate) range.lte = toDate;

  const ownershipEventWhere: Prisma.CustomerOwnershipEventWhereInput = {
    toOwnershipMode: CustomerOwnershipMode.PRIVATE,
    createdAt: range,
  };
  const leadAssignmentWhere: Prisma.LeadAssignmentWhereInput = {
    createdAt: range,
  };
  if (salesId) {
    ownershipEventWhere.toOwnerId = salesId;
    leadAssignmentWhere.toUserId = salesId;
  }

  return {
    OR: [
      { ownershipEvents: { some: ownershipEventWhere } },
      { leads: { some: { assignments: { some: leadAssignmentWhere } } } },
    ],
  };
}

/**
 * 把 customer queue key 翻译成 SQL where 片段, 与 sidebar aggregate 同源.
 *
 * 关键: 复用 getCustomerCenterStatsAggregate 内用的同一批 `build*CustomerWhereInput`
 * helper, 这样列表 (listTotalCount + findMany skip/take) 和侧栏 queueCounts
 * 用同一份 SQL where — 避免 "侧栏待跟进 1234 位 / 列表展示 5826 行" 的回归.
 *
 * - `all`: 返回 null (不缩窄列表).
 * - `migration_pending_follow_up`: 返回 null. 该队列依赖 OperationLog join,
 *   SQL aggregate 暂未实现 (概览本身也是 0), 列表保持 fallthrough 与侧栏一致.
 * - 其余 queue: 复用对应 build*CustomerWhereInput. `now` 仅 pending_follow_up
 *   的相对时间窗口需要, 默认 new Date() (同一请求内, 毫秒级差异对天级边界无影响).
 */
export function buildQueueCustomerWhereInput(
  queue: CustomerQueueKey,
  todayStart: Date,
  todayEnd: Date,
  now: Date = new Date(),
): Prisma.CustomerWhereInput | null {
  switch (queue) {
    case "all":
    case "migration_pending_follow_up":
      return null;
    case "new_imported":
      return buildTodayNewImportedCustomerWhereInput(todayStart, todayEnd);
    case "pending_first_call":
      return buildPendingFirstCallCustomerWhereInput();
    case "pending_dial":
      return buildPendingDialCustomerWhereInput();
    case "pending_follow_up":
      return buildPendingFollowUpCustomerWhereInput(now);
    case "pending_wechat":
      return buildWechatPendingCustomerWhereInput();
    case "wechat_added":
      return buildWechatAddedSignalWhereInput();
    case "pending_invitation":
      return buildPendingInvitationCustomerWhereInput();
    case "pending_deal":
      return buildPendingDealCustomerWhereInput();
    default: {
      // 类型层穷尽; 运行期兜底 — 不缩窄.
      const _exhaustive: never = queue;
      void _exhaustive;
      return null;
    }
  }
}

export function parseCustomerDetailTab(
  searchParams: Record<string, SearchParamsValue> | undefined,
  fallbackTab: CustomerDetailTab = "profile",
): CustomerDetailTab {
  const parsed = detailTabSchema.safeParse(getParamValue(searchParams?.tab));
  return parsed.success ? parsed.data : fallbackTab;
}

/**
 * F19 customers/streaming: 列表分片 (split of `getCustomerCenterData`).
 *
 * 与 `getCustomerCenterData` 共享 SQL where + 视图模型, 但只返回 "用户最关心"
 * 的列表数据 (queueItems / pagination / phoneSearchDisclosures / productOptions /
 * tagOptions / callResultOptions). 顶部 stats / sidebar / 筛选 dropdown 走
 * `getCustomerCenterDataStats` 独立 Suspense, 不阻塞列表 SSR.
 *
 * 重叠成本: actor / teams / salesUsers / recycledIds / visibleIds / activeTags
 * 已 60s `unstable_cache`, 两边各调一次是 cache hit, 实际只多一次 (小) 字典
 * 查找.
 */
export type CustomerCenterListData = {
  actor: CustomerCenterActor;
  filters: CustomerCenterFilters;
  scopeMode: CustomerCenterData["scopeMode"];
  productOptions: CustomerCenterData["productOptions"];
  tagOptions: CustomerCenterData["tagOptions"];
  callResultOptions: CustomerCenterData["callResultOptions"];
  queueItems: CustomerCenterData["queueItems"];
  phoneSearchDisclosures: CustomerCenterData["phoneSearchDisclosures"];
  pagination: CustomerCenterData["pagination"];
};

/**
 * F19 customers/streaming: stats 分片 (split of `getCustomerCenterData`).
 *
 * 重计算: `getCustomerCenterStatsAggregate` (多个 groupBy/count). 这里独立暴露,
 * 让 UI 在 Suspense 内部填充, 不阻塞列表本身.
 */
export type CustomerCenterStatsData = {
  scopeMode: CustomerCenterData["scopeMode"];
  selectedTeam: CustomerCenterData["selectedTeam"];
  selectedSales: CustomerCenterData["selectedSales"];
  summary: CustomerCenterData["summary"];
  queueCounts: CustomerCenterData["queueCounts"];
  teamOverview: CustomerCenterData["teamOverview"];
  salesBoard: CustomerCenterData["salesBoard"];
  transferableOwners: CustomerCenterData["transferableOwners"];
  /**
   * Wave 12 今日战绩条 (真实数据, 替换 0 占位). 3 个 count 都是请求时直查
   * (不进 unstable_cache): myDialedToday 按 viewer.id 区分, 进共享 cache 会
   * 串号; 每个都是单 index scan 级别的轻量 count, 直查最稳.
   */
  /** 当前登录人今日拨打数: CallRecord.salesId = viewer.id 且 callTime 在今日. */
  myDialedToday: number;
  /**
   * 可见范围内今日拨打总数: CallRecord.callTime 在今日且关联客户命中
   * viewer 可见 scope (排除回收站). SALES 视角可见范围 = 自己, 直接复用
   * myDialedToday (不另发 SQL).
   */
  scopeDialedToday: number;
  /** 可见范围内今日新加微数: WechatRecord.addedStatus = ADDED 且 addedAt 在今日. */
  wechatAddedToday: number;
};

/**
 * 共享 base loader: actor / teams / salesUsers / recycledIds / visibleIds /
 * activeTags + 校验后的 filters. 所有底层调用都已 60s `unstable_cache`, 列表
 * 与 stats 两条 Suspense 路径各调一次走 cache hit, 不重复 SQL.
 *
 * Wave 6/7/8/9 regression fix: 同入口出口也包了 React `cache()`. 即便上层
 * `getCustomerCenterDataList` / `getCustomerCenterDataStats` 已分别 dedupe, 这
 * 里仍然 cover (a) cursor mode 内部直接调 base 的代码路径 / (b) 未来新增同请
 * 求多入口调用方, 让基础数据只算一次.
 */
async function loadCustomerCenterBaseImpl(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const parsedFilters = parseCustomerCenterFilters(rawSearchParams);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [
    teams,
    salesUsers,
    recycledCustomerIds,
    visibleCustomerIds,
    activeTags,
  ] = await Promise.all([
    loadCustomerCenterTeamsCached({
      scope: actor.role === "ADMIN" ? "ADMIN" : "OWN_TEAM",
      teamId: actor.role === "ADMIN" ? null : actor.teamId,
    }),
    loadCustomerCenterSalesUsersCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      viewerId: actor.role === "SALES" ? actor.id : null,
    }),
    loadRecycledCustomerIdsCached(),
    loadVisibleCustomerIdsCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      ownerId: actor.role === "SALES" ? actor.id : null,
    }),
    getActiveTagOptions(),
  ]);

  const salesById = new Map(salesUsers.map((item) => [item.id, item]));
  const teamsById = new Map(teams.map((item) => [item.id, item]));
  const teamId =
    actor.role === "ADMIN"
      ? teamsById.has(parsedFilters.teamId)
        ? parsedFilters.teamId
        : salesById.get(parsedFilters.salesId)?.teamId ?? ""
      : actor.teamId ?? "";
  const salesId = (() => {
    if (actor.role === "SALES") {
      return actor.id;
    }
    const selectedSales = salesById.get(parsedFilters.salesId);
    if (!selectedSales) return "";
    if (teamId && selectedSales.teamId !== teamId) return "";
    return selectedSales.id;
  })();
  const filters: CustomerCenterFilters = {
    queue: parsedFilters.queue,
    executionClasses: parsedFilters.executionClasses,
    grades: parsedFilters.grades,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    assignedFrom: parsedFilters.assignedFrom,
    assignedTo: parsedFilters.assignedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  const scopeMode: CustomerCenterData["scopeMode"] =
    actor.role === "ADMIN"
      ? filters.salesId
        ? "sales"
        : filters.teamId
          ? "team"
          : "organization"
      : actor.role === "SUPERVISOR"
        ? actor.teamId
          ? filters.salesId
            ? "sales"
            : "team"
          : "team_unassigned"
        : "personal";

  return {
    actor,
    visibleWhere,
    teams,
    salesUsers,
    recycledCustomerIds,
    visibleCustomerIds,
    activeTags,
    filters,
    scopeMode,
    now,
    todayStart,
    todayEnd,
  };
}

const loadCustomerCenterBase = cache(loadCustomerCenterBaseImpl);

/**
 * Wave 9 hotfix (2026-06-09): cursor 与 page 模式必须使用同一份高级 filter SQL.
 *
 * 历史: cursor 模式 (listCustomersCursor) 只把 search/owner/team/grades 推到
 * SQL, productKeys/productKeyword/tagIds/assignedFrom/assignedTo/
 * executionClasses/queue 全部静默丢弃. 用户在 cursor 翻页时 (URL 含 `?cursor=`),
 * 工具栏 chip 仍显示生效, 但列表只按 grade 过滤 — 书签/分享链接行为不可信.
 *
 * 现在把 page-mode 的 filter clauses 抽到 shared helper, cursor 和 page 都用,
 * 行为一致. 已知降级 (assignedRange ≈ ownershipEvent EXISTS, executionClass D
 * 近似 "其它", queue=migration_pending_follow_up 仍 fallthrough) 也一致;
 * 其余 queue 已经过 buildQueueCustomerWhereInput 与 sidebar aggregate 同源.
 */
export function buildCustomerCenterListFilterClauses(input: {
  filters: CustomerCenterFilters;
  todayStart: Date;
  todayEnd: Date;
}): Prisma.CustomerWhereInput[] {
  const { filters, todayStart, todayEnd } = input;
  const listFilterClauses: Prisma.CustomerWhereInput[] = [];
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    listFilterClauses.push({
      OR: [
        { name: { contains: term } },
        { phone: { contains: term } },
        { remark: { contains: term } },
      ],
    });
  }
  if (filters.salesId) {
    listFilterClauses.push({ ownerId: filters.salesId });
  }
  if (filters.teamId) {
    listFilterClauses.push({ owner: { is: { teamId: filters.teamId } } });
  }
  if (filters.grades.length > 0) {
    listFilterClauses.push({ grade: { in: filters.grades } });
  }
  if (filters.productKeys.length > 0) {
    const labels = filters.productKeys
      .map((key) => {
        const colonIdx = key.indexOf(":");
        return colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
      })
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (labels.length > 0) {
      listFilterClauses.push({
        OR: [
          { leads: { some: { interestedProduct: { in: labels } } } },
          {
            salesOrders: {
              some: { items: { some: { productNameSnapshot: { in: labels } } } },
            },
          },
        ],
      });
    }
  }
  if (filters.productKeyword && filters.productKeyword.trim().length > 0) {
    const keyword = filters.productKeyword.trim();
    listFilterClauses.push({
      OR: [
        { leads: { some: { interestedProduct: { contains: keyword } } } },
        {
          salesOrders: {
            some: { items: { some: { productNameSnapshot: { contains: keyword } } } },
          },
        },
      ],
    });
  }
  if (filters.tagIds.length > 0) {
    listFilterClauses.push({
      customerTags: { some: { tagId: { in: filters.tagIds } } },
    });
  }
  const assignedRangeWhere = buildAssignedRangeCustomerWhereInput(
    filters.assignedFrom,
    filters.assignedTo,
    filters.salesId,
  );
  if (assignedRangeWhere) {
    listFilterClauses.push(assignedRangeWhere);
  }
  if (filters.executionClasses.length > 0) {
    const classClauses: Prisma.CustomerWhereInput[] = [];
    const approvedDealWhere: Prisma.CustomerWhereInput = {
      OR: [
        { tradeOrders: { some: { tradeStatus: TradeOrderStatus.APPROVED } } },
        { salesOrders: { some: { reviewStatus: SalesOrderReviewStatus.APPROVED } } },
      ],
    };
    const successfulWechatWhere: Prisma.CustomerWhereInput = {
      OR: [
        { wechatRecords: { some: { addedStatus: WechatAddStatus.ADDED } } },
        { callRecords: { some: { result: CallResult.WECHAT_ADDED } } },
      ],
    };
    const liveInvitationWhere: Prisma.CustomerWhereInput = {
      liveInvitations: { some: {} },
    };
    const refusedWechatWhere: Prisma.CustomerWhereInput = {
      callRecords: { some: { result: CallResult.REFUSED_WECHAT } },
    };
    for (const cls of filters.executionClasses) {
      switch (cls) {
        case "A":
          classClauses.push(approvedDealWhere);
          break;
        case "B":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              successfulWechatWhere,
            ],
          });
          break;
        case "C":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              liveInvitationWhere,
            ],
          });
          break;
        case "D":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              { NOT: successfulWechatWhere },
              { NOT: liveInvitationWhere },
            ],
          });
          break;
        case "E":
          classClauses.push({
            AND: [{ NOT: approvedDealWhere }, refusedWechatWhere],
          });
          break;
      }
    }
    if (classClauses.length > 0) {
      listFilterClauses.push({ OR: classClauses });
    }
  }
  // queue 派生过滤: 复用 buildQueueCustomerWhereInput, 与 sidebar aggregate 同源.
  // 早期版本只接 new_imported, 其余 console.warn 后放行 — 导致 "侧栏待跟进 X /
  // 列表展示全量" 的回归. 现在所有 queue 都翻译成 SQL where, queueCounts 与
  // listTotalCount 对齐. (migration_pending_follow_up 仍 fallthrough, 概览 0.)
  const queueWhere = buildQueueCustomerWhereInput(filters.queue, todayStart, todayEnd);
  if (queueWhere) {
    listFilterClauses.push(queueWhere);
  }
  return listFilterClauses;
}

/**
 * 构造 page-mode list query 的 SQL where (与 `getCustomerCenterData` 同源).
 * 已知降级与历史注释见 getCustomerCenterData 内部. 抽出后两个 split 路径共用.
 */
function buildCustomerCenterListWhere(input: {
  filters: CustomerCenterFilters;
  visibleWhere: Prisma.CustomerWhereInput;
  recycledCustomerIds: string[];
  todayStart: Date;
  todayEnd: Date;
}): Prisma.CustomerWhereInput {
  const { filters, visibleWhere, recycledCustomerIds, todayStart, todayEnd } =
    input;
  const listFilterClauses = buildCustomerCenterListFilterClauses({
    filters,
    todayStart,
    todayEnd,
  });

  return {
    AND: [
      visibleWhere,
      ...(recycledCustomerIds.length > 0
        ? [
            {
              id: { notIn: recycledCustomerIds },
            } satisfies Prisma.CustomerWhereInput,
          ]
        : []),
      ...listFilterClauses,
    ],
  };
}

/**
 * F19 customers/streaming: 列表分片入口.
 *
 * 与 `getCustomerCenterData` 行为等价 (page mode), 但不算 SQL aggregate, 也不
 * 构造 summary / queueCounts / teamOverview / salesBoard. 这些走
 * `getCustomerCenterDataStats` 在第二个 Suspense 边界异步填充.
 *
 * Wave 6/7/8/9 regression fix: 用 React `cache()` 包一层入口, 让同一请求里
 * 不同 Suspense 边界拿到的 (viewer, rawSearchParams) 同引用调用共享同一个
 * Promise — 避免 `loadCustomerCenterBase` + 内部 SQL 跑两遍. 失效粒度仍
 * 由底层 `unstable_cache` (60s TTL) 控制, 跨请求行为不变.
 */
async function getCustomerCenterDataListImpl(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
): Promise<CustomerCenterListData> {
  const base = await loadCustomerCenterBase(viewer, rawSearchParams);
  const {
    actor,
    visibleWhere,
    recycledCustomerIds,
    visibleCustomerIds,
    activeTags,
    filters,
    scopeMode,
    now,
    todayStart,
    todayEnd,
  } = base;

  const listWhere = buildCustomerCenterListWhere({
    filters,
    visibleWhere,
    recycledCustomerIds,
    todayStart,
    todayEnd,
  });

  const pageSize = filters.pageSize;
  const requestedPage = filters.page;
  const listTotalCount = await prisma.customer.count({ where: listWhere });
  const totalPages = Math.max(1, Math.ceil(listTotalCount / pageSize));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const skip = (currentPage - 1) * pageSize;

  const pageSnapshots: CustomerSnapshot[] = await prisma.customer.findMany({
    where: listWhere,
    orderBy: CUSTOMER_CENTER_LIST_ORDER_BY,
    skip,
    take: pageSize,
    select: customerSnapshotSelect,
  });

  const [pageImportMap, pageAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(pageSnapshots.map((s) => s.id)),
    getLatestCustomerAssignmentMap(pageSnapshots),
  ]);
  const stateMap = new Map<string, CustomerSnapshotState>(
    pageSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(
        snapshot,
        pageImportMap.get(snapshot.id)?.createdAt ?? null,
        pageAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );

  const productOptions = buildProductFilterOptions(pageSnapshots);
  const tagOptions = buildTagFilterOptions(pageSnapshots, activeTags);

  const pageCustomerIds = pageSnapshots.map((item) => item.id);
  const [queueItems, callResultOptions] = await Promise.all([
    fetchCustomerListItems(pageCustomerIds, stateMap),
    getEnabledCallResultOptions(),
  ]);
  const phoneSearchDisclosures = await getPhoneSearchOwnershipDisclosures({
    actor,
    search: filters.search,
    visibleCustomerIds,
    recycledCustomerIds,
  });

  return {
    actor,
    filters: {
      ...filters,
      page: currentPage,
    },
    scopeMode,
    productOptions,
    tagOptions,
    callResultOptions,
    queueItems,
    phoneSearchDisclosures,
    pagination: {
      page: currentPage,
      pageSize,
      totalCount: listTotalCount,
      totalPages,
      mode: "page",
    },
  };
}

export const getCustomerCenterDataList = cache(getCustomerCenterDataListImpl);

/**
 * F19 customers/streaming: stats 分片入口.
 *
 * 走 SQL aggregate (`getCustomerCenterStatsAggregate`) + 派生 summary /
 * queueCounts / teamOverview / salesBoard / selectedTeam / selectedSales.
 * UI 在列表 SSR 完成后, 通过 Suspense 在顶部 / sidebar 异步填充.
 *
 * Wave 6/7/8/9 regression fix: 同 list 入口, 用 React `cache()` 包一层. page.tsx
 * 里 StreamingList + StreamingToolbar 两个 Suspense 边界都会调一次, 同一请求里
 * 共享同一个 Promise — 避免 `getCustomerCenterStatsAggregate` (8 对 count+groupBy,
 * 16+ SQL, 每条都带 `id: notIn [大 recycled set]`) 跑两遍.
 */
async function getCustomerCenterDataStatsImpl(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
): Promise<CustomerCenterStatsData> {
  const base = await loadCustomerCenterBase(viewer, rawSearchParams);
  const {
    actor,
    visibleWhere,
    teams,
    salesUsers,
    recycledCustomerIds,
    filters,
    scopeMode,
    now,
    todayStart,
    todayEnd,
  } = base;

  // Wave 12 今日战绩条: 3 个轻量 count. F20 phase 3 起改走 60s `unstable_cache`
  // (与 aggregate 同一波缓存, 减早高峰 SQL 扇出).
  // - myDialedToday 以 viewer.id 维度统计 "我今天拨了几个电话", 与客户可见
  //   范围无关 (走 callrecord 的 [salesId, callTime] 索引), 按 viewer.id 进 cache key.
  // - scopeDialedToday / wechatAddedToday 以 viewer 可见客户 scope 统计, 与 sidebar
  //   aggregate 同一套 scope 锚点 (recycled 同样不进 SQL/key, 见 cached helper 说明).
  const scope: "ADMIN" | "SUPERVISOR" | "SALES" =
    actor.role === "ADMIN" ? "ADMIN" : actor.role === "SUPERVISOR" ? "SUPERVISOR" : "SALES";
  const scopeTeamId = scope === "SUPERVISOR" ? actor.teamId : null;
  const scopeOwnerId = scope === "SALES" ? actor.id : null;
  const dateKey = localDateKey(todayStart);

  const [aggregate, myDialedToday, scopeDialedTodayRaw, wechatAddedToday] =
    await Promise.all([
      getCustomerCenterStatsAggregate({
        actor,
        visibleWhere,
        recycledCustomerIds,
        now,
        todayStart,
        todayEnd,
      }),
      loadMyDialedTodayCached({ viewerId: actor.id, dateKey }),
      // SALES 可见范围就是本人客户, 语义与 myDialedToday 一致 — 复用, 省一条 SQL.
      actor.role === "SALES"
        ? Promise.resolve<number | null>(null)
        : loadScopeDialedTodayCached({
            scope,
            teamId: scopeTeamId,
            ownerId: scopeOwnerId,
            dateKey,
          }),
      loadScopeWechatAddedTodayCached({
        scope,
        teamId: scopeTeamId,
        ownerId: scopeOwnerId,
        dateKey,
      }),
    ]);
  const scopeDialedToday = scopeDialedTodayRaw ?? myDialedToday;

  const emptyScope: CustomerCenterStatsScope = {
    customerCount: 0,
    todayNewCustomerCount: 0,
    todayNewImportedCount: 0,
    pendingFirstCallCount: 0,
    pendingDialCount: 0,
    pendingFollowUpCount: 0,
    pendingWechatCount: 0,
    wechatAddedCount: 0,
    pendingInvitationCount: 0,
    pendingDealCount: 0,
    latestFollowUpAt: null,
  };
  const scopeStats: CustomerCenterStatsScope = filters.salesId
    ? aggregate.byOwner.get(filters.salesId) ?? emptyScope
    : filters.teamId
      ? aggregate.byTeam.get(filters.teamId) ?? emptyScope
      : aggregate.global;

  const summary: CustomerSummaryStats = {
    customerCount: scopeStats.customerCount,
    todayNewCustomerCount: scopeStats.todayNewCustomerCount,
    todayNewImportedCount: scopeStats.todayNewImportedCount,
    todayAssignedCount: 0,
    pendingFirstCallCount: scopeStats.pendingFirstCallCount,
    pendingFollowUpCount: scopeStats.pendingFollowUpCount,
    pendingWechatCount: scopeStats.pendingWechatCount,
    pendingInvitationCount: scopeStats.pendingInvitationCount,
    pendingDealCount: scopeStats.pendingDealCount,
    migrationPendingFollowUpCount: 0,
    executionClassCounts: aggregate.executionClassCounts,
    latestFollowUpAt: scopeStats.latestFollowUpAt,
  };

  const queueCounts: Record<CustomerQueueKey, number> = {
    all: scopeStats.customerCount,
    new_imported: scopeStats.todayNewImportedCount,
    pending_first_call: scopeStats.pendingFirstCallCount,
    pending_dial: scopeStats.pendingDialCount,
    pending_follow_up: scopeStats.pendingFollowUpCount,
    pending_wechat: scopeStats.pendingWechatCount,
    wechat_added: scopeStats.wechatAddedCount,
    pending_invitation: scopeStats.pendingInvitationCount,
    pending_deal: scopeStats.pendingDealCount,
    migration_pending_follow_up: 0,
  };

  const teamOverview: TeamOverviewItem[] = teams.map((team) => {
    const stats = aggregate.byTeam.get(team.id) ?? emptyScope;
    const salesCount = salesUsers.filter((s) => s.teamId === team.id).length;
    return {
      id: team.id,
      code: team.code,
      name: team.name,
      description: team.description,
      supervisor: team.supervisor,
      salesCount,
      customerCount: stats.customerCount,
      todayNewImportedCount: stats.todayNewImportedCount,
      pendingFirstCallCount: stats.pendingFirstCallCount,
      pendingFollowUpCount: stats.pendingFollowUpCount,
      pendingInvitationCount: stats.pendingInvitationCount,
      pendingDealCount: stats.pendingDealCount,
      migrationPendingFollowUpCount: 0,
    };
  });

  const salesBoard: SalesRepBoardItem[] = salesUsers
    .filter((item) => !filters.teamId || item.teamId === filters.teamId)
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });

  // 批量"移交所有人"目标候选: 与 salesBoard 同构, 但不应用 filters.teamId.
  // salesUsers 已经按 viewer scope 拿到 (ADMIN 全, SUPERVISOR 本团队,
  // SALES 仅自己), 不做额外过滤. SALES role 实际上 RBAC 不允许批量移交,
  // 但仍补足字段, dropdown 是否渲染由前端 canTransferCustomerOwner 决定.
  const transferableOwners: SalesRepBoardItem[] = salesUsers
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      // dropdown 按团队 + 姓名稳定排序, 方便检索; 不再按 customerCount.
      const leftTeam = left.teamName ?? "";
      const rightTeam = right.teamName ?? "";
      const teamCmp = leftTeam.localeCompare(rightTeam, "zh-CN");
      if (teamCmp !== 0) return teamCmp;
      return left.name.localeCompare(right.name, "zh-CN");
    });

  const selectedTeam =
    filters.teamId !== ""
      ? teamOverview.find((item) => item.id === filters.teamId) ?? null
      : actor.role === "SUPERVISOR"
        ? teamOverview[0] ?? null
        : null;
  const selectedSales =
    filters.salesId !== ""
      ? salesBoard.find((item) => item.id === filters.salesId) ?? null
      : actor.role === "SALES"
        ? salesBoard.find((item) => item.id === actor.id) ?? null
        : null;

  return {
    scopeMode,
    selectedTeam,
    selectedSales,
    summary,
    queueCounts,
    teamOverview,
    salesBoard,
    transferableOwners,
    myDialedToday,
    scopeDialedToday,
    wechatAddedToday,
  };
}

export const getCustomerCenterDataStats = cache(getCustomerCenterDataStatsImpl);

/**
 * F18 customers/perf phase 3: /customers 主路径 page-mode 入口.
 *
 * 销售业务习惯保留页码 + 每页显示数量, 同时不能回到 5826 内存全表加载.
 * 这里复用 Wave 8 的 SQL aggregate (`getCustomerCenterStatsAggregate`), 列表
 * 通过 `prisma.customer.findMany` + `take/skip` (OFFSET/LIMIT) 真分页. 排序与
 * cursor 模式保持一致 (`[updatedAt desc, id desc]`), 走 `cust_owner_updated_id_idx`.
 *
 * 与 `getCustomerCenterDataCursor` 行为差异:
 *   - pagination.mode = "page", 提供 totalPages / page / pageSize, UI 展示页码.
 *   - totalCount = SQL where (search/owner/team/grade) 命中数; 派生过滤
 *     (executionClass / queue / product / tag) 不进 totalCount, 与 cursor 模
 *     式定位一致.
 *
 * 与旧 `getCustomerCenterData` (基于 `getCustomerCenterWorkspaceBase` 全量加载)
 * 差异 (可接受):
 *   - sidebar / teamOverview / salesBoard 概览的 pendingInvitation / pendingDeal
 *     不再排除派生 D/E 类客户 (≈ <1% 偏大), 列表行内徽章仍精确.
 *   - migration_pending_follow_up 概览暂为 0, 行内派生仍可用.
 *   - productOptions / tagOptions 是当前页 (≤pageSize 行) 视野; filter 下拉本来就
 *     截取 top 10, 影响几乎为 0.
 */
export async function getCustomerCenterData(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
): Promise<CustomerCenterData> {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const parsedFilters = parseCustomerCenterFilters(rawSearchParams);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // 并行: teams / salesUsers / recycled-ids / visible-ids / activeTags.
  // 都已经独立 60s 缓存, 不再走 5826 全量 snapshot.
  const [
    teams,
    salesUsers,
    recycledCustomerIds,
    visibleCustomerIds,
    activeTags,
  ] = await Promise.all([
    loadCustomerCenterTeamsCached({
      scope: actor.role === "ADMIN" ? "ADMIN" : "OWN_TEAM",
      teamId: actor.role === "ADMIN" ? null : actor.teamId,
    }),
    loadCustomerCenterSalesUsersCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      viewerId: actor.role === "SALES" ? actor.id : null,
    }),
    loadRecycledCustomerIdsCached(),
    loadVisibleCustomerIdsCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      ownerId: actor.role === "SALES" ? actor.id : null,
    }),
    getActiveTagOptions(),
  ]);

  // filter 校验 (teamId / salesId 必须落在 viewer 视野). 与 cursor 模式同源.
  const salesById = new Map(salesUsers.map((item) => [item.id, item]));
  const teamsById = new Map(teams.map((item) => [item.id, item]));
  const teamId =
    actor.role === "ADMIN"
      ? teamsById.has(parsedFilters.teamId)
        ? parsedFilters.teamId
        : salesById.get(parsedFilters.salesId)?.teamId ?? ""
      : actor.teamId ?? "";
  const salesId = (() => {
    if (actor.role === "SALES") {
      return actor.id;
    }
    const selectedSales = salesById.get(parsedFilters.salesId);
    if (!selectedSales) return "";
    if (teamId && selectedSales.teamId !== teamId) return "";
    return selectedSales.id;
  })();
  const filters: CustomerCenterFilters = {
    queue: parsedFilters.queue,
    executionClasses: parsedFilters.executionClasses,
    grades: parsedFilters.grades,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    assignedFrom: parsedFilters.assignedFrom,
    assignedTo: parsedFilters.assignedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  // 构造 page-mode list query 的 SQL where.
  //
  // 历史问题 (2026-06-08 hotfix): 早期版本只把 search/owner/team/grade 推到 SQL,
  // 其余 filter (productKeys / tagIds / assignedRange / executionClasses) 留作
  // "派生过滤, 不进 SQL, 由 UI 行内徽章自然降噪". 但 page-mode 用 OFFSET/LIMIT
  // 做真分页, 内存 filter 只能 filter 当前页 50 行, 整页全部命中后 totalCount
  // 也不准 (用户截图: 选了商品/分级仍然显示全部 5479). 故现在 product / tag /
  // assignedRange / executionClass 都翻译成 SQL 等价表达式, count + findMany 用
  // 同一个 listWhere, totalCount 与 page 一致.
  //
  // 已知降级 (见每个 clause 上方注释):
  //   - assignedRange 暂以 customer.createdAt 替代真实 ownershipEvent.createdAt 窗口
  //   - executionClass D 退化为 "其它"  (无成交 / 无加微 / 无邀请 / 无拒微)
  //   - queue 派生 (除 "all" 和 "new_imported") 在 SQL 分页下不真正生效,
  //     console.warn 留信号
  const listFilterClauses: Prisma.CustomerWhereInput[] = [];
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    listFilterClauses.push({
      OR: [
        { name: { contains: term } },
        { phone: { contains: term } },
        { remark: { contains: term } },
      ],
    });
  }
  if (filters.salesId) {
    listFilterClauses.push({ ownerId: filters.salesId });
  }
  if (filters.teamId) {
    listFilterClauses.push({ owner: { is: { teamId: filters.teamId } } });
  }
  if (filters.grades.length > 0) {
    listFilterClauses.push({ grade: { in: filters.grades } });
  }

  // productKeys: UI 端是 `${source}:${normalized_label}` 形式 (source ∈ {interested,
  // purchased}, label 是去空格小写). SQL 端只能按 label 做精确 / 包含匹配 — 不
  // 拆 source 前缀, 也忽略 normalize (lowercase + 单空格折叠), 因为生产数据本
  // 来就是原样存入. 实际命中率 = (lead.interestedProduct ∈ labels) OR
  // (salesOrder.items.productNameSnapshot ∈ labels). 若 normalize 差异导致命中
  // 漏掉, UI 端会自然看到 "选了仍命中 0", 用户重新选即可.
  if (filters.productKeys.length > 0) {
    const labels = filters.productKeys
      .map((key) => {
        const colonIdx = key.indexOf(":");
        return colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
      })
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (labels.length > 0) {
      listFilterClauses.push({
        OR: [
          { leads: { some: { interestedProduct: { in: labels } } } },
          {
            salesOrders: {
              some: { items: { some: { productNameSnapshot: { in: labels } } } },
            },
          },
        ],
      });
    }
  }
  if (filters.productKeyword && filters.productKeyword.trim().length > 0) {
    const keyword = filters.productKeyword.trim();
    listFilterClauses.push({
      OR: [
        { leads: { some: { interestedProduct: { contains: keyword } } } },
        {
          salesOrders: {
            some: { items: { some: { productNameSnapshot: { contains: keyword } } } },
          },
        },
      ],
    });
  }

  // tagIds: SQL where = `customerTags.some.tagId in (...)`. 与内存版本语义一致.
  if (filters.tagIds.length > 0) {
    listFilterClauses.push({
      customerTags: { some: { tagId: { in: filters.tagIds } } },
    });
  }

  // assignedRange (assignedFrom / assignedTo): 真相 = CustomerOwnershipEvent /
  // LeadAssignment 的 createdAt (分配/接手时间), 不是 customer.createdAt — 老客户
  // 今天重分配时 createdAt 是旧的, 用 createdAt 会让 "分配时间=今天" 漏掉它.
  // 走 buildAssignedRangeCustomerWhereInput 与 streaming 路径 + 内存 assignedAt 同源.
  const assignedRangeWhere = buildAssignedRangeCustomerWhereInput(
    filters.assignedFrom,
    filters.assignedTo,
    filters.salesId,
  );
  if (assignedRangeWhere) {
    listFilterClauses.push(assignedRangeWhere);
  }

  // executionClasses (A/B/C/D/E): 派生 (deriveCustomerExecutionClassFromSignals)
  // 在内存里依赖 latestCall + tradeOrder/salesOrder 全集 + wechat / live 状态. SQL
  // 端直接复刻 latestCall 排序成本高, 这里给出每个 class 的 "实质必要条件":
  //   A 已成交:   tradeOrders.some(tradeStatus=APPROVED) OR
  //               salesOrders.some(reviewStatus=APPROVED)
  //   B 已加微:   非 A 且 (wechatRecords.some(addedStatus=ADDED) OR
  //                            callRecords.some(result=WECHAT_ADDED))
  //   C 已邀约:   非 A 且 liveInvitations.some({})
  //   D 未接通:   非 A/B/C/E (默认兜底 — 这里表示成 "其它")
  //   E 拒加:     callRecords.some(result=REFUSED_WECHAT) — 内存版本要求是
  //               最新 callRecord 才算 E, SQL 这里近似为 "曾经有拒微通话"; 极少
  //               数客户 (拒微后又被重新打电话, 转入其它状态) 会被 SQL 误识为
  //               E. 业务可接受.
  // 多选时 executionClasses 用 OR 合并各 class 的 SQL where 片段.
  if (filters.executionClasses.length > 0) {
    const classClauses: Prisma.CustomerWhereInput[] = [];
    const approvedDealWhere: Prisma.CustomerWhereInput = {
      OR: [
        { tradeOrders: { some: { tradeStatus: TradeOrderStatus.APPROVED } } },
        { salesOrders: { some: { reviewStatus: SalesOrderReviewStatus.APPROVED } } },
      ],
    };
    const successfulWechatWhere: Prisma.CustomerWhereInput = {
      OR: [
        { wechatRecords: { some: { addedStatus: WechatAddStatus.ADDED } } },
        { callRecords: { some: { result: CallResult.WECHAT_ADDED } } },
      ],
    };
    const liveInvitationWhere: Prisma.CustomerWhereInput = {
      liveInvitations: { some: {} },
    };
    const refusedWechatWhere: Prisma.CustomerWhereInput = {
      callRecords: { some: { result: CallResult.REFUSED_WECHAT } },
    };
    for (const cls of filters.executionClasses) {
      switch (cls) {
        case "A":
          classClauses.push(approvedDealWhere);
          break;
        case "B":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              successfulWechatWhere,
            ],
          });
          break;
        case "C":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              liveInvitationWhere,
            ],
          });
          break;
        case "D":
          classClauses.push({
            AND: [
              { NOT: approvedDealWhere },
              { NOT: refusedWechatWhere },
              { NOT: successfulWechatWhere },
              { NOT: liveInvitationWhere },
            ],
          });
          break;
        case "E":
          classClauses.push({
            AND: [{ NOT: approvedDealWhere }, refusedWechatWhere],
          });
          break;
      }
    }
    if (classClauses.length > 0) {
      listFilterClauses.push({ OR: classClauses });
    }
  }

  // queue 派生过滤: 复用 buildQueueCustomerWhereInput 与 sidebar aggregate 同源,
  // queueCounts 与 listTotalCount 用同一份 SQL where. now 用于 pending_follow_up
  // 相对窗口. (migration_pending_follow_up 仍 fallthrough, 概览本身也是 0.)
  const queueWhere = buildQueueCustomerWhereInput(
    filters.queue,
    todayStart,
    todayEnd,
    now,
  );
  if (queueWhere) {
    listFilterClauses.push(queueWhere);
  }

  const listWhere: Prisma.CustomerWhereInput = {
    AND: [
      visibleWhere,
      ...(recycledCustomerIds.length > 0
        ? [
            {
              id: { notIn: recycledCustomerIds },
            } satisfies Prisma.CustomerWhereInput,
          ]
        : []),
      ...listFilterClauses,
    ],
  };

  // SQL aggregate + 总数 + 当前页并行.
  const pageSize = filters.pageSize;
  const requestedPage = filters.page;
  const [aggregate, listTotalCount] = await Promise.all([
    getCustomerCenterStatsAggregate({
      actor,
      visibleWhere,
      recycledCustomerIds,
      now,
      todayStart,
      todayEnd,
    }),
    prisma.customer.count({ where: listWhere }),
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotalCount / pageSize));
  const currentPage = Math.max(1, Math.min(requestedPage, totalPages));
  const skip = (currentPage - 1) * pageSize;

  const pageSnapshots: CustomerSnapshot[] = await prisma.customer.findMany({
    where: listWhere,
    orderBy: CUSTOMER_CENTER_LIST_ORDER_BY,
    skip,
    take: pageSize,
    select: customerSnapshotSelect,
  });

  // scope stats 派生 (ADMIN salesId/teamId / SUPERVISOR salesId|team / SALES self).
  const emptyScope: CustomerCenterStatsScope = {
    customerCount: 0,
    todayNewCustomerCount: 0,
    todayNewImportedCount: 0,
    pendingFirstCallCount: 0,
    pendingDialCount: 0,
    pendingFollowUpCount: 0,
    pendingWechatCount: 0,
    wechatAddedCount: 0,
    pendingInvitationCount: 0,
    pendingDealCount: 0,
    latestFollowUpAt: null,
  };
  const scopeStats: CustomerCenterStatsScope = filters.salesId
    ? aggregate.byOwner.get(filters.salesId) ?? emptyScope
    : filters.teamId
      ? aggregate.byTeam.get(filters.teamId) ?? emptyScope
      : aggregate.global;

  // 当前页 stateMap (只算页内 ≤pageSize, 不再 5826).
  const [pageImportMap, pageAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(pageSnapshots.map((s) => s.id)),
    getLatestCustomerAssignmentMap(pageSnapshots),
  ]);
  const stateMap = new Map<string, CustomerSnapshotState>(
    pageSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(
        snapshot,
        pageImportMap.get(snapshot.id)?.createdAt ?? null,
        pageAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );

  const summary: CustomerSummaryStats = {
    customerCount: scopeStats.customerCount,
    todayNewCustomerCount: scopeStats.todayNewCustomerCount,
    todayNewImportedCount: scopeStats.todayNewImportedCount,
    todayAssignedCount: 0,
    pendingFirstCallCount: scopeStats.pendingFirstCallCount,
    pendingFollowUpCount: scopeStats.pendingFollowUpCount,
    pendingWechatCount: scopeStats.pendingWechatCount,
    pendingInvitationCount: scopeStats.pendingInvitationCount,
    pendingDealCount: scopeStats.pendingDealCount,
    migrationPendingFollowUpCount: 0,
    executionClassCounts: aggregate.executionClassCounts,
    latestFollowUpAt: scopeStats.latestFollowUpAt,
  };

  const queueCounts: Record<CustomerQueueKey, number> = {
    all: scopeStats.customerCount,
    new_imported: scopeStats.todayNewImportedCount,
    pending_first_call: scopeStats.pendingFirstCallCount,
    pending_dial: scopeStats.pendingDialCount,
    pending_follow_up: scopeStats.pendingFollowUpCount,
    pending_wechat: scopeStats.pendingWechatCount,
    wechat_added: scopeStats.wechatAddedCount,
    pending_invitation: scopeStats.pendingInvitationCount,
    pending_deal: scopeStats.pendingDealCount,
    migration_pending_follow_up: 0,
  };

  const teamOverview: TeamOverviewItem[] = teams.map((team) => {
    const stats = aggregate.byTeam.get(team.id) ?? emptyScope;
    const salesCount = salesUsers.filter((s) => s.teamId === team.id).length;
    return {
      id: team.id,
      code: team.code,
      name: team.name,
      description: team.description,
      supervisor: team.supervisor,
      salesCount,
      customerCount: stats.customerCount,
      todayNewImportedCount: stats.todayNewImportedCount,
      pendingFirstCallCount: stats.pendingFirstCallCount,
      pendingFollowUpCount: stats.pendingFollowUpCount,
      pendingInvitationCount: stats.pendingInvitationCount,
      pendingDealCount: stats.pendingDealCount,
      migrationPendingFollowUpCount: 0,
    };
  });

  const salesBoard: SalesRepBoardItem[] = salesUsers
    .filter((item) => !filters.teamId || item.teamId === filters.teamId)
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });

  // 批量"移交所有人"目标候选: 与 salesBoard 同构, 但不应用 filters.teamId.
  // 见 `CustomerCenterData.transferableOwners` 注释.
  const transferableOwners: SalesRepBoardItem[] = salesUsers
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      const leftTeam = left.teamName ?? "";
      const rightTeam = right.teamName ?? "";
      const teamCmp = leftTeam.localeCompare(rightTeam, "zh-CN");
      if (teamCmp !== 0) return teamCmp;
      return left.name.localeCompare(right.name, "zh-CN");
    });

  // productOptions / tagOptions 走当前页 snapshot (≤pageSize). UI 下拉再 top 10.
  const productOptions = buildProductFilterOptions(pageSnapshots);
  const tagOptions = buildTagFilterOptions(pageSnapshots, activeTags);

  const selectedTeam =
    filters.teamId !== ""
      ? teamOverview.find((item) => item.id === filters.teamId) ?? null
      : actor.role === "SUPERVISOR"
        ? teamOverview[0] ?? null
        : null;
  const selectedSales =
    filters.salesId !== ""
      ? salesBoard.find((item) => item.id === filters.salesId) ?? null
      : actor.role === "SALES"
        ? salesBoard.find((item) => item.id === actor.id) ?? null
        : null;

  const pageCustomerIds = pageSnapshots.map((item) => item.id);
  const [queueItems, callResultOptions] = await Promise.all([
    fetchCustomerListItems(pageCustomerIds, stateMap),
    getEnabledCallResultOptions(),
  ]);
  const phoneSearchDisclosures = await getPhoneSearchOwnershipDisclosures({
    actor,
    search: filters.search,
    visibleCustomerIds,
    recycledCustomerIds,
  });

  return {
    actor,
    filters: {
      ...filters,
      page: currentPage,
    },
    scopeMode:
      actor.role === "ADMIN"
        ? filters.salesId
          ? "sales"
          : filters.teamId
            ? "team"
            : "organization"
        : actor.role === "SUPERVISOR"
          ? actor.teamId
            ? filters.salesId
              ? "sales"
              : "team"
            : "team_unassigned"
          : "personal",
    selectedTeam,
    selectedSales,
    summary,
    queueCounts,
    teamOverview,
    salesBoard,
    transferableOwners,
    productOptions,
    tagOptions,
    callResultOptions,
    queueItems,
    phoneSearchDisclosures,
    pagination: {
      page: currentPage,
      pageSize,
      totalCount: listTotalCount,
      totalPages,
      mode: "page",
    },
  } satisfies CustomerCenterData;
}

/**
 * Server-side cursor 分页入口 (F08 phase 1.5).
 *
 * 与 `getCustomerCenterData` 并存, 不改变后者签名 / 调用方:
 *   - 排序: `[updatedAt desc, id desc]` (走 cust_owner_updated_id_idx).
 *   - 翻页: keyset, where `(updatedAt < cursor.updatedAt)
 *     OR (updatedAt = cursor.updatedAt AND id < cursor.id)`.
 *   - take = pageSize + 1, 末尾 1 个仅作为 hasMore 标记, 不返回给 UI.
 *
 * select 在 `customerSnapshotSelect` 基础上加一个 `updatedAt` 字段以便生
 * 成 nextCursor; `customerSnapshotSelect` 本体不动, UI 端 (CustomerListItem)
 * 不需要兼容新字段.
 *
 * 仅暴露能在 SQL 直接表达的过滤字段 (search by name/phone/remark, ownerId,
 * teamId, ownershipModes). 派生态过滤 (executionClass / queue / tag / product)
 * 走原 `getCustomerCenterData`, 这里不重复造轮子.
 */
export type ListCustomersCursorFilters = {
  /** 客户姓名 / 电话 / 备注 模糊匹配, 与 legacy `matchesCustomerSearch` 一致语义. */
  search?: string;
  /** 限定具体 owner (用于「我名下」/ 销售选人 / 自定义视图). */
  ownerId?: string;
  /** 限定所属团队 (admin / supervisor 视角). */
  teamId?: string;
  /** 限定 ownershipMode, 默认沿用 active 集合 (PRIVATE + LOCKED). */
  ownershipModes?: CustomerOwnershipMode[];
  /** Wave 7-B 客户分级 multi-select. 空数组 / undefined = 不过滤. */
  grades?: CustomerGrade[];
  /**
   * Wave 9 hotfix: 把 page-mode 的高级 filter (productKeys / productKeyword /
   * tagIds / assignedFrom / assignedTo / executionClasses / queue) 也透给
   * cursor 模式. 不提供时不过滤. 与 page-mode SQL where 同源, 由
   * `buildCustomerCenterListFilterClauses` 统一翻译.
   *
   * `todayStart` / `todayEnd` 仅在 `queue === "new_imported"` 时使用; 其它
   * queue 在 SQL 分页下不真正生效 (与 page-mode 一致, 仅 console.warn).
   */
  advanced?: {
    productKeys?: string[];
    productKeyword?: string;
    tagIds?: string[];
    assignedFrom?: string;
    assignedTo?: string;
    executionClasses?: CustomerExecutionClass[];
    queue?: CustomerQueueKey;
    todayStart?: Date;
    todayEnd?: Date;
  };
};

export type ListCustomersCursorResult = {
  items: CustomerSnapshot[];
  nextCursor: CustomerListCursor | null;
};

export async function listCustomersCursor(
  viewer: CustomerViewer,
  options: {
    cursor?: CustomerListCursor | null;
    pageSize?: number;
    filters?: ListCustomersCursorFilters;
  } = {},
): Promise<ListCustomersCursorResult> {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const recycledCustomerIds = await listActiveCustomerIds(prisma);

  const cursor = options.cursor ?? null;
  // 默认 50, clamp 到 [1, 200], 避免恶意客户端请求大批量
  const requestedSize = options.pageSize ?? 50;
  const pageSize = Math.max(1, Math.min(200, Math.floor(requestedSize)));

  const filters = options.filters ?? {};
  const filterClauses: Prisma.CustomerWhereInput[] = [];

  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim();
    filterClauses.push({
      OR: [
        { name: { contains: term } },
        { phone: { contains: term } },
        { remark: { contains: term } },
      ],
    });
  }

  if (filters.ownerId) {
    filterClauses.push({ ownerId: filters.ownerId });
  }

  if (filters.teamId) {
    filterClauses.push({ owner: { is: { teamId: filters.teamId } } });
  }

  if (filters.ownershipModes && filters.ownershipModes.length > 0) {
    filterClauses.push({
      ownershipMode: { in: filters.ownershipModes },
    });
  }

  // Wave 7-B: 客户分级 SQL 直接走 grade 列 (有 cust_grade_idx 索引).
  if (filters.grades && filters.grades.length > 0) {
    filterClauses.push({
      grade: { in: filters.grades },
    });
  }

  // Wave 9 hotfix: 把 page-mode 的高级 filter SQL clauses 透给 cursor 模式.
  // 走 `buildCustomerCenterListFilterClauses` 共用 helper, 行为一致.
  // 与 page-mode 共享同样的已知降级 (见 helper 注释): assignedRange 用
  // customer.createdAt 替代, executionClass D 退化为 "其它", queue 仅
  // all / new_imported 真正生效, 其余 queue 仅 console.warn.
  //
  // 注意 ownerId/teamId/search/grades 上面已经手动 push, 这里只补 advanced
  // 里 cursor 类型不覆盖的字段 (productKeys / productKeyword / tagIds /
  // assignedFrom / assignedTo / executionClasses / queue), 避免 search /
  // owner / team / grades 在 SQL where 里重复.
  if (filters.advanced) {
    const adv = filters.advanced;
    const advancedClauses = buildCustomerCenterListFilterClauses({
      filters: {
        queue: adv.queue ?? "all",
        executionClasses: adv.executionClasses ?? [],
        grades: [],
        teamId: "",
        salesId: "",
        search: "",
        productKeys: adv.productKeys ?? [],
        productKeyword: adv.productKeyword ?? "",
        tagIds: adv.tagIds ?? [],
        assignedFrom: adv.assignedFrom ?? "",
        assignedTo: adv.assignedTo ?? "",
        page: 1,
        pageSize: CUSTOMERS_PAGE_SIZE,
      },
      todayStart: adv.todayStart ?? new Date(0),
      todayEnd: adv.todayEnd ?? new Date(0),
    });
    if (advancedClauses.length > 0) {
      filterClauses.push(...advancedClauses);
    }
  }

  // cursor 翻页条件: keyset `(updatedAt, id) < (cursor.updatedAt, cursor.id)`
  if (cursor) {
    const cursorUpdatedAt = new Date(cursor.updatedAt);
    filterClauses.push({
      OR: [
        { updatedAt: { lt: cursorUpdatedAt } },
        {
          updatedAt: cursorUpdatedAt,
          id: { lt: cursor.id },
        },
      ],
    });
  }

  const rows = await prisma.customer.findMany({
    where: {
      AND: [
        visibleWhere,
        ...(recycledCustomerIds.length > 0
          ? [
              {
                id: { notIn: recycledCustomerIds },
              } satisfies Prisma.CustomerWhereInput,
            ]
          : []),
        ...filterClauses,
      ],
    },
    // cursor (keyset) fallback 仍按 updatedAt — cursor 编码的就是 updatedAt,
    // 改排序需同步改 codec + WHERE. 但分页 UI 已切到 page-number 按钮 (page
    // mode), 不再生成 `?cursor=` URL, 此路径正常导航不可达. 默认可见列表
    // (page mode, 上面 CUSTOMER_CENTER_LIST_ORDER_BY) 已按导入顺序固定.
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    select: {
      ...customerSnapshotSelect,
      updatedAt: true,
    },
  });

  // 末尾 1 条仅用于判断 hasMore, 不返回给 UI
  const hasMore = rows.length > pageSize;
  const slice = hasMore ? rows.slice(0, pageSize) : rows;
  const tail = slice[slice.length - 1];
  const nextCursor: CustomerListCursor | null =
    hasMore && tail
      ? {
          updatedAt: tail.updatedAt.toISOString(),
          id: tail.id,
        }
      : null;

  // 剥掉 cursor 用的 updatedAt 字段, 保持返回类型与 `customerSnapshotSelect`
  // 严格一致 (CustomerSnapshot), 避免下游 UI 拿到非声明字段.
  const items: CustomerSnapshot[] = slice.map((row) => {
    const rest: Record<string, unknown> = { ...row };
    delete rest.updatedAt;
    return rest as unknown as CustomerSnapshot;
  });

  return { items, nextCursor };
}

/**
 * F17 customers/perf phase 2: 客户中心 cursor 模式入口 (根治版).
 *
 * 旧实现仍调 `getCustomerCenterWorkspaceBase` 拿 5826 customerSnapshots +
 * stateMap, 卡在内存 reduce. 新实现:
 *   1. 列表只取当前页 50 行 (`listCustomersCursor`).
 *   2. summary / queueCounts / teamOverview / salesBoard 走 SQL aggregate
 *      (`getCustomerCenterStatsAggregate`), 不再依赖全量 snapshot.
 *   3. stateMap 仅为当前页 50 行计算 (`getCustomerSnapshotState`).
 *   4. productOptions / tagOptions 走当前页 + activeTags 列表; UI 下拉只
 *      取 top 10, 不影响交互.
 *
 * 与 `getCustomerCenterData` (legacy page mode) 行为差异 (可接受):
 *   - sidebar 概览 pendingInvitation / pendingDeal 略偏大 (不再 executionClass
 *     D/E 排除); 列表行内徽章仍精确, 不影响销售决策.
 *   - migration_pending_follow_up 队列概览暂为 0 (OperationLog join 太重);
 *     列表行内派生仍可用.
 *   - executionClassCounts 概览暂为 0; 列表行内派生 (grade / executionClass)
 *     仍可用. 后续如果有人盯这块, 可以补 groupBy(grade) + 信号近似.
 *   - productOptions / tagOptions 是当前页 (≤50 行) 视野; filter 下拉本来就
 *     截取 top 10, 影响几乎为 0.
 */
export async function getCustomerCenterDataCursor(
  viewer: CustomerViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
  cursor: CustomerListCursor | null,
): Promise<CustomerCenterData> {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const parsedFilters = parseCustomerCenterFilters(rawSearchParams);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // 并行: teams / salesUsers / recycled-ids / visible-ids / aggregate /
  // activeTags. 都已经独立 60s 缓存, 不再走 5826 全量 snapshot.
  const [
    teams,
    salesUsers,
    recycledCustomerIds,
    visibleCustomerIds,
    activeTags,
  ] = await Promise.all([
    loadCustomerCenterTeamsCached({
      scope: actor.role === "ADMIN" ? "ADMIN" : "OWN_TEAM",
      teamId: actor.role === "ADMIN" ? null : actor.teamId,
    }),
    loadCustomerCenterSalesUsersCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      viewerId: actor.role === "SALES" ? actor.id : null,
    }),
    loadRecycledCustomerIdsCached(),
    loadVisibleCustomerIdsCached({
      scope:
        actor.role === "ADMIN"
          ? "ADMIN"
          : actor.role === "SUPERVISOR"
            ? "SUPERVISOR"
            : "SALES",
      teamId: actor.role === "SUPERVISOR" ? actor.teamId : null,
      ownerId: actor.role === "SALES" ? actor.id : null,
    }),
    getActiveTagOptions(),
  ]);

  // filter 校验 (teamId / salesId 必须落在 viewer 视野). 逻辑保持与
  // `getCustomerCenterWorkspaceBase` 完全一致, 这里不通过它拿数据, 仅复用
  // parse 输出.
  const salesById = new Map(salesUsers.map((item) => [item.id, item]));
  const teamsById = new Map(teams.map((item) => [item.id, item]));
  const teamId =
    actor.role === "ADMIN"
      ? teamsById.has(parsedFilters.teamId)
        ? parsedFilters.teamId
        : salesById.get(parsedFilters.salesId)?.teamId ?? ""
      : actor.teamId ?? "";
  const salesId = (() => {
    if (actor.role === "SALES") {
      return actor.id;
    }
    const selectedSales = salesById.get(parsedFilters.salesId);
    if (!selectedSales) return "";
    if (teamId && selectedSales.teamId !== teamId) return "";
    return selectedSales.id;
  })();
  const filters: CustomerCenterFilters = {
    queue: parsedFilters.queue,
    executionClasses: parsedFilters.executionClasses,
    grades: parsedFilters.grades,
    teamId,
    salesId,
    search: parsedFilters.search,
    productKeys: parsedFilters.productKeys,
    productKeyword: parsedFilters.productKeyword,
    tagIds: parsedFilters.tagIds,
    assignedFrom: parsedFilters.assignedFrom,
    assignedTo: parsedFilters.assignedTo,
    page: parsedFilters.page,
    pageSize: parsedFilters.pageSize,
  };

  // SQL aggregate + 当前页 cursor list 并行.
  const [aggregate, cursorResult] = await Promise.all([
    getCustomerCenterStatsAggregate({
      actor,
      visibleWhere,
      recycledCustomerIds,
      now,
      todayStart,
      todayEnd,
    }),
    listCustomersCursor(viewer, {
      cursor,
      pageSize: filters.pageSize,
      filters: {
        search: filters.search || undefined,
        ownerId: filters.salesId || undefined,
        teamId: filters.teamId || undefined,
        grades: filters.grades.length > 0 ? filters.grades : undefined,
        // Wave 9 hotfix (2026-06-09): 把 productKeys / productKeyword / tagIds /
        // assignedFrom / assignedTo / executionClasses / queue 透给 cursor 模式
        // SQL where. 之前这里 silently drop, 导致 ?cursor=xxx&tagIds=abc 的列表
        // 只按 grade 过滤, 工具栏 chip 显示生效但实际不生效, 书签 / 分享链接不可信.
        advanced: {
          productKeys: filters.productKeys,
          productKeyword: filters.productKeyword,
          tagIds: filters.tagIds,
          assignedFrom: filters.assignedFrom,
          assignedTo: filters.assignedTo,
          executionClasses: filters.executionClasses,
          queue: filters.queue,
          todayStart,
          todayEnd,
        },
      },
    }),
  ]);

  // scope 派生: ADMIN 用 salesId/teamId, SUPERVISOR 用 salesId 或团队默认,
  // SALES 用自己. 直接从 aggregate 里挑对应 scope.
  const emptyScope: CustomerCenterStatsScope = {
    customerCount: 0,
    todayNewCustomerCount: 0,
    todayNewImportedCount: 0,
    pendingFirstCallCount: 0,
    pendingDialCount: 0,
    pendingFollowUpCount: 0,
    pendingWechatCount: 0,
    wechatAddedCount: 0,
    pendingInvitationCount: 0,
    pendingDealCount: 0,
    latestFollowUpAt: null,
  };
  const scopeStats: CustomerCenterStatsScope = filters.salesId
    ? aggregate.byOwner.get(filters.salesId) ?? emptyScope
    : filters.teamId
      ? aggregate.byTeam.get(filters.teamId) ?? emptyScope
      : aggregate.global;

  // 当前页 50 行的 stateMap (只算页内, 不再 5826).
  const pageSnapshots = cursorResult.items;
  const [pageImportMap, pageAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(pageSnapshots.map((s) => s.id)),
    getLatestCustomerAssignmentMap(pageSnapshots),
  ]);
  const stateMap = new Map<string, CustomerSnapshotState>(
    pageSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotState(
        snapshot,
        pageImportMap.get(snapshot.id)?.createdAt ?? null,
        pageAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );

  // summary: 用 scopeStats + executionClassCounts (聚合层暂空), latestFollowUp.
  const summary: CustomerSummaryStats = {
    customerCount: scopeStats.customerCount,
    todayNewCustomerCount: scopeStats.todayNewCustomerCount,
    todayNewImportedCount: scopeStats.todayNewImportedCount,
    todayAssignedCount: 0, // SQL aggregate 暂不算 (需要 OperationLog/Assignment join), 列表行内仍精确
    pendingFirstCallCount: scopeStats.pendingFirstCallCount,
    pendingFollowUpCount: scopeStats.pendingFollowUpCount,
    pendingWechatCount: scopeStats.pendingWechatCount,
    pendingInvitationCount: scopeStats.pendingInvitationCount,
    pendingDealCount: scopeStats.pendingDealCount,
    migrationPendingFollowUpCount: 0,
    executionClassCounts: aggregate.executionClassCounts,
    latestFollowUpAt: scopeStats.latestFollowUpAt,
  };

  const queueCounts: Record<CustomerQueueKey, number> = {
    all: scopeStats.customerCount,
    new_imported: scopeStats.todayNewImportedCount,
    pending_first_call: scopeStats.pendingFirstCallCount,
    pending_dial: scopeStats.pendingDialCount,
    pending_follow_up: scopeStats.pendingFollowUpCount,
    pending_wechat: scopeStats.pendingWechatCount,
    wechat_added: scopeStats.wechatAddedCount,
    pending_invitation: scopeStats.pendingInvitationCount,
    pending_deal: scopeStats.pendingDealCount,
    migration_pending_follow_up: 0,
  };

  const teamOverview: TeamOverviewItem[] = teams.map((team) => {
    const stats = aggregate.byTeam.get(team.id) ?? emptyScope;
    // salesCount 用 salesUsers 里属于该 team 的活跃销售数 (与 legacy 一致语义).
    const salesCount = salesUsers.filter((s) => s.teamId === team.id).length;
    return {
      id: team.id,
      code: team.code,
      name: team.name,
      description: team.description,
      supervisor: team.supervisor,
      salesCount,
      customerCount: stats.customerCount,
      todayNewImportedCount: stats.todayNewImportedCount,
      pendingFirstCallCount: stats.pendingFirstCallCount,
      pendingFollowUpCount: stats.pendingFollowUpCount,
      pendingInvitationCount: stats.pendingInvitationCount,
      pendingDealCount: stats.pendingDealCount,
      migrationPendingFollowUpCount: 0,
    };
  });

  const salesBoard: SalesRepBoardItem[] = salesUsers
    .filter((item) => !filters.teamId || item.teamId === filters.teamId)
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });

  // 批量"移交所有人"目标候选: 与 salesBoard 同构, 但不应用 filters.teamId.
  // 见 `CustomerCenterData.transferableOwners` 注释.
  const transferableOwners: SalesRepBoardItem[] = salesUsers
    .map((sales) => {
      const stats = aggregate.byOwner.get(sales.id) ?? emptyScope;
      return {
        id: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayNewImportedCount: stats.todayNewImportedCount,
        pendingFirstCallCount: stats.pendingFirstCallCount,
        pendingFollowUpCount: stats.pendingFollowUpCount,
        pendingDealCount: stats.pendingDealCount,
        migrationPendingFollowUpCount: 0,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      const leftTeam = left.teamName ?? "";
      const rightTeam = right.teamName ?? "";
      const teamCmp = leftTeam.localeCompare(rightTeam, "zh-CN");
      if (teamCmp !== 0) return teamCmp;
      return left.name.localeCompare(right.name, "zh-CN");
    });

  // productOptions / tagOptions 走当前页 snapshot (≤50). UI 下拉再 top 10.
  const productOptions = buildProductFilterOptions(pageSnapshots);
  const tagOptions = buildTagFilterOptions(pageSnapshots, activeTags);

  const selectedTeam =
    filters.teamId !== ""
      ? teamOverview.find((item) => item.id === filters.teamId) ?? null
      : actor.role === "SUPERVISOR"
        ? teamOverview[0] ?? null
        : null;
  const selectedSales =
    filters.salesId !== ""
      ? salesBoard.find((item) => item.id === filters.salesId) ?? null
      : actor.role === "SALES"
        ? salesBoard.find((item) => item.id === actor.id) ?? null
        : null;

  const cursorIds = pageSnapshots.map((item) => item.id);
  const [queueItems, callResultOptions] = await Promise.all([
    fetchCustomerListItems(cursorIds, stateMap),
    getEnabledCallResultOptions(),
  ]);
  const phoneSearchDisclosures = await getPhoneSearchOwnershipDisclosures({
    actor,
    search: filters.search,
    visibleCustomerIds,
    recycledCustomerIds,
  });

  const encodedNextCursor = cursorResult.nextCursor
    ? encodeCustomerListCursor(cursorResult.nextCursor)
    : null;
  const encodedCurrentCursor = cursor ? encodeCustomerListCursor(cursor) : null;

  return {
    actor,
    filters: {
      ...filters,
      // cursor 模式 page 概念不再连续, 固定写 1, UI 不展示页码.
      page: 1,
    },
    scopeMode:
      actor.role === "ADMIN"
        ? filters.salesId
          ? "sales"
          : filters.teamId
            ? "team"
            : "organization"
        : actor.role === "SUPERVISOR"
          ? actor.teamId
            ? filters.salesId
              ? "sales"
              : "team"
            : "team_unassigned"
          : "personal",
    selectedTeam,
    selectedSales,
    summary,
    queueCounts,
    teamOverview,
    salesBoard,
    transferableOwners,
    productOptions,
    tagOptions,
    callResultOptions,
    queueItems,
    phoneSearchDisclosures,
    pagination: {
      page: 1,
      pageSize: filters.pageSize,
      // cursor 模式不实时算 totalCount, 用 scope 的 SQL count 当总数.
      totalCount: scopeStats.customerCount,
      totalPages: 1,
      mode: "cursor",
      nextCursor: encodedNextCursor,
      currentCursor: encodedCurrentCursor,
    },
  } satisfies CustomerCenterData;
}

export async function getCustomerOperatingDashboardData(
  viewer: CustomerViewer,
  rawSearchParams?: Record<string, SearchParamsValue> | undefined,
): Promise<CustomerOperatingDashboardData> {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerDashboardVisibilityWhereInput(actor);
  const recycledCustomerIds = await listActiveCustomerIds(prisma);
  const [teams, salesUsers, customerSnapshots] = await Promise.all([
    actor.role === "ADMIN"
      ? prisma.team.findMany({
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            supervisor: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        })
      : actor.teamId
        ? prisma.team.findMany({
            where: { id: actor.teamId },
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              supervisor: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        role: {
          code: "SALES",
        },
        username: {
          notIn: [...hiddenDashboardSalesUsernames],
        },
        userStatus: "ACTIVE",
        ...(actor.role === "ADMIN"
          ? {}
          : actor.teamId
            ? { teamId: actor.teamId }
            : actor.role === "SALES"
              ? { id: actor.id }
              : { id: "__missing_team_scope__" }),
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
            code: true,
          },
        },
      },
    }),
    prisma.customer.findMany({
      where: {
        AND: [
          visibleWhere,
          ...(recycledCustomerIds.length > 0
            ? [
                {
                  id: {
                    notIn: recycledCustomerIds,
                  },
                } satisfies Prisma.CustomerWhereInput,
              ]
            : []),
        ],
      },
      select: customerDashboardSnapshotSelect,
    }),
  ]);
  const [latestCustomerImportMap, latestCustomerAssignmentMap] = await Promise.all([
    getLatestCustomerImportMap(customerSnapshots.map((snapshot) => snapshot.id)),
    getLatestCustomerAssignmentMap(customerSnapshots),
  ]);
  const now = new Date();
  const dashboardRange = parseDashboardDateRange(rawSearchParams);
  const todayStart = dashboardRange.rangeStart;
  const todayEnd = dashboardRange.rangeEnd;
  const stateMap = new Map(
    customerSnapshots.map((snapshot) => [
      snapshot.id,
      getCustomerSnapshotCoreState(
        snapshot,
        latestCustomerImportMap.get(snapshot.id)?.createdAt ?? null,
        latestCustomerAssignmentMap.get(snapshot.id) ?? null,
        now,
        todayStart,
        todayEnd,
      ),
    ]),
  );
  const scopeSalesUsers = salesUsers;
  const scopeLabel =
    actor.role === "ADMIN"
      ? "组织范围"
      : actor.role === "SUPERVISOR"
        ? teams[0]?.name ?? "团队范围"
        : teams[0]?.name ?? "个人范围";
  const asOfDateLabel = dashboardRange.periodLabel;
  const metricPeriodLabel = dashboardRange.from === dashboardRange.to ? "当日" : "期间";
  const metricPeriodNote = dashboardRange.from === dashboardRange.to ? "当日" : "筛选期内";

  if (scopeSalesUsers.length === 0) {
    return {
      scopeLabel,
      asOfDateLabel,
      periodLabel: dashboardRange.periodLabel,
      filters: {
        from: dashboardRange.from,
        to: dashboardRange.to,
      },
      summary: [
        {
          label: `${metricPeriodLabel}分配`,
          value: "0",
          note: `${asOfDateLabel} 暂无在岗销售进入驾驶舱统计口径。`,
          emphasis: "info",
        },
      ],
      employees: [],
    };
  }

  const salesUserIds = scopeSalesUsers.map((item) => item.id);
  const [todayCallRecords, todayWechatRecords, todayLiveInvitations, todayTradeOrders] =
    await Promise.all([
      prisma.callRecord.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          callTime: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        select: {
          salesId: true,
          customerId: true,
          result: true,
          resultCode: true,
        },
      }),
      prisma.wechatRecord.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          addedStatus: WechatAddStatus.ADDED,
          OR: [
            {
              addedAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              createdAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          ],
        },
        select: {
          salesId: true,
          customerId: true,
        },
      }),
      prisma.liveInvitation.findMany({
        where: {
          salesId: {
            in: salesUserIds,
          },
          OR: [
            {
              invitedAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            {
              createdAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
          ],
        },
        select: {
          salesId: true,
          customerId: true,
        },
      }),
      prisma.tradeOrder.findMany({
        where: {
          AND: [
            {
              ownerId: {
                in: salesUserIds,
              },
              tradeStatus: TradeOrderStatus.APPROVED,
              createdAt: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE,
          ],
        },
        select: {
          ownerId: true,
          finalAmount: true,
        },
      }),
    ]);

  const customerSnapshotsByOwnerId = new Map<string, CustomerDashboardSnapshot[]>();
  const todayAssignedCustomerIdsByOwnerId = new Map<string, Set<string>>();

  for (const snapshot of customerSnapshots) {
    if (!snapshot.ownerId) {
      continue;
    }

    const ownerSnapshots = customerSnapshotsByOwnerId.get(snapshot.ownerId) ?? [];
    ownerSnapshots.push(snapshot);
    customerSnapshotsByOwnerId.set(snapshot.ownerId, ownerSnapshots);

    const assignedAt = stateMap.get(snapshot.id)?.assignedAt;
    if (!assignedAt || !isWithinToday(assignedAt, todayStart, todayEnd)) {
      continue;
    }

    const assignedIds = todayAssignedCustomerIdsByOwnerId.get(snapshot.ownerId) ?? new Set<string>();
    assignedIds.add(snapshot.id);
    todayAssignedCustomerIdsByOwnerId.set(snapshot.ownerId, assignedIds);
  }

  const todayCallCountBySalesId = new Map<string, number>();
  const connectedAssignedCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayCallRecords) {
    todayCallCountBySalesId.set(
      record.salesId,
      (todayCallCountBySalesId.get(record.salesId) ?? 0) + 1,
    );

    if (!record.customerId) {
      continue;
    }

    const assignedCustomerIds = todayAssignedCustomerIdsByOwnerId.get(record.salesId);
    if (!assignedCustomerIds?.has(record.customerId) || !isConnectedCallRecord(record)) {
      continue;
    }

    const connectedIds =
      connectedAssignedCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    connectedIds.add(record.customerId);
    connectedAssignedCustomerIdsBySalesId.set(record.salesId, connectedIds);
  }

  const todayWechatCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayWechatRecords) {
    if (!record.customerId) {
      continue;
    }

    const customerIds = todayWechatCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    customerIds.add(record.customerId);
    todayWechatCustomerIdsBySalesId.set(record.salesId, customerIds);
  }

  const todayInvitationCustomerIdsBySalesId = new Map<string, Set<string>>();

  for (const record of todayLiveInvitations) {
    if (!record.customerId) {
      continue;
    }

    const customerIds =
      todayInvitationCustomerIdsBySalesId.get(record.salesId) ?? new Set<string>();
    customerIds.add(record.customerId);
    todayInvitationCustomerIdsBySalesId.set(record.salesId, customerIds);
  }

  const todayDealCountBySalesId = new Map<string, number>();
  const todayRevenueBySalesId = new Map<string, number>();

  for (const record of todayTradeOrders) {
    if (!record.ownerId) {
      continue;
    }

    todayDealCountBySalesId.set(
      record.ownerId,
      (todayDealCountBySalesId.get(record.ownerId) ?? 0) + 1,
    );
    todayRevenueBySalesId.set(
      record.ownerId,
      (todayRevenueBySalesId.get(record.ownerId) ?? 0) + Number(record.finalAmount ?? 0),
    );
  }

  const employees = scopeSalesUsers
    .map<CustomerOperatingDashboardEmployeeRow>((sales) => {
      const salesSnapshots = customerSnapshotsByOwnerId.get(sales.id) ?? [];
      const stats = buildSummaryStats(salesSnapshots, stateMap, todayStart, todayEnd);
      const todayAssignedCustomerIds =
        todayAssignedCustomerIdsByOwnerId.get(sales.id) ?? new Set<string>();
      const connectedAssignedCustomerIds =
        connectedAssignedCustomerIdsBySalesId.get(sales.id) ?? new Set<string>();
      const todayWechatCustomerIds =
        todayWechatCustomerIdsBySalesId.get(sales.id) ?? new Set<string>();
      const historicalWechatAddedCount = [...todayWechatCustomerIds].filter(
        (customerId) => !todayAssignedCustomerIds.has(customerId),
      ).length;
      const todayAssignedWechatCount = [...todayWechatCustomerIds].filter((customerId) =>
        todayAssignedCustomerIds.has(customerId),
      ).length;
      const todayInvitationCount =
        todayInvitationCustomerIdsBySalesId.get(sales.id)?.size ?? 0;
      const todayDealCount = todayDealCountBySalesId.get(sales.id) ?? 0;
      const todayRevenue = todayRevenueBySalesId.get(sales.id) ?? 0;

      return {
        userId: sales.id,
        name: sales.name,
        username: sales.username,
        teamId: sales.teamId,
        teamName: sales.team?.name ?? null,
        customerCount: stats.customerCount,
        todayAssignedCount: stats.todayAssignedCount,
        todayCallCount: todayCallCountBySalesId.get(sales.id) ?? 0,
        connectedAssignedCount: connectedAssignedCustomerIds.size,
        connectRate: formatPercentValue(
          connectedAssignedCustomerIds.size,
          stats.todayAssignedCount,
        ),
        todayWechatAddedCount: todayWechatCustomerIds.size,
        historicalWechatAddedCount,
        historicalWechatAddedRate: formatPercentValue(
          historicalWechatAddedCount,
          todayWechatCustomerIds.size,
        ),
        todayAssignedWechatCount,
        todayAssignedWechatRate: formatPercentValue(
          todayAssignedWechatCount,
          stats.todayAssignedCount,
        ),
        todayInvitationCount,
        todayDealCount,
        todayRevenueAmount: todayRevenue,
        todayRevenue: formatCurrencyValue(todayRevenue),
        executionClassCounts: stats.executionClassCounts,
        latestFollowUpAt: stats.latestFollowUpAt,
      };
    })
    .sort((left, right) => {
      if (right.todayAssignedCount !== left.todayAssignedCount) {
        return right.todayAssignedCount - left.todayAssignedCount;
      }

      if (right.todayCallCount !== left.todayCallCount) {
        return right.todayCallCount - left.todayCallCount;
      }

      if (right.todayDealCount !== left.todayDealCount) {
        return right.todayDealCount - left.todayDealCount;
      }

      if (right.customerCount !== left.customerCount) {
        return right.customerCount - left.customerCount;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });

  const totals = employees.reduce(
    (result, row) => {
      result.todayAssignedCount += row.todayAssignedCount;
      result.connectedAssignedCount += row.connectedAssignedCount;
      result.todayWechatAddedCount += row.todayWechatAddedCount;
      result.historicalWechatAddedCount += row.historicalWechatAddedCount;
      result.todayAssignedWechatCount += row.todayAssignedWechatCount;
      result.todayInvitationCount += row.todayInvitationCount;
      result.todayDealCount += row.todayDealCount;
      result.todayRevenue += row.todayRevenueAmount;
      return result;
    },
    {
      todayAssignedCount: 0,
      connectedAssignedCount: 0,
      todayWechatAddedCount: 0,
      historicalWechatAddedCount: 0,
      todayAssignedWechatCount: 0,
      todayInvitationCount: 0,
      todayDealCount: 0,
      todayRevenue: 0,
    },
  );

  return {
    scopeLabel,
    asOfDateLabel,
    periodLabel: dashboardRange.periodLabel,
    filters: {
      from: dashboardRange.from,
      to: dashboardRange.to,
    },
    summary: [
      {
        label: `${metricPeriodLabel}分配`,
        value: String(totals.todayAssignedCount),
        note: `${asOfDateLabel} 分配到当前统计范围销售名下`,
        emphasis: "info",
      },
      {
        label: "接通率",
        value: formatPercentValue(
          totals.connectedAssignedCount,
          totals.todayAssignedCount,
        ),
        note: `按已分配客户计算 · 已接通 ${totals.connectedAssignedCount} / ${totals.todayAssignedCount}`,
      },
      {
        label: "加微数",
        value: String(totals.todayWechatAddedCount),
        note: `${asOfDateLabel} ${metricPeriodNote}形成 ADDED`,
      },
      {
        label: "历史加微率",
        value: formatPercentValue(
          totals.historicalWechatAddedCount,
          totals.todayWechatAddedCount,
        ),
        note: `非${metricPeriodNote}分配但${metricPeriodNote}加微 ${totals.historicalWechatAddedCount} / ${totals.todayWechatAddedCount}`,
      },
      {
        label: "邀约进场",
        value: String(totals.todayInvitationCount),
        note: "直播邀约口径",
        emphasis: "success",
      },
      {
        label: "出单",
        value: String(totals.todayDealCount),
        note: `${metricPeriodNote}审批通过主单`,
        emphasis: "success",
      },
      {
        label: "销售额",
        value: formatCurrencyValue(totals.todayRevenue),
        note: `${metricPeriodNote}审批通过主单金额`,
      },
      {
        label: "分配资源加微率",
        value: formatPercentValue(
          totals.todayAssignedWechatCount,
          totals.todayAssignedCount,
        ),
        note: `${metricPeriodNote}分配客户中已加微 ${totals.todayAssignedWechatCount} / ${totals.todayAssignedCount}`,
        emphasis: "warning",
      },
    ],
    employees,
  };
}

export async function getCustomerDetail(viewer: CustomerViewer, customerId: string) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [visibleWhere, { id: customerId }],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      wechatId: true,
      province: true,
      city: true,
      district: true,
      address: true,
      status: true,
      level: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      leads: {
        where: buildVisibleLeadWhereInput(),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          source: true,
          status: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          leads: {
            where: buildVisibleLeadWhereInput(),
          },
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          salesOrders: true,
          giftRecords: true,
          mergeLogs: true,
        },
      },
      customerTags: {
        orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
        select: {
          id: true,
          tagId: true,
          tag: {
            select: {
              id: true,
              name: true,
              code: true,
              color: true,
            },
          },
        },
      },
      mergeLogs: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          source: true,
          tagSynced: true,
          createdAt: true,
          batch: {
            select: {
              id: true,
              fileName: true,
            },
          },
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  const [
    callRecords,
    wechatRecords,
    liveInvitations,
    salesOrders,
    giftRecords,
    availableLiveSessions,
    availableTags,
  ] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { callTime: "desc" },
      take: 20,
      select: {
        id: true,
        callTime: true,
        durationSeconds: true,
        result: true,
        remark: true,
        nextFollowUpAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.wechatRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        addedStatus: true,
        addedAt: true,
        wechatAccount: true,
        wechatNickname: true,
        wechatRemarkName: true,
        tags: true,
        summary: true,
        nextFollowUpAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.liveInvitation.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        invitationStatus: true,
        invitedAt: true,
        invitationMethod: true,
        attendanceStatus: true,
        watchDurationMinutes: true,
        giftQualified: true,
        remark: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            id: true,
            title: true,
            hostName: true,
            startAt: true,
            status: true,
            roomId: true,
            roomLink: true,
            targetProduct: true,
          },
        },
      },
    }),
    prisma.salesOrder.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        orderNo: true,
        reviewStatus: true,
        paymentMode: true,
        paymentScheme: true,
        finalAmount: true,
        receiverNameSnapshot: true,
        receiverPhoneSnapshot: true,
        receiverAddressSnapshot: true,
        createdAt: true,
        owner: {
          select: {
            name: true,
            username: true,
          },
        },
        supplier: {
          select: {
            name: true,
          },
        },
        shippingTask: {
          select: {
            id: true,
            reportStatus: true,
            shippingStatus: true,
            shippingProvider: true,
            trackingNumber: true,
            logisticsFollowUpTasks: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                intervalDays: true,
                nextTriggerAt: true,
                lastFollowedUpAt: true,
                owner: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            },
            codCollectionRecords: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                expectedAmount: true,
                collectedAmount: true,
                occurredAt: true,
                remark: true,
                paymentRecord: {
                  select: {
                    id: true,
                    amount: true,
                    status: true,
                    occurredAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.giftRecord.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        giftName: true,
        qualificationSource: true,
        freightAmount: true,
        reviewStatus: true,
        shippingStatus: true,
        receiverInfo: true,
        receiverName: true,
        receiverPhone: true,
        receiverAddress: true,
        remark: true,
        createdAt: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            title: true,
          },
        },
        shippingTask: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            shippedAt: true,
            remark: true,
          },
        },
        paymentPlans: {
          orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            subjectType: true,
            stageType: true,
            collectionChannel: true,
            plannedAmount: true,
            confirmedAmount: true,
            remainingAmount: true,
            status: true,
            collectionTasks: {
              where: {
                status: {
                  in: ["PENDING", "IN_PROGRESS"],
                },
              },
              take: 1,
              orderBy: [{ createdAt: "desc" }],
              select: {
                id: true,
                taskType: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        status: {
          in: [
            LiveSessionStatus.SCHEDULED,
            LiveSessionStatus.LIVE,
            LiveSessionStatus.ENDED,
            LiveSessionStatus.DRAFT,
          ],
        },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        hostName: true,
        startAt: true,
        status: true,
      },
    }),
    getActiveTagOptions(),
  ]);

  const salesOrderIds = salesOrders.map((record) => record.id);
  const shippingTaskIds = salesOrders
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const logisticsFollowUpTaskIds = salesOrders
    .flatMap((record) => record.shippingTask?.logisticsFollowUpTasks ?? [])
    .map((task) => task.id);
  const codCollectionRecordIds = salesOrders
    .flatMap((record) => record.shippingTask?.codCollectionRecords ?? [])
    .map((record) => record.id);
  const giftRecordIds = giftRecords.map((record) => record.id);
  const giftShippingTaskIds = giftRecords
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const giftPaymentPlanIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .map((plan) => plan.id);
  const giftCollectionTaskIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .flatMap((plan) => plan.collectionTasks ?? [])
    .map((task) => task.id);
  const operationLogWhere: Prisma.OperationLogWhereInput = {
    OR: [
      {
        targetType: "CUSTOMER",
        targetId: customer.id,
      },
      ...(salesOrderIds.length > 0
        ? [
            {
              targetType: "SALES_ORDER",
              targetId: {
                in: salesOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(shippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: shippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(logisticsFollowUpTaskIds.length > 0
        ? [
            {
              targetType: "LOGISTICS_FOLLOW_UP_TASK",
              targetId: {
                in: logisticsFollowUpTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(codCollectionRecordIds.length > 0
        ? [
            {
              targetType: "COD_COLLECTION_RECORD",
              targetId: {
                in: codCollectionRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftRecordIds.length > 0
        ? [
            {
              targetType: "GIFT_RECORD",
              targetId: {
                in: giftRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftShippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: giftShippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftPaymentPlanIds.length > 0
        ? [
            {
              targetType: "PAYMENT_PLAN",
              targetId: {
                in: giftPaymentPlanIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftCollectionTaskIds.length > 0
        ? [
            {
              targetType: "COLLECTION_TASK",
              targetId: {
                in: giftCollectionTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
    ],
  };

  const [operationLogs, operationLogCount] = await Promise.all([
    prisma.operationLog.findMany({
      where: operationLogWhere,
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
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.operationLog.count({
      where: operationLogWhere,
    }),
  ]);

  const latestFollowUpAt = getMaxDate([
    ...callRecords.map((record) => record.callTime),
    ...wechatRecords.map((record) => record.addedAt ?? null),
    ...liveInvitations.map((record) => record.invitedAt ?? null),
  ]);

  return {
    ...customer,
    viewerScope: actor.role,
    latestFollowUpAt,
    importSummary: {
      firstSource:
        customer.leads.length > 0 ? customer.leads[customer.leads.length - 1]?.source ?? null : null,
      latestSource: customer.leads.length > 0 ? customer.leads[0]?.source ?? null : null,
      linkedLeadCount: customer._count.leads,
      importEventCount: customer._count.mergeLogs,
      latestImportAt: customer.leads[0]?.createdAt ?? null,
    },
    callRecords,
    wechatRecords,
    liveInvitations,
    salesOrders,
    giftRecords,
    operationLogs,
    operationLogCount,
    availableLiveSessions,
    availableTags,
  };
}

async function getVisibleCustomerDetailBase(viewer: CustomerViewer, customerId: string) {
  if (!canAccessCustomerModule(viewer.role)) {
    throw new Error("You do not have access to customers.");
  }

  const recycledEntry = await findActiveCustomerRecycleEntry(prisma, customerId);

  if (recycledEntry) {
    return null;
  }

  const actor = await getCustomerCenterActor(viewer.id);
  const visibleWhere = getCustomerVisibilityWhereInput(actor);
  const publicPoolDetailWhere = getCustomerPublicPoolDetailWhereInput(actor);

  const customer = await prisma.customer.findFirst({
    where: {
      AND: [
        { id: customerId },
        {
          OR: [visibleWhere, publicPoolDetailWhere],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      wechatId: true,
      province: true,
      city: true,
      district: true,
      address: true,
      status: true,
      level: true,
      // Wave 7-B 客户分级 A/B/C/D/F (可空).
      grade: true,
      ownershipMode: true,
      publicPoolEnteredAt: true,
      publicPoolReason: true,
      claimLockedUntil: true,
      lastEffectiveFollowUpAt: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      lastOwner: {
        select: {
          id: true,
          name: true,
          username: true,
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      publicPoolTeam: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      ownershipEvents: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 12,
        select: {
          id: true,
          fromOwnershipMode: true,
          toOwnershipMode: true,
          reason: true,
          note: true,
          createdAt: true,
          fromOwner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          toOwner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          actor: {
            select: {
              name: true,
              username: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      _count: {
        select: {
          leads: true,
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          salesOrders: true,
          giftRecords: true,
          mergeLogs: true,
          ownershipEvents: true,
        },
      },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    actor,
    customer,
  };
}

async function buildCustomerDetailOperationLogWhere(customerId: string) {
  const [salesOrders, giftRecords] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { customerId },
      select: {
        id: true,
        tradeOrderId: true,
        shippingTask: {
          select: {
            id: true,
            logisticsFollowUpTasks: {
              select: { id: true },
            },
            codCollectionRecords: {
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.giftRecord.findMany({
      where: { customerId },
      select: {
        id: true,
        shippingTask: {
          select: { id: true },
        },
        paymentPlans: {
          select: {
            id: true,
            collectionTasks: {
              select: { id: true },
            },
          },
        },
      },
    }),
  ]);

  const salesOrderIds = salesOrders.map((record) => record.id);
  const tradeOrderIds = [
    ...new Set(
      salesOrders
        .map((record) => record.tradeOrderId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const shippingTaskIds = salesOrders
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const logisticsFollowUpTaskIds = salesOrders
    .flatMap((record) => record.shippingTask?.logisticsFollowUpTasks ?? [])
    .map((task) => task.id);
  const codCollectionRecordIds = salesOrders
    .flatMap((record) => record.shippingTask?.codCollectionRecords ?? [])
    .map((record) => record.id);
  const giftRecordIds = giftRecords.map((record) => record.id);
  const giftShippingTaskIds = giftRecords
    .map((record) => record.shippingTask?.id ?? null)
    .filter((value): value is string => Boolean(value));
  const giftPaymentPlanIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .map((plan) => plan.id);
  const giftCollectionTaskIds = giftRecords
    .flatMap((record) => record.paymentPlans ?? [])
    .flatMap((plan) => plan.collectionTasks ?? [])
    .map((task) => task.id);

  return {
    OR: [
      {
        targetType: "CUSTOMER",
        targetId: customerId,
      },
      ...(salesOrderIds.length > 0
        ? [
            {
              targetType: "SALES_ORDER",
              targetId: {
                in: salesOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(tradeOrderIds.length > 0
        ? [
            {
              targetType: "TRADE_ORDER",
              targetId: {
                in: tradeOrderIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(shippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: shippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(logisticsFollowUpTaskIds.length > 0
        ? [
            {
              targetType: "LOGISTICS_FOLLOW_UP_TASK",
              targetId: {
                in: logisticsFollowUpTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(codCollectionRecordIds.length > 0
        ? [
            {
              targetType: "COD_COLLECTION_RECORD",
              targetId: {
                in: codCollectionRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftRecordIds.length > 0
        ? [
            {
              targetType: "GIFT_RECORD",
              targetId: {
                in: giftRecordIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftShippingTaskIds.length > 0
        ? [
            {
              targetType: "SHIPPING_TASK",
              targetId: {
                in: giftShippingTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftPaymentPlanIds.length > 0
        ? [
            {
              targetType: "PAYMENT_PLAN",
              targetId: {
                in: giftPaymentPlanIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
      ...(giftCollectionTaskIds.length > 0
        ? [
            {
              targetType: "COLLECTION_TASK",
              targetId: {
                in: giftCollectionTaskIds,
              },
            } satisfies Prisma.OperationLogWhereInput,
          ]
        : []),
    ],
  } satisfies Prisma.OperationLogWhereInput;
}

export async function getCustomerDetailShell(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [
    firstLead,
    latestLead,
    latestCall,
    latestWechat,
    latestLive,
    successfulWechatRecord,
    successfulWechatCall,
    operationLogCount,
    logisticsFollowUpCount,
    approvedTradeOrderSummary,
    approvedTradeOrderCount,
    approvedSalesOrderCount,
    ownershipHistoryArchives,
  ] =
    await Promise.all([
      prisma.lead.findFirst({
        where: withVisibleLeadWhere({ customerId: detail.customer.id }),
        orderBy: { createdAt: "asc" },
        select: { source: true, createdAt: true },
      }),
      prisma.lead.findFirst({
        where: withVisibleLeadWhere({ customerId: detail.customer.id }),
        orderBy: { createdAt: "desc" },
        select: { source: true, createdAt: true },
      }),
      prisma.callRecord.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { callTime: "desc" },
        select: { callTime: true, result: true, resultCode: true },
      }),
      prisma.wechatRecord.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "desc" },
        select: { addedAt: true },
      }),
      prisma.liveInvitation.findFirst({
        where: { customerId: detail.customer.id },
        orderBy: { createdAt: "desc" },
        select: { invitedAt: true },
      }),
      prisma.wechatRecord.findFirst({
        where: {
          customerId: detail.customer.id,
          addedStatus: WechatAddStatus.ADDED,
        },
        select: { id: true },
      }),
      prisma.callRecord.findFirst({
        where: {
          customerId: detail.customer.id,
          OR: [
            { result: CallResult.WECHAT_ADDED },
            { resultCode: CallResult.WECHAT_ADDED },
          ],
        },
        select: { id: true },
      }),
      prisma.operationLog.count({
        where: await buildCustomerDetailOperationLogWhere(detail.customer.id),
      }),
      prisma.logisticsFollowUpTask.count({
        where: {
          customerId: detail.customer.id,
        },
      }),
      prisma.tradeOrder.aggregate({
        where: {
          AND: [
            {
              customerId: detail.customer.id,
              tradeStatus: TradeOrderStatus.APPROVED,
            },
            ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE,
          ],
        },
        _sum: {
          finalAmount: true,
        },
        _max: {
          createdAt: true,
        },
      }),
      prisma.tradeOrder.count({
        where: {
          AND: [
            {
              customerId: detail.customer.id,
              tradeStatus: TradeOrderStatus.APPROVED,
            },
            ACTIVE_TRADE_ORDER_SETTLEMENT_WHERE,
          ],
        },
      }),
      prisma.salesOrder.count({
        where: {
          AND: [
            {
              customerId: detail.customer.id,
              reviewStatus: SalesOrderReviewStatus.APPROVED,
            },
            ACTIVE_SALES_ORDER_SETTLEMENT_WHERE,
          ],
        },
      }),
      getCustomerOwnershipHistoryArchives(viewer, detail.customer),
    ]);

  const executionClass = deriveCustomerExecutionClassFromSignals({
    approvedTradeOrderCount:
      approvedTradeOrderCount > 0 ? approvedTradeOrderCount : approvedSalesOrderCount,
    hasLiveInvitation: Boolean(latestLive),
    hasSuccessfulWechatSignal: Boolean(successfulWechatRecord || successfulWechatCall),
    latestCall,
  });
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const newImported = Boolean(
    latestLead?.createdAt && isWithinToday(latestLead.createdAt, todayStart, todayEnd),
  );
  const pendingFirstCall = !latestCall;

  return {
    ...detail.customer,
    viewerScope: detail.actor.role,
    executionClass,
    newImported,
    pendingFirstCall,
    latestFollowUpAt: getMaxDate([
      latestCall?.callTime ?? null,
      latestWechat?.addedAt ?? null,
      latestLive?.invitedAt ?? null,
    ]),
    importSummary: {
      firstSource: firstLead?.source ?? null,
      latestSource: latestLead?.source ?? null,
      linkedLeadCount: detail.customer._count.leads,
      importEventCount: detail.customer._count.mergeLogs,
      latestImportAt: latestLead?.createdAt ?? null,
    },
    operationLogCount,
    logisticsFollowUpCount,
    tradeOrderSummary: {
      approvedCount: approvedTradeOrderCount,
      lifetimeAmount: approvedTradeOrderSummary._sum.finalAmount?.toString() ?? "0",
      latestTradeAt: approvedTradeOrderSummary._max.createdAt ?? null,
    },
    ownershipHistoryArchives,
  };
}

// F17 wave-2 phase 1 part 1: 内部 prisma.user.findMany 用 unstable_cache 包一层,
// tag = CACHE_TAGS.customerList. 这块结果只随 (role/teamId/currentOwnerId) 变化,
// 不依赖 viewer.id / Date, 适合长期缓存; mutation 端 (创建/移交/删除/恢复客户)
// 通过 revalidateTag(CACHE_TAGS.customerList) 主动失效. 行为兼容: 调用方拿到
// 的字段 / 排序与切换前完全一致, 仅当 tag 失效后才回 DB.
const listCustomerOwnerTransferUsersCached = unstable_cache(
  async (input: {
    scope: "ADMIN" | "SUPERVISOR";
    teamId: string | null;
    currentOwnerId: string | null;
  }): Promise<CustomerOwnerTransferOption[]> => {
    return prisma.user.findMany({
      where: {
        id: input.currentOwnerId ? { not: input.currentOwnerId } : undefined,
        userStatus: UserStatus.ACTIVE,
        disabledAt: null,
        role: {
          code: "SALES",
        },
        ...(input.scope === "SUPERVISOR" && input.teamId
          ? { teamId: input.teamId }
          : {}),
      },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }, { username: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        team: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  },
  [CACHE_TAGS.customerList, "customer-owner-transfer-options"],
  {
    tags: [CACHE_TAGS.customerList],
  },
);

export async function getCustomerOwnerTransferOptions(
  viewer: CustomerViewer,
  customerId: string,
): Promise<CustomerOwnerTransferOption[]> {
  if (!canTransferCustomerOwner(viewer.role)) {
    return [];
  }

  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return [];
  }

  const actor = detail.actor;

  if (actor.role === "SUPERVISOR" && !actor.teamId) {
    return [];
  }

  if (actor.role !== "ADMIN" && actor.role !== "SUPERVISOR") {
    return [];
  }

  const currentOwnerId = detail.customer.owner?.id ?? null;

  return listCustomerOwnerTransferUsersCached({
    scope: actor.role,
    teamId: actor.teamId ?? null,
    currentOwnerId,
  });
}

export async function getCustomerDetailProfileData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [
    leads,
    mergeLogs,
    customerTags,
    availableTags,
    latestCustomerImportLog,
    importedCustomerDeletion,
    historyArchives,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: withVisibleLeadWhere({ customerId: detail.customer.id }),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        source: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.leadCustomerMergeLog.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        source: true,
        tagSynced: true,
        createdAt: true,
        leadIdSnapshot: true,
        leadNameSnapshot: true,
        leadPhoneSnapshot: true,
        batch: {
          select: {
            id: true,
            fileName: true,
          },
        },
        lead: {
          select: {
            id: true,
            name: true,
            phone: true,
            rolledBackAt: true,
          },
        },
      },
    }),
    prisma.customerTag.findMany({
      where: { customerId: detail.customer.id },
      orderBy: [{ tag: { sortOrder: "asc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        tagId: true,
        tag: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
      },
    }),
    getActiveTagOptions(),
    prisma.operationLog.findFirst({
      where: {
        targetType: "CUSTOMER",
        targetId: detail.customer.id,
        action: {
          in: [...customerContinuationImportOperationActions],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        afterData: true,
      },
    }),
    resolveImportedCustomerDeletionGuard(viewer, detail.customer.id),
    prisma.customerHistoryArchive.findMany({
      where: {
        targetCustomerId: detail.customer.id,
        ...getCustomerHistoryArchiveVisibilityWhere(viewer),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        sourceCustomerId: true,
        sourceCustomerName: true,
        sourceCustomerPhone: true,
        sourceOwnerLabel: true,
        sourceExecutionClass: true,
        visibility: true,
        reason: true,
        snapshot: true,
        createdAt: true,
        sourceBatch: {
          select: {
            id: true,
            fileName: true,
          },
        },
        createdBy: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
  ]);

  return {
    leads,
    mergeLogs,
    customerTags,
    availableTags,
    importedCustomerDeletion,
    historyArchives,
    customerImportSummary: latestCustomerImportLog
      ? {
          createdAt: latestCustomerImportLog.createdAt,
          data: parseCustomerImportOperationLogData(latestCustomerImportLog.afterData),
        }
      : null,
  };
}

export async function getCustomerDetailCallsData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [records, callResultOptions] = await Promise.all([
    prisma.callRecord.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { callTime: "desc" },
      take: 20,
      select: {
        id: true,
        callTime: true,
        durationSeconds: true,
        result: true,
        resultCode: true,
        remark: true,
        nextFollowUpAt: true,
        recording: {
          select: {
            id: true,
            status: true,
            mimeType: true,
            fileSizeBytes: true,
            durationSeconds: true,
            uploadedAt: true,
            aiAnalysis: {
              select: {
                status: true,
                summary: true,
                qualityScore: true,
                customerIntent: true,
                sentiment: true,
                riskFlagsJson: true,
                opportunityTagsJson: true,
                keywordsJson: true,
                nextActionSuggestion: true,
                transcriptText: true,
                transcriptJson: true,
              },
            },
          },
        },
        outboundSession: {
          select: {
            status: true,
            failureCode: true,
            failureMessage: true,
            durationSeconds: true,
            recordingImportedAt: true,
          },
        },
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    getEnabledCallResultOptions(),
  ]);

  return {
    records: await hydrateCallResultLabels(records),
    callResultOptions,
  };
}

// 跟进弹窗"查看全部"用的轻量分页: 只取 结果/备注/时间, 不拉录音/AI, 走游标翻页.
// 真相仍在客户详情·通话 tab; 这里只为让业务员在拨号流里翻完整历史.
const CUSTOMER_CALL_RECORDS_PAGE_SIZE = 20;

export type CustomerCallRecordHistoryEntry = {
  id: string;
  callTime: Date;
  resultLabel: string;
  remark: string | null;
};

export type CustomerCallRecordsPage = {
  records: CustomerCallRecordHistoryEntry[];
  nextCursor: string | null;
};

export async function getCustomerCallRecordsPage(
  viewer: CustomerViewer,
  customerId: string,
  cursor: string | null,
): Promise<CustomerCallRecordsPage | null> {
  // 复用客户详情可见性守卫: 承接/团队/公海范围校验都落服务端.
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const rows = await prisma.callRecord.findMany({
    where: { customerId: detail.customer.id },
    orderBy: [{ callTime: "desc" }, { id: "desc" }],
    // 多取 1 条判定是否还有下一页.
    take: CUSTOMER_CALL_RECORDS_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      callTime: true,
      result: true,
      resultCode: true,
      remark: true,
    },
  });

  const hasMore = rows.length > CUSTOMER_CALL_RECORDS_PAGE_SIZE;
  const pageRows = hasMore
    ? rows.slice(0, CUSTOMER_CALL_RECORDS_PAGE_SIZE)
    : rows;
  const labeled = await hydrateCallResultLabels(pageRows);

  return {
    records: labeled.map((row) => ({
      id: row.id,
      callTime: row.callTime,
      resultLabel: row.resultLabel,
      remark: row.remark,
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1]!.id : null,
  };
}

export async function getCustomerDetailWechatData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.wechatRecord.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      addedStatus: true,
      addedAt: true,
      wechatAccount: true,
      wechatNickname: true,
      wechatRemarkName: true,
      tags: true,
      summary: true,
      nextFollowUpAt: true,
      sales: {
        select: {
          name: true,
          username: true,
        },
      },
    },
  });
}

export async function getCustomerDetailLiveData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const [records, liveSessions] = await Promise.all([
    prisma.liveInvitation.findMany({
      where: { customerId: detail.customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        invitationStatus: true,
        invitedAt: true,
        invitationMethod: true,
        attendanceStatus: true,
        watchDurationMinutes: true,
        giftQualified: true,
        remark: true,
        sales: {
          select: {
            name: true,
            username: true,
          },
        },
        liveSession: {
          select: {
            id: true,
            title: true,
            hostName: true,
            startAt: true,
            status: true,
            roomId: true,
            roomLink: true,
            targetProduct: true,
          },
        },
      },
    }),
    prisma.liveSession.findMany({
      where: {
        status: {
          in: [
            LiveSessionStatus.SCHEDULED,
            LiveSessionStatus.LIVE,
            LiveSessionStatus.ENDED,
            LiveSessionStatus.DRAFT,
          ],
        },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        hostName: true,
        startAt: true,
        status: true,
      },
    }),
  ]);

  return {
    records,
    liveSessions,
  };
}

export async function getCustomerDetailOrdersData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  return prisma.salesOrder.findMany({
    where: { customerId: detail.customer.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      subOrderNo: true,
      reviewStatus: true,
      paymentMode: true,
      paymentScheme: true,
      finalAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
      createdAt: true,
      owner: {
        select: {
          name: true,
          username: true,
        },
      },
      supplier: {
        select: {
          name: true,
        },
      },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          reportStatus: true,
          shippingStatus: true,
          shippingProvider: true,
          trackingNumber: true,
          logisticsFollowUpTasks: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              status: true,
              intervalDays: true,
              nextTriggerAt: true,
              lastFollowedUpAt: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
          codCollectionRecords: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              status: true,
              expectedAmount: true,
              collectedAmount: true,
              occurredAt: true,
              remark: true,
              paymentRecord: {
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  occurredAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getCustomerDetailLogsData(
  viewer: CustomerViewer,
  customerId: string,
) {
  const detail = await getVisibleCustomerDetailBase(viewer, customerId);

  if (!detail) {
    return null;
  }

  const where = await buildCustomerDetailOperationLogWhere(detail.customer.id);

  return prisma.operationLog.findMany({
    where,
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
          name: true,
          username: true,
        },
      },
    },
  });
}
