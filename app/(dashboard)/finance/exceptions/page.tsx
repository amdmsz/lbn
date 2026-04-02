import { redirect } from "next/navigation";
import { FinanceExceptionsSection } from "@/components/finance/finance-exceptions-section";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessFinanceModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getFinanceExceptionsPageData } from "@/lib/finance/queries";

export default async function FinanceExceptionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessFinanceModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const data = await getFinanceExceptionsPageData({
    id: session.user.id,
    role: session.user.role,
  });

  return (
    <div className="crm-page">
      <PageHeader
        title="财务异常预览"
        description="集中识别异常订单、异常收款和异常履约，并提供来源说明与跳转入口。"
        actions={
          <>
            <StatusBadge label={data.scopeLabel} variant="info" />
            <StatusBadge label="异常预览" variant="danger" />
          </>
        }
      />

      <FinanceSubnav active="exceptions" />

      <DataTableWrapper
        title="异常列表"
        description="当前阶段只做人工核对入口，不自动关单、不自动对账，也不接真实支付或物流 API。"
      >
        <FinanceExceptionsSection
          scopeLabel={data.scopeLabel}
          summaryCards={data.summaryCards}
          groupedCounts={data.groupedCounts}
          items={data.items}
        />
      </DataTableWrapper>
    </div>
  );
}
