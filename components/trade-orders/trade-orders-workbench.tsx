import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailSidebar } from "@/components/shared/detail-sidebar";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TradeOrdersSection } from "@/components/trade-orders/trade-orders-section";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { getTradeOrdersPageData } from "@/lib/trade-orders/queries";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;

function buildOrdersHref(
  filters: TradeOrdersData["filters"],
  overrides: Partial<TradeOrdersData["filters"]> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.keyword) {
    params.set("keyword", next.keyword);
  }

  if (next.customerKeyword) {
    params.set("customerKeyword", next.customerKeyword);
  }

  if (next.supplierId) {
    params.set("supplierId", next.supplierId);
  }

  if (next.statusView) {
    params.set("statusView", next.statusView);
  }

  if (next.supplierCount) {
    params.set("supplierCount", next.supplierCount);
  }

  if (next.sortBy !== "UPDATED_DESC") {
    params.set("sortBy", next.sortBy);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

function getRoleMeta(role: RoleCode) {
  switch (role) {
    case "ADMIN":
      return {
        eyebrow: "组织成交中台",
        description:
          "订单中心现在优先查看 TradeOrder 父单。这里先看成交结构、审核状态和 supplier 子单关系，再进入具体执行层。",
        scope: "组织 / 团队全部成交父单",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队成交工作台",
        description:
          "主管先看待审核与已审核父单，再按 supplier 子单回到执行细节。页面内强化父单层级，不把支付和发货主视角重新搬进来。",
        scope: "本人团队成交父单",
      };
    default:
      return {
        eyebrow: "我的成交父单",
        description:
          "销售先从客户详情建单，再回到这里按父单看成交、审核和 supplier 拆单结果。旧子单详情继续保留，但不再作为主入口。",
        scope: "本人客户成交父单",
      };
  }
}

function getStatusViewLabel(value: TradeOrdersData["filters"]["statusView"]) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已拒绝";
    default:
      return "全部状态";
  }
}

function getSummaryItems(data: TradeOrdersData): PageSummaryStripItem[] {
  return [
    {
      label: "父单总数",
      value: String(data.summary.totalCount),
      note: "当前筛选范围内的 TradeOrder 数量",
    },
    {
      label: "草稿视图",
      value: String(data.summary.draftCount),
      note: "尚未提审或驳回后待继续编辑的父单",
      href: buildOrdersHref(data.filters, {
        statusView: "DRAFT",
        page: 1,
      }),
      emphasis: data.filters.statusView === "DRAFT" ? "warning" : "default",
    },
    {
      label: "待审核",
      value: String(data.summary.pendingReviewCount),
      note: "待主管或管理员审核的父单",
      href: buildOrdersHref(data.filters, {
        statusView: "PENDING_REVIEW",
        page: 1,
      }),
      emphasis: "warning",
    },
    {
      label: "待回收金额",
      value: formatCurrency(data.summary.totalRemainingAmount),
      note: "执行层 payment 仍按 supplier 子单推进",
      emphasis: "info",
    },
  ];
}

export function TradeOrdersWorkbench({
  role,
  data,
  canCreate,
  canReview,
  reviewAction,
}: Readonly<{
  role: RoleCode;
  data: TradeOrdersData;
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  const meta = getRoleMeta(role);

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow={meta.eyebrow}
          title="订单中心"
          description={meta.description}
          meta={
            <>
              <StatusBadge label={meta.scope} variant="info" />
              <StatusBadge
                label={canCreate ? "从客户详情建单" : "只读"}
                variant={canCreate ? "success" : "neutral"}
              />
              <StatusBadge
                label={canReview ? "支持父单审核" : "无审核权限"}
                variant={canReview ? "warning" : "neutral"}
              />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link
                href="/customers"
                className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
              >
                去客户中心建单
              </Link>
              <Link
                href="/shipping"
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                发货中心
              </Link>
            </div>
          }
        />
      }
      summary={<PageSummaryStrip items={getSummaryItems(data)} />}
      toolbar={
        <PageToolbar
          eyebrow="父单与子单"
          title="订单中心先看成交父单，再展开 supplier 子单"
          description="列表层重点交代状态、客户、supplier 拆单规模和更新时间。旧子单详情仍在，但只作为执行层兼容入口。"
          secondary={
            <>
              <StatusBadge label={`已审核 ${data.summary.approvedCount}`} variant="success" />
              <StatusBadge label={`已拒绝 ${data.summary.rejectedCount}`} variant="danger" />
              <StatusBadge label={`当前视图 ${getStatusViewLabel(data.filters.statusView)}`} variant="neutral" />
            </>
          }
          primary={
            <>
              <Link
                href={buildOrdersHref(data.filters, {
                  statusView: "DRAFT",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                草稿视图
              </Link>
              <Link
                href={buildOrdersHref(data.filters, {
                  statusView: "PENDING_REVIEW",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                待审核
              </Link>
              <Link
                href={buildOrdersHref(data.filters, {
                  statusView: "APPROVED",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                已审核
              </Link>
              <Link
                href={buildOrdersHref(data.filters, {
                  statusView: "REJECTED",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                已拒绝
              </Link>
            </>
          }
        />
      }
      sidebar={
        <DetailSidebar
          sections={[
            {
              eyebrow: "当前范围",
              title: "父单工作边界",
              description: "这里只承接成交父单、审核状态、supplier 关系和父单编号，不重做 shipping/payment 主视角。",
              items: [
                { label: "查看范围", value: meta.scope },
                { label: "当前页", value: `第 ${data.pagination.page} / ${data.pagination.totalPages} 页` },
                { label: "状态视图", value: getStatusViewLabel(data.filters.statusView) },
                { label: "更新时间", value: data.filters.sortBy === "UPDATED_ASC" ? "最早更新" : data.filters.sortBy === "CREATED_DESC" ? "最新创建" : "最近更新" },
              ],
            },
            {
              eyebrow: "筛选提示",
              title: "父单列表怎么用",
              items: [
                { label: "草稿", value: "优先找回未提审或被驳回后待继续编辑的父单" },
                { label: "客户", value: "客户名或客户手机号单独检索，减少和编号检索混在一起" },
                { label: "supplier 数", value: "快速筛出单 supplier 直售单或多 supplier 拆单单" },
                { label: "兼容入口", value: "旧子单详情仍可进入，但页面默认优先父单" },
              ],
            },
          ]}
        />
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <SectionCard
        eyebrow="成交父单"
        title="TradeOrder 父单列表"
        description="统一按父单看客户、成交状态、supplier 子单关系和最近更新。具体 shipping / payment 执行仍从子单继续承接。"
      >
        <TradeOrdersSection
          items={data.items}
          filters={data.filters}
          suppliers={data.suppliers}
          pagination={data.pagination}
          canCreate={canCreate}
          canReview={canReview}
          reviewAction={reviewAction}
        />
      </SectionCard>
    </WorkbenchLayout>
  );
}
