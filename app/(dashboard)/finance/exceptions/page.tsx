import { redirect } from "next/navigation";
import { FinanceExceptionsSection } from "@/components/finance/finance-exceptions-section";
import { FinanceSubnav } from "@/components/finance/finance-subnav";
import { PageHeader } from "@/components/shared/page-header";
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
        eyebrow="财务中心"
        title="异常预览"
        description={undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-[var(--color-sidebar-muted)]">
            <span>{data.scopeLabel}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>异常回流入口</span>
          </div>
        }
        className="px-4 py-2 md:px-5 md:py-2.5"
      />

      <FinanceSubnav active="exceptions" />

      <FinanceExceptionsSection
        scopeLabel={data.scopeLabel}
        summaryCards={data.summaryCards}
        groupedCounts={data.groupedCounts}
        items={data.items}
      />
    </div>
  );
}
