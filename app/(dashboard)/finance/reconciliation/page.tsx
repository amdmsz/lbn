import { redirect } from "next/navigation";
import { FinanceReconciliationSection } from "@/components/finance/finance-reconciliation-section";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessFinanceModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getFinanceReconciliationPageData } from "@/lib/finance/queries";

export default async function FinanceReconciliationPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessFinanceModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const data = await getFinanceReconciliationPageData({
    id: session.user.id,
    role: session.user.role,
  });

  return (
    <div className="crm-page">
      <PageHeader
        title="财务对账预览"
        description="基于 PaymentPlan / PaymentRecord / CollectionTask 的聚合结果，做首版 finance reconciliation preview。"
        actions={
          <>
            <StatusBadge label={data.scopeLabel} variant="info" />
            <StatusBadge label="只读对账" variant="warning" />
          </>
        }
      />

      <FinanceSubnav active="reconciliation" />

      <DataTableWrapper
        title="对账口径与拆分"
        description="展示应收、已确认、待确认、待收、COD 待回款和礼品运费待收的统一口径。"
      >
        <FinanceReconciliationSection
          scopeLabel={data.scopeLabel}
          summaryCards={data.summaryCards}
          operationalCards={data.operationalCards}
          metricDefinitions={data.metricDefinitions}
          sourceBreakdown={data.sourceBreakdown}
          collectionTaskBreakdown={data.collectionTaskBreakdown}
        />
      </DataTableWrapper>
    </div>
  );
}
