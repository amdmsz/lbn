import { redirect } from "next/navigation";
import { ShippingExportBatchesSection } from "@/components/shipping/shipping-export-batches-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessShippingExportBatchModule,
  canManageShippingReporting,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getShippingExportBatchesPageData } from "@/lib/shipping/queries";

export default async function ShippingExportBatchesPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessShippingExportBatchModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getShippingExportBatchesPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canManageReporting = canManageShippingReporting(session.user.role);

  return (
    <div className="crm-page">
      <PageHeader
        title="报单批次"
        description="报单批次页承接按供货商导出的批次回看、导出文件与关联发货任务，不替代发货执行台。"
        actions={
          <StatusBadge
            label={canManageReporting ? "支持创建批次" : "只读回看"}
            variant={canManageReporting ? "success" : "neutral"}
          />
        }
      />

      <WorkspaceGuide
        title="报单批次承接方式"
        description="发货中心负责执行，报单批次页负责回看历史批次、导出文件和供货商维度的报单记录。"
        items={[
          {
            title: "回到发货中心",
            description: "需要继续处理待报单、回填物流或推进发货状态时，回到发货中心操作。",
            href: "/shipping",
            hrefLabel: "进入发货中心",
            badgeLabel: "执行入口",
            badgeVariant: "success",
          },
          {
            title: "供货商维度回看",
            description: "按供货商回看每次导出批次和导出文件，避免把批次历史埋在发货列表里。",
            badgeLabel: "历史回看",
            badgeVariant: "info",
          },
        ]}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="批次列表"
        description="此处保留导出批次、文件名和下载地址，供履约与审核回看报单执行记录。"
      >
        <ShippingExportBatchesSection items={data.items} pagination={data.pagination} />
      </DataTableWrapper>
    </div>
  );
}
