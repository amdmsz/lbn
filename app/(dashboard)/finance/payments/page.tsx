import { redirect } from "next/navigation";
import { FinancePaymentsSection } from "@/components/finance/finance-payments-section";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessFinanceModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { buildFinancePaymentsExportHref } from "@/lib/finance/export";
import { getFinancePaymentsPageData } from "@/lib/finance/queries";

export default async function FinancePaymentsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessFinanceModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getFinancePaymentsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <PageHeader
        title="财务收款视图"
        description="以 PaymentRecord 为主查看已提交、待确认和已确认收款，不扩展到开票、结算或支付网关。"
        actions={
          <>
            <StatusBadge label={data.scopeLabel} variant="info" />
            <StatusBadge label="PaymentRecord 主视图" variant="success" />
          </>
        }
      />

      <FinanceSubnav active="payments" />

      <DataTableWrapper
        title="收款记录"
        description="按订单编号、客户、销售、收款渠道、收款状态和日期范围筛选财务收款视图。"
        toolbar={
          <a
            href={buildFinancePaymentsExportHref(data.filters)}
            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
          >
            导出当前筛选结果
          </a>
        }
      >
        <FinancePaymentsSection
          scopeLabel={data.scopeLabel}
          summaryCards={data.summaryCards}
          items={data.items}
          filters={data.filters}
          salesOptions={data.salesOptions}
          pagination={data.pagination}
        />
      </DataTableWrapper>
    </div>
  );
}
