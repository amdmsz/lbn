import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { SalesOrdersSection } from "@/components/sales-orders/sales-orders-section";
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
import { buildOrderFulfillmentHref } from "@/lib/fulfillment/navigation";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { getSalesOrdersPageData } from "@/lib/sales-orders/queries";

type OrdersData = Awaited<ReturnType<typeof getSalesOrdersPageData>>;

function buildOrdersHref(
  filters: OrdersData["filters"],
  overrides: Partial<OrdersData["filters"]> = {},
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

  if (next.reviewStatus) {
    params.set("reviewStatus", next.reviewStatus);
  }

  if (next.paymentScheme) {
    params.set("paymentScheme", next.paymentScheme);
  }

  if (next.createCustomerId) {
    params.set("createCustomerId", next.createCustomerId);
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
        eyebrow: "组织交易总览",
        description:
          "订单页回到交易主单职责，只看审核、交易结构和结果回流，不把它变成客户检索页或发货操作台。",
        scope: "组织 / 团队全量订单",
      };
    case "SUPERVISOR":
      return {
        eyebrow: "团队订单中台",
        description:
          "主管先看待审核和异常订单，再进入订单主体处理审核和结果回看，支付与履约仍回到各自业务域。",
        scope: "本人团队订单",
      };
    default:
      return {
        eyebrow: "我的订单工作台",
        description:
          "销售只看本人客户订单，首屏保留待处理结构，不把发货和收款能力扩展到订单主列表。",
        scope: "本人客户订单",
      };
  }
}

function getSummaryItems(data: OrdersData): PageSummaryStripItem[] {
  return [
    {
      label: "订单总量",
      value: String(data.summary.totalCount),
      note: "当前过滤条件下的订单规模",
    },
    {
      label: "待审核",
      value: String(data.summary.pendingReviewCount),
      note: "优先处理待审核订单",
      href: buildOrdersHref(data.filters, {
        reviewStatus: "PENDING_REVIEW",
        page: 1,
      }),
      emphasis: "warning",
    },
    {
      label: "已通过",
      value: String(data.summary.approvedCount),
      note: "已进入履约池的订单",
      href: buildOrdersHref(data.filters, {
        reviewStatus: "APPROVED",
        page: 1,
      }),
      emphasis: "success",
    },
    {
      label: "待回收金额",
      value: formatCurrency(data.summary.totalRemainingAmount),
      note: "仍需通过支付层和催收层推进",
      emphasis: "info",
    },
  ];
}

export function OrdersWorkbench({
  role,
  data,
  canCreate,
  canReview,
  saveAction,
  reviewAction,
}: Readonly<{
  role: RoleCode;
  data: OrdersData;
  canCreate: boolean;
  canReview: boolean;
  saveAction: (formData: FormData) => Promise<void>;
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
              <StatusBadge label={canCreate ? "支持建单" : "只读"} variant={canCreate ? "success" : "neutral"} />
              <StatusBadge label={canReview ? "支持审核" : "待主管审核"} variant={canReview ? "warning" : "neutral"} />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link href="/payment-records" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                收款记录
              </Link>
              <Link
                href={buildOrderFulfillmentHref("shipping")}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                订单中心 / 发货执行
              </Link>
            </div>
          }
        />
      }
      summary={<PageSummaryStrip items={getSummaryItems(data)} />}
      toolbar={
        <PageToolbar
          eyebrow="快速筛选"
          secondary={
            <>
              <StatusBadge label={`COD 订单 ${data.summary.codOrderCount}`} variant="neutral" />
              <StatusBadge label={`订单金额 ${formatCurrency(data.summary.totalFinalAmount)}`} variant="success" />
            </>
          }
          primary={
            <>
              <Link
                href={buildOrdersHref(data.filters, {
                  reviewStatus: "PENDING_REVIEW",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                待审核
              </Link>
              <Link
                href={buildOrdersHref(data.filters, {
                  reviewStatus: "APPROVED",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                已通过
              </Link>
              <Link
                href={buildOrdersHref(data.filters, {
                  paymentScheme: "FULL_COD",
                  page: 1,
                })}
                className="crm-button crm-button-secondary"
              >
                COD 订单
              </Link>
              <Link href="/customers" className="crm-button crm-button-secondary">
                回到客户中心
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
              title: "订单工作面",
              description: "这里是交易主单层，不承接支付真相和履约真相。",
              items: [
                { label: "查看范围", value: meta.scope },
                { label: "当前页", value: `第 ${data.pagination.page} / ${data.pagination.totalPages} 页` },
                { label: "供应商筛选", value: data.filters.supplierId ? "已限定" : "全部供应商" },
                { label: "审核筛选", value: data.filters.reviewStatus || "全部状态" },
              ],
            },
            {
              eyebrow: "协同边界",
              title: "层次约束",
              items: [
                { label: "支付层", value: "PaymentPlan / PaymentRecord / CollectionTask 独立承接" },
                { label: "履约层", value: "ShippingTask 和 LogisticsFollowUpTask 独立承接" },
                { label: "建单入口", value: "优先从客户详情发起，而不是从订单页全局找客户" },
              ],
            },
            data.createCustomer
              ? {
                  eyebrow: "当前建单客户",
                  title: data.createCustomer.name,
                  items: [
                    { label: "手机号", value: data.createCustomer.phone },
                    { label: "负责人", value: data.createCustomer.owner?.name ?? "未分配" },
                    { label: "地址", value: data.createCustomer.address || "未填写" },
                  ],
                  footer: (
                    <Link href={`/customers/${data.createCustomer.id}`} className="crm-text-link">
                      打开客户详情
                    </Link>
                  ),
                }
              : {
                  eyebrow: "建单方式",
                  title: "建议从客户详情发起",
                  description: "订单页保留建单能力，但不再承担客户检索工作台角色。",
                },
          ]}
        />
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <SectionCard
        eyebrow="主列表"
        title="订单主列表"
        description="标题区、命令条、主列表和次级说明分层呈现。筛选和建单仍保留在主列表内部，避免业务能力损失。"
      >
        <SalesOrdersSection
          items={data.items}
          filters={data.filters}
          createCustomer={data.createCustomer}
          suppliers={data.suppliers}
          skuOptions={data.skuOptions}
          pagination={data.pagination}
          canCreate={canCreate}
          canReview={canReview}
          saveAction={saveAction}
          reviewAction={reviewAction}
        />
      </SectionCard>
    </WorkbenchLayout>
  );
}
