import { redirect } from "next/navigation";
import { ReportOverview } from "@/components/reports/report-overview";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessReportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getReportsPageData } from "@/lib/reports/queries";

export default async function ReportsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessReportModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const data = await getReportsPageData({
    id: session.user.id,
    role: session.user.role,
  });

  return (
    <div className="crm-page">
      <PageHeader
        title="报表中心"
        description="统一承接经营、履约与财务预览摘要，为 ADMIN / SUPERVISOR 提供清晰的数据分析入口。"
        actions={
          <>
            <StatusBadge label="团队报表" variant="info" />
            <StatusBadge label="近 30 天口径" variant="success" />
            <StatusBadge label="财务预览已接入" variant="warning" />
          </>
        }
      />

      <WorkspaceGuide
        title="报表中心承接方式"
        description="报表中心只负责经营分析与管理回看，不替代交易页、履约页或完整财务中心。"
        items={[
          {
            title: "经营总览",
            description: "统一回看客户运营、交易推进和履约摘要，不把各业务动作搬到报表页。",
            badgeLabel: "管理视角",
            badgeVariant: "info",
          },
          {
            title: "财务收款预览",
            description: "从这里继续进入财务收款预览，看确认、待确认和收款记录摘要。",
            href: "/finance/payments",
            hrefLabel: "进入财务收款",
            badgeLabel: "财务预览",
            badgeVariant: "warning",
          },
          {
            title: "对账与异常",
            description: "对账预览和异常页仍是预览层，用于发现问题后再回流到业务域处理。",
            href: "/finance/reconciliation",
            hrefLabel: "进入对账预览",
            badgeLabel: "回流入口",
            badgeVariant: "success",
          },
          {
            title: "异常回流",
            description: "发现异常后继续回到订单、收款或履约页面处理，不在报表页直接执行业务动作。",
            href: "/finance/exceptions",
            hrefLabel: "查看异常预览",
            badgeLabel: "异常闭环",
            badgeVariant: "neutral",
          },
        ]}
        gridClassName="md:grid-cols-2 xl:grid-cols-4"
      />

      <ReportOverview
        cards={data.cards}
        conversions={data.conversions}
        ranking={data.ranking}
        paymentSummary={data.paymentSummary}
        fulfillmentSummary={data.fulfillmentSummary}
        financeSummary={data.financeSummary}
        definitions={data.definitions}
        scopeLabel="团队报表"
      />
    </div>
  );
}
