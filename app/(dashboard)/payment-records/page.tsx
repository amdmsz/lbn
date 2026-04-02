import { redirect } from "next/navigation";
import { PaymentRecordsSection } from "@/components/payments/payment-records-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  WorkspaceGuide,
  type WorkspaceGuideItem,
} from "@/components/shared/workspace-guide";
import {
  canAccessPaymentRecordModule,
  canConfirmPaymentRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getPaymentRecordsPageData } from "@/lib/payments/queries";
import { reviewPaymentRecordAction } from "./actions";

export default async function PaymentRecordsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessPaymentRecordModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getPaymentRecordsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canConfirm = canConfirmPaymentRecord(session.user.role);
  const guideItems: WorkspaceGuideItem[] =
    session.user.role === "SALES"
      ? [
          {
            title: "本人收款提交",
            description: "销售只看本人客户相关收款记录，在这里提交和回看收款，不查看团队总账。",
            badgeLabel: "本人范围",
            badgeVariant: "info" as const,
          },
          {
            title: "催收任务联动",
            description: "提交收款后，催收任务仍独立在催收任务页推进，不把两者混在一个列表里。",
            href: "/collection-tasks",
            hrefLabel: "进入催收任务",
            badgeLabel: "下游跟进",
            badgeVariant: "success" as const,
          },
          {
            title: "客户与订单回流",
            description: "收款结果同时回流到客户与订单详情，但客户中心仍是销售日常主入口。",
            href: "/customers",
            hrefLabel: "回到客户中心",
            badgeLabel: "客户回流",
            badgeVariant: "warning" as const,
          },
        ]
      : [
          {
            title: "团队 / 全量确认",
            description: "主管和管理员在这里查看团队或全量收款提交，并完成确认或驳回。",
            badgeLabel: "确认入口",
            badgeVariant: "info" as const,
          },
          {
            title: "催收任务联动",
            description: "待收和异常跟进继续由催收任务页承接，不把催收动作塞回收款记录列表。",
            href: "/collection-tasks",
            hrefLabel: "进入催收任务",
            badgeLabel: "催收协同",
            badgeVariant: "success" as const,
          },
          {
            title: "财务预览入口",
            description: "财务预览不是本页主入口，管理员和主管继续通过报表与摘要卡片进入。",
            href: "/finance/payments",
            hrefLabel: "查看财务收款视图",
            badgeLabel: "财务预览",
            badgeVariant: "warning" as const,
          },
        ];

  return (
    <div className="crm-page">
      <PageHeader
        title="收款记录"
        description="收款记录页统一查看订单与礼品运费的收款提交和确认结果，但不承接完整财务中心。"
        actions={
          <>
            <StatusBadge
              label={session.user.role === "SALES" ? "我的收款记录" : "团队 / 全局视角"}
              variant={session.user.role === "SALES" ? "info" : "warning"}
            />
            <StatusBadge
              label={canConfirm ? "支持确认" : "仅可提交"}
              variant={canConfirm ? "success" : "neutral"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="收款记录承接方式"
        description="收款记录负责承接 PaymentRecord 的提交与确认。待收跟进仍回到催收任务，财务汇总仍留在报表和财务预览。"
        items={guideItems}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="收款记录工作台"
        description="PaymentRecord 用于记录收款提交；主管和管理员可在此确认或驳回。"
      >
        <PaymentRecordsSection
          items={data.items}
          filters={data.filters}
          pagination={data.pagination}
          canConfirmPaymentRecord={canConfirm}
          reviewPaymentRecordAction={reviewPaymentRecordAction}
        />
      </DataTableWrapper>
    </div>
  );
}
