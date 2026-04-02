import { redirect } from "next/navigation";
import { LiveSessionsSection } from "@/components/live-sessions/live-sessions-section";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  WorkspaceGuide,
  type WorkspaceGuideItem,
} from "@/components/shared/workspace-guide";
import { auth } from "@/lib/auth/session";
import {
  canAccessLiveSessionModule,
  canManageLiveSessions,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { getLiveSessionsData } from "@/lib/live-sessions/queries";

export default async function LiveSessionsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessLiveSessionModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const data = await getLiveSessionsData({
    id: session.user.id,
    role: session.user.role,
  });
  const canManage = canManageLiveSessions(session.user.role);
  const guideItems: WorkspaceGuideItem[] =
    session.user.role === "OPS"
      ? [
          {
            title: "场次协同",
            description: "OPS 在这里维护直播场次基础信息，并为后续直播商品和礼品资格协同提供入口。",
            badgeLabel: "运营主线",
            badgeVariant: "info" as const,
          },
          {
            title: "礼品资格联动",
            description: "礼品资格和直播场次有关时，后续回到礼品管理继续处理。",
            href: "/gifts",
            hrefLabel: "进入礼品管理",
            badgeLabel: "礼品协同",
            badgeVariant: "warning" as const,
          },
        ]
      : session.user.role === "SALES"
        ? [
            {
              title: "邀约参考",
              description: "销售在这里查看可用场次，再回到客户详情处理直播邀约与观看记录。",
              href: "/customers",
              hrefLabel: "回到客户中心",
              badgeLabel: "客户承接",
              badgeVariant: "success" as const,
            },
            {
              title: "工作边界",
              description: "销售不在这里做全局场次维护，只把直播场次作为客户运营链路的辅助入口。",
              badgeLabel: "只读协同",
              badgeVariant: "warning" as const,
            },
          ]
        : [
            {
              title: "场次维护",
              description: "管理员与主管可在这里统一维护直播场次、房间信息与基础运营数据。",
              badgeLabel: "管理入口",
              badgeVariant: "info" as const,
            },
            {
              title: "客户运营回流",
              description: "直播邀约与观看记录仍回到客户详情承接，不把客户主链搬到直播页。",
              href: "/customers",
              hrefLabel: "进入客户中心",
              badgeLabel: "客户回流",
              badgeVariant: "success" as const,
            },
          ];

  return (
    <div className="crm-page">
      <PageHeader
        title="直播场次"
        description="直播场次页承接直播协同和邀约参考，不承担销售客户主链，也不承担支付或履约主链。"
        actions={
          <StatusBadge
            label={canManage ? "支持场次维护" : "当前角色仅查看"}
            variant={canManage ? "info" : "warning"}
          />
        }
      />

      <WorkspaceGuide
        title="直播场次承接方式"
        description="直播场次是客户运营域中的协同入口。场次维护、邀请参考和礼品资格都从这里出发，再回流到客户或礼品页面。"
        items={guideItems}
      />

      <DataTableWrapper
        title="直播场次列表"
        description="支持创建直播场次、查看房间信息、邀约数量和礼品记录概览。"
      >
        <LiveSessionsSection items={data.items} canManage={canManage} />
      </DataTableWrapper>
    </div>
  );
}
