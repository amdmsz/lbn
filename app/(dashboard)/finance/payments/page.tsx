import { redirect } from "next/navigation";
import { FinancePaymentsSection } from "@/components/finance/finance-payments-section";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PageHeader } from "@/components/shared/page-header";
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
        eyebrow="财务中心"
        title="收款视图"
        description={undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-[var(--color-sidebar-muted)]">
            <span>{data.scopeLabel}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>PaymentRecord 主视图</span>
          </div>
        }
        actions={
          <a
            href={buildFinancePaymentsExportHref(data.filters)}
            className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-[13px]"
          >
            导出当前筛选结果
          </a>
        }
        className="px-4 py-2 md:px-5 md:py-2.5"
      />

      <FinanceSubnav active="payments" />

      <FinancePaymentsSection
        scopeLabel={data.scopeLabel}
        summaryCards={data.summaryCards}
        items={data.items}
        filters={data.filters}
        salesOptions={data.salesOptions}
        pagination={data.pagination}
      />
    </div>
  );
}
