import { redirect } from "next/navigation";
import { CustomerCenterWorkbench } from "@/components/customers/customer-center-workbench";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  readCursorFromSearchParams,
  CUSTOMER_LIST_CURSOR_PARAM,
} from "@/lib/customers/list-cursor";
import {
  getCustomerCenterData,
  getCustomerCenterDataCursor,
} from "@/lib/customers/queries";
import { isOutboundCallRuntimeEnabled } from "@/lib/outbound-calls/config";
import { moveCustomerToRecycleBinAction } from "./[id]/actions";

export default async function CustomersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const canCreateCalls = canCreateCallRecord(session.user.role);

  // F08 phase 2: 带 `cursor` 参数时走 keyset cursor 路径 (走索引, 不再过 1500
  // hard cap). 不带 cursor 时仍走旧 `getCustomerCenterData` (向后兼容老 link
  // / 含派生筛选的链接). cursor 路径的简单 filter (search/owner/team) 推到
  // prisma where; 复杂 filter (执行类型/queue/tag/product/日期) 留 phase 3.
  const hasCursorParam =
    resolvedSearchParams?.[CUSTOMER_LIST_CURSOR_PARAM] !== undefined;
  const parsedCursor = hasCursorParam
    ? readCursorFromSearchParams(resolvedSearchParams)
    : null;

  const [data, outboundCallEnabled] = await Promise.all([
    hasCursorParam
      ? getCustomerCenterDataCursor(
          {
            id: session.user.id,
            role: session.user.role,
          },
          resolvedSearchParams,
          parsedCursor,
        )
      : getCustomerCenterData(
          {
            id: session.user.id,
            role: session.user.role,
          },
          resolvedSearchParams,
        ),
    canCreateCalls ? isOutboundCallRuntimeEnabled() : Promise.resolve(false),
  ]);

  return (
    <CustomerCenterWorkbench
      role={session.user.role}
      data={data}
      outboundCallEnabled={outboundCallEnabled}
      moveCustomerToRecycleBinAction={moveCustomerToRecycleBinAction}
    />
  );
}
