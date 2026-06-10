import { Suspense, cache } from "react";
import { redirect } from "next/navigation";
import type { RoleCode } from "@prisma/client";
import {
  CustomerCenterListSection,
  CustomerCenterToolbarSection,
  CustomerCenterWorkbench,
} from "@/components/customers/customer-center-workbench";
import type { MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { readCursorFromSearchParams } from "@/lib/customers/list-cursor";
import {
  getCustomerCenterDataCursor,
  getCustomerCenterDataList,
  getCustomerCenterDataStats,
  type CustomerCenterListData,
  type CustomerCenterStatsData,
} from "@/lib/customers/queries";
import { isOutboundCallRuntimeEnabled } from "@/lib/outbound-calls/config";
import { moveCustomerToRecycleBinAction } from "./[id]/actions";

type ResolvedSearchParams = Record<string, string | string[] | undefined>;
type CustomerViewer = { id: string; role: RoleCode };

// F19 customers/streaming — per-request dedup.
//
// 两个 Suspense (StreamingList + StreamingToolbar) 都需要 list + stats
// (cursor 模式还要 getCustomerCenterDataCursor). 之前直接 `Promise.all` 各自
// 调用 — 两个并行的 Suspense 分支同时进入, 都拿到 cache miss, 各自重复触发
// 整套未 cache 的 SQL (prisma.customer.count / findMany / 多个 count + groupBy).
// unstable_cache 60s 只 cover 字典 (teams/salesUsers/visibleIds/recycledIds),
// 第一次 hit + post-mutation hit 都会双倍 cost.
//
// 用 React.cache() 把 3 个入口 dedup 到 per-request 维度: 第二个 Suspense 命中
// 第一个 Suspense 已经在飞的 Promise, 不再触发第二轮 SQL.
const dedupedGetList = cache(
  (
    viewer: CustomerViewer,
    resolvedSearchParams: ResolvedSearchParams | undefined,
  ) => getCustomerCenterDataList(viewer, resolvedSearchParams),
);
const dedupedGetStats = cache(
  (
    viewer: CustomerViewer,
    resolvedSearchParams: ResolvedSearchParams | undefined,
  ) => getCustomerCenterDataStats(viewer, resolvedSearchParams),
);
const dedupedGetCursor = cache(
  (
    viewer: CustomerViewer,
    resolvedSearchParams: ResolvedSearchParams | undefined,
    parsedCursor: ReturnType<typeof readCursorFromSearchParams>,
  ) => getCustomerCenterDataCursor(viewer, resolvedSearchParams, parsedCursor),
);

export default async function CustomersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const canCreateCalls = canCreateCallRecord(session.user.role);

  // F18 customers/perf phase 3: 默认走 page mode (页码 + 每页选择, 销售业务
  // 习惯). page mode 内部 SQL OFFSET/LIMIT 真分页 + SQL aggregate, 不再依赖
  // 5826 内存全表加载. 只有外部带 `?cursor=` 显式触发 cursor 模式时, 才走
  // `getCustomerCenterDataCursor` 作为 fallback.
  const parsedCursor = readCursorFromSearchParams(resolvedSearchParams);
  const viewer: CustomerViewer = {
    id: session.user.id,
    role: session.user.role,
  };

  const outboundCallEnabled = canCreateCalls
    ? await isOutboundCallRuntimeEnabled()
    : false;

  // F19 streaming: 列表与 stats 走两个独立 Suspense.
  //   - 列表 (queueItems / pagination / phoneSearchDisclosures / productOptions /
  //     tagOptions) 优先 SSR — 用户最关心.
  //   - stats (SQL aggregate 派生的 teamOverview / salesBoard) 走单独 Suspense,
  //     在列表已可见后异步补充顶部筛选 + 批量操作 dropdown.
  //
  // cursor 模式仍走旧的 getCustomerCenterDataCursor (列表 + stats 一起), 但下层
  // 同样落在 CustomerCenterListSection + CustomerCenterToolbarSection, 通过本地
  // slicing 拆成两份, 让 UI 形态保持一致 (cursor 模式列表偏少时阻塞不明显).
  return (
    <CustomerCenterWorkbench
      toolbarSlot={
        <Suspense fallback={<ToolbarSkeleton />}>
          <StreamingToolbar
            viewer={viewer}
            resolvedSearchParams={resolvedSearchParams}
            parsedCursor={parsedCursor}
          />
        </Suspense>
      }
      listSlot={
        <Suspense fallback={<CustomerListSkeleton />}>
          <StreamingList
            viewer={viewer}
            resolvedSearchParams={resolvedSearchParams}
            parsedCursor={parsedCursor}
            outboundCallEnabled={outboundCallEnabled}
            moveCustomerToRecycleBinAction={moveCustomerToRecycleBinAction}
          />
        </Suspense>
      }
    />
  );
}

/**
 * 列表 Suspense 内部. 串行依赖 list 数据 (但与 toolbar 分支并行).
 *
 * cursor 模式: 复用 getCustomerCenterDataCursor (列表 + stats 一起), 然后 slice
 * 出 list slice; transferableOwners 透传给 CustomersTable 的 batch transfer
 * dropdown.
 *
 * page 模式: list 与 stats 并行. 两个 Suspense 分支都会需要这两份数据,
 * 通过 React.cache() 把 `dedupedGetList` / `dedupedGetStats` dedup 到
 * per-request 维度 — 第二个分支拿到的是第一个分支已经在飞的 Promise,
 * 不会再触发 prisma count / findMany / aggregate. 必须用
 * `transferableOwners` (全集 SALES, 不受 filter 限制), 不能用 `salesBoard`
 * (跟随 filter, 选了 team 之后会变成空 dropdown — 即"暂无可移交的销售账号").
 */
async function StreamingList({
  viewer,
  resolvedSearchParams,
  parsedCursor,
  outboundCallEnabled,
  moveCustomerToRecycleBinAction: moveAction,
}: Readonly<{
  viewer: CustomerViewer;
  resolvedSearchParams: ResolvedSearchParams | undefined;
  parsedCursor: ReturnType<typeof readCursorFromSearchParams>;
  outboundCallEnabled: boolean;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
}>) {
  let list: CustomerCenterListData;
  let transferableOwners: CustomerCenterStatsData["transferableOwners"] = [];

  if (parsedCursor) {
    const full = await dedupedGetCursor(
      viewer,
      resolvedSearchParams,
      parsedCursor,
    );
    list = {
      actor: full.actor,
      filters: full.filters,
      scopeMode: full.scopeMode,
      productOptions: full.productOptions,
      tagOptions: full.tagOptions,
      callResultOptions: full.callResultOptions,
      queueItems: full.queueItems,
      phoneSearchDisclosures: full.phoneSearchDisclosures,
      pagination: full.pagination,
    };
    transferableOwners = full.transferableOwners ?? [];
  } else {
    const [listData, stats] = await Promise.all([
      dedupedGetList(viewer, resolvedSearchParams),
      dedupedGetStats(viewer, resolvedSearchParams),
    ]);
    list = listData;
    transferableOwners = stats.transferableOwners ?? [];
  }

  return (
    <CustomerCenterListSection
      role={viewer.role}
      list={list}
      batchOwnerTransferOptions={transferableOwners}
      outboundCallEnabled={outboundCallEnabled}
      moveCustomerToRecycleBinAction={moveAction}
    />
  );
}

/**
 * Toolbar Suspense 内部. 同时 await list (cache hit 的同源 helper, 取
 * productOptions / tagOptions) 与 stats (teamOverview / salesBoard).
 *
 * 两个 Suspense 是并行的; list 边界通常先完成 (无 SQL aggregate), toolbar
 * 跟着补上 — 用户体验是列表先出, stats 顶部 / dropdown 后补.
 */
async function StreamingToolbar({
  viewer,
  resolvedSearchParams,
  parsedCursor,
}: Readonly<{
  viewer: CustomerViewer;
  resolvedSearchParams: ResolvedSearchParams | undefined;
  parsedCursor: ReturnType<typeof readCursorFromSearchParams>;
}>) {
  if (parsedCursor) {
    const full = await dedupedGetCursor(
      viewer,
      resolvedSearchParams,
      parsedCursor,
    );
    return (
      <CustomerCenterToolbarSection
        role={viewer.role}
        filters={full.filters}
        productOptions={full.productOptions}
        tagOptions={full.tagOptions}
        teamOverview={full.teamOverview}
        salesBoard={full.salesBoard}
        queueCounts={full.queueCounts}
      />
    );
  }

  const [list, stats] = await Promise.all([
    dedupedGetList(viewer, resolvedSearchParams),
    dedupedGetStats(viewer, resolvedSearchParams),
  ]);

  return (
    <CustomerCenterToolbarSection
      role={viewer.role}
      filters={list.filters}
      productOptions={list.productOptions}
      tagOptions={list.tagOptions}
      teamOverview={stats.teamOverview}
      salesBoard={stats.salesBoard}
      queueCounts={stats.queueCounts}
    />
  );
}

function ToolbarSkeleton() {
  return (
    <div
      className="h-12 animate-pulse rounded-lg bg-muted/30"
      aria-busy="true"
      aria-live="polite"
    />
  );
}

function CustomerListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className="h-14 animate-pulse rounded-lg bg-muted/30"
        />
      ))}
    </div>
  );
}
