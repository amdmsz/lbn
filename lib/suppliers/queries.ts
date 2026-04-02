import type { RoleCode } from "@prisma/client";
import { parseActionNotice } from "@/lib/action-notice";
import { canAccessSupplierModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type SupplierViewer = {
  id: string;
  role: RoleCode;
};

export async function getSuppliersPageData(
  viewer: SupplierViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessSupplierModule(viewer.role)) {
    throw new Error("当前角色无权访问供货商中心。");
  }

  const items = await prisma.supplier.findMany({
    orderBy: [{ enabled: "desc" }, { name: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      contactName: true,
      contactPhone: true,
      remark: true,
      enabled: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          salesOrders: true,
          shippingTasks: true,
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    items,
  };
}
