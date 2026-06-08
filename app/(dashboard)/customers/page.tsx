import { redirect } from "next/navigation";
import { CustomerCenterWorkbench } from "@/components/customers/customer-center-workbench";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { readCursorFromSearchParams } from "@/lib/customers/list-cursor";
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

  // F18 customers/perf phase 3: 默认走 page mode (页码 + 每页选择, 销售业务
  // 习惯). page mode 内部 SQL OFFSET/LIMIT 真分页 + SQL aggregate, 不再依赖
  // 5826 内存全表加载. 只有外部带 `?cursor=` 显式触发 cursor 模式时, 才走
  // `getCustomerCenterDataCursor` 作为 fallback.
  const parsedCursor = readCursorFromSearchParams(resolvedSearchParams);
  const viewer = {
    id: session.user.id,
    role: session.user.role,
  };

  const [data, outboundCallEnabled] = await Promise.all([
    parsedCursor
      ? getCustomerCenterDataCursor(viewer, resolvedSearchParams, parsedCursor)
      : getCustomerCenterData(viewer, resolvedSearchParams),
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
