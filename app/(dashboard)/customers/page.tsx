import { redirect } from "next/navigation";
import { CustomerCenterWorkbench } from "@/components/customers/customer-center-workbench";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { readCursorFromSearchParams } from "@/lib/customers/list-cursor";
import { getCustomerCenterDataCursor } from "@/lib/customers/queries";
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

  // F17 customers/perf phase 2: /customers 默认走 SQL aggregate + keyset
  // cursor 路径, 不再依赖 5826 内存全表加载. 没有 `?cursor=` 时也走 cursor
  // 模式 (第一页). 旧 page-number `getCustomerCenterData` 仅 backward compat
  // (export / batch / mobile), UI 已不再走它.
  const parsedCursor = readCursorFromSearchParams(resolvedSearchParams);

  const [data, outboundCallEnabled] = await Promise.all([
    getCustomerCenterDataCursor(
      {
        id: session.user.id,
        role: session.user.role,
      },
      resolvedSearchParams,
      parsedCursor,
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
