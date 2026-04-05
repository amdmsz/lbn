import { Prisma, type RoleCode } from "@prisma/client";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessSupplierModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type SupplierViewer = {
  id: string;
  role: RoleCode;
};

function getLatestDate(values: Array<Date | null | undefined>) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime());

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

export async function getSuppliersPageData(
  viewer: SupplierViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessSupplierModule(viewer.role)) {
    throw new Error("You do not have access to supplier management.");
  }

  const keyword = getParamValue(rawSearchParams?.supplierQ).trim();
  const status = getParamValue(rawSearchParams?.supplierStatus);
  const filters: Prisma.SupplierWhereInput[] = [];

  if (status === "enabled") {
    filters.push({ enabled: true });
  }

  if (status === "disabled") {
    filters.push({ enabled: false });
  }

  if (keyword) {
    filters.push({
      OR: [
        { code: { contains: keyword } },
        { name: { contains: keyword } },
        { contactName: { contains: keyword } },
        { contactPhone: { contains: keyword } },
        { remark: { contains: keyword } },
      ],
    });
  }

  const where: Prisma.SupplierWhereInput = filters.length > 0 ? { AND: filters } : {};

  const suppliers = await prisma.supplier.findMany({
    where,
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      contactName: true,
      contactPhone: true,
      remark: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      products: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          updatedAt: true,
        },
      },
      salesOrders: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      },
      shippingTasks: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
        },
      },
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  const items = suppliers.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    contactName: item.contactName,
    contactPhone: item.contactPhone,
    remark: item.remark,
    enabled: item.enabled,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastUsedAt: getLatestDate([
      item.products[0]?.updatedAt,
      item.salesOrders[0]?.createdAt,
      item.shippingTasks[0]?.createdAt,
    ]),
    _count: item._count,
  }));

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      supplierQ: keyword,
      supplierStatus: status,
    },
    items,
  };
}
