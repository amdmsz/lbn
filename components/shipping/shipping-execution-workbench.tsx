import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ShippingOperationsSection } from "@/components/shipping/shipping-operations-section";
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
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import { getShippingOperationsPageData } from "@/lib/shipping/queries";

type ShippingData = Awaited<ReturnType<typeof getShippingOperationsPageData>>;

function buildShippingHref(
  filters: ShippingData["filters"],
  overrides: Partial<ShippingData["filters"]> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.keyword) {
    params.set("keyword", next.keyword);
  }

  if (next.supplierId) {
    params.set("supplierId", next.supplierId);
  }

  if (next.reportStatus) {
    params.set("reportStatus", next.reportStatus);
  }

  if (next.shippingStatus) {
    params.set("shippingStatus", next.shippingStatus);
  }

  if (next.isCod) {
    params.set("isCod", next.isCod);
  }

  if (next.hasTrackingNumber) {
    params.set("hasTrackingNumber", next.hasTrackingNumber);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/shipping?${query}` : "/shipping";
}

function getRoleMeta(role: RoleCode) {
  if (role === "SHIPPER") {
    return {
      eyebrow: "履约执行台",
      description:
        "发货页回到执行台形态，先看待报单、待回填和执行队列，再进入主列表处理具体任务。",
      scope: "发货主工作台",
    };
  }

  return {
    eyebrow: "履约总览",
    description:
      "主管和管理角色先看履约结构和批次协同，再进入主列表回看执行结果，不把这里当销售工作台。",
    scope: "履约管理视角",
  };
}

function getSummaryItems(data: ShippingData): PageSummaryStripItem[] {
  return [
    {
      label: "履约任务",
      value: String(data.summary.totalCount),
      note: "当前范围内的履约总量",
    },
    {
      label: "待报单",
      value: String(data.summary.pendingReportCount),
      note: "尚未导出给供应商",
      href: buildShippingHref(data.filters, { reportStatus: "PENDING", page: 1 }),
      emphasis: "warning",
    },
    {
      label: "待回填单号",
      value: String(data.summary.pendingTrackingCount),
      note: "待回填物流单号后才能推进发货",
      href: buildShippingHref(data.filters, {
        hasTrackingNumber: "false",
        page: 1,
      }),
      emphasis: "info",
    },
    {
      label: "已发货",
      value: String(data.summary.shippedCount),
      note: "已进入物流跟进阶段",
      emphasis: "success",
    },
  ];
}

export function ShippingExecutionWorkbench({
  role,
  data,
  canManageReporting,
  createExportBatchAction,
  updateShippingAction,
}: Readonly<{
  role: RoleCode;
  data: ShippingData;
  canManageReporting: boolean;
  createExportBatchAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  const meta = getRoleMeta(role);

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow={meta.eyebrow}
          title="发货中心"
          description={meta.description}
          meta={
            <>
              <StatusBadge label={meta.scope} variant="info" />
              <StatusBadge
                label={canManageReporting ? "支持报单与回填" : "只读总览"}
                variant={canManageReporting ? "success" : "neutral"}
              />
              <StatusBadge label={`COD ${data.summary.codTaskCount}`} variant="warning" />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link href="/shipping/export-batches" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                报单批次
              </Link>
              <Link href="/orders" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                订单中心
              </Link>
            </div>
          }
        />
      }
      summary={<PageSummaryStrip items={getSummaryItems(data)} />}
      toolbar={
        <PageToolbar
          eyebrow="执行原则"
          title="履约队列先于明细长表"
          description="先看状态摘要和强筛选，再进入主执行列表做批量动作。报单、回填、物流和 COD 仍然分层处理。"
          secondary={
            <>
              <StatusBadge label={`已签收 ${data.summary.deliveredCount}`} variant="success" />
              <StatusBadge label={`当前页 ${data.pagination.page}/${data.pagination.totalPages}`} variant="neutral" />
            </>
          }
          primary={
            <>
              <Link
                href={buildShippingHref(data.filters, { reportStatus: "PENDING", page: 1 })}
                className="crm-button crm-button-secondary"
              >
                待报单
              </Link>
              <Link
                href={buildShippingHref(data.filters, { hasTrackingNumber: "false", page: 1 })}
                className="crm-button crm-button-secondary"
              >
                待回填
              </Link>
              <Link
                href={buildShippingHref(data.filters, { isCod: "true", page: 1 })}
                className="crm-button crm-button-secondary"
              >
                COD
              </Link>
              <Link href="/shipping/export-batches" className="crm-button crm-button-secondary">
                批次回看
              </Link>
            </>
          }
        />
      }
      stickyBar={
        <StickyActionBar
          title="执行焦点"
          description="只要还没回填物流单号，就不应继续推进发货状态。"
        >
          <StatusBadge label="报单状态和发货状态分离" variant="warning" />
          <StatusBadge label="首次回填单号后应进入物流跟进" variant="info" />
          <StatusBadge label="COD 不等于已回款" variant="neutral" />
        </StickyActionBar>
      }
      sidebar={
        <DetailSidebar
          sections={[
            {
              eyebrow: "当前范围",
              title: "履约控制面",
              description: "履约页只承接执行，不回收销售和收款权限。",
              items: [
                { label: "视角", value: meta.scope },
                { label: "报单筛选", value: data.filters.reportStatus || "全部状态" },
                { label: "发货筛选", value: data.filters.shippingStatus || "全部状态" },
                { label: "供应商", value: data.filters.supplierId ? "已限定供应商" : "全部供应商" },
              ],
            },
            {
              eyebrow: "执行规则",
              title: "履约边界",
              items: [
                { label: "报单", value: "导出后才进入已报单，不等于已发货" },
                { label: "发货", value: "回填物流单号后才进入已发货" },
                { label: "物流跟进", value: "独立于订单和发货状态" },
                { label: "COD", value: "仅表示履约侧回款过程，不替代支付确认" },
              ],
            },
          ]}
        />
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <SectionCard
        eyebrow="主执行列表"
        title="履约执行主面板"
        description="批量报单、物流回填和状态推进都在这个执行面板中完成，避免发货页退化成一张普通表格。"
      >
        <ShippingOperationsSection
          items={data.items}
          filters={data.filters}
          suppliers={data.suppliers}
          pagination={data.pagination}
          canManageReporting={canManageReporting}
          createExportBatchAction={createExportBatchAction}
          updateShippingAction={updateShippingAction}
        />
      </SectionCard>
    </WorkbenchLayout>
  );
}
