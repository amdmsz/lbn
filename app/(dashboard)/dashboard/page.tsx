import { redirect } from "next/navigation";
import { DashboardWorkbench } from "@/components/dashboard/dashboard-workbench";
import { getDefaultRouteForRole, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildPendingFirstCallCustomerWhereInput,
  buildWechatPendingCustomerWhereInput,
} from "@/lib/customers/queries";
import { prisma } from "@/lib/db/prisma";
import { getNavigationGroupsForRole } from "@/lib/navigation";
import { getDashboardData } from "@/lib/reports/queries";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;
  const navigationGroups = getNavigationGroupsForRole(
    role,
    session.user.permissionCodes,
  );

  if (navigationGroups.length === 0) {
    redirect(getDefaultRouteForRole(role));
  }

  const data = await getDashboardData({
    id: session.user.id,
    role,
    permissionCodes: session.user.permissionCodes,
  });

  const extraCards =
    role === "SALES"
      ? await (async () => {
          const customerScope = getCustomerScope(role, session.user.id);

          if (!customerScope) {
            return [];
          }

          const [pendingFirstCallCount, pendingWechatCount] = await Promise.all([
            prisma.customer.count({
              where: {
                AND: [customerScope, buildPendingFirstCallCustomerWhereInput()],
              },
            }),
            prisma.customer.count({
              where: {
                AND: [customerScope, buildWechatPendingCustomerWhereInput()],
              },
            }),
          ]);

          return [
            {
              label: "待首呼客户",
              value: String(pendingFirstCallCount),
              note: "先回到客户中心消化首呼队列。",
              href: "/customers?queue=pending_first_call",
            },
            {
              label: "待微信通过",
              value: String(pendingWechatCount),
              note: "回到客户中心处理微信触点。",
              href: "/customers?queue=pending_wechat",
            },
          ];
        })()
      : [];

  return (
    <DashboardWorkbench
      role={role}
      permissionCodes={session.user.permissionCodes}
      navigationGroups={navigationGroups}
      data={data}
      extraCards={extraCards}
    />
  );
}
