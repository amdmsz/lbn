import Link from "next/link";
import { redirect } from "next/navigation";
import { ReportOverview } from "@/components/reports/report-overview";
import { PageHeader } from "@/components/shared/page-header";
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
    teamId: session.user.teamId,
  });

  return (
    <div className="crm-page">
      <PageHeader
        eyebrow="报表中心"
        title="经营报表"
        description="经营、履约与财务预览，只读回看。"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-[var(--color-sidebar-muted)]">
            <span>团队报表</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>近 30 天窗口</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>只读分析</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/finance/payments"
              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
            >
              财务收款
            </Link>
            <Link
              href="/finance/exceptions"
              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
            >
              查看异常
            </Link>
          </div>
        }
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
