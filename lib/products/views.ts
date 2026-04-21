import { Prisma, type RoleCode } from "@prisma/client";
import { z } from "zod";
import { canAccessProductModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import {
  PRODUCT_CENTER_EMPTY_SAVED_FILTERS,
  PRODUCT_CENTER_SAVED_FILTER_KEYS,
  type ProductCenterPrimaryTab,
  type ProductCenterSavedFilters,
} from "@/lib/products/metadata";

export type ProductViewActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

const productSavedViewTabSchema = z.enum(["products", "skus"]);

const productSavedViewFiltersSchema = z.object({
  q: z.string().trim().default(""),
  status: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  brandName: z.string().trim().default(""),
  seriesName: z.string().trim().default(""),
  categoryCode: z.string().trim().default(""),
  primarySalesSceneCode: z.string().trim().default(""),
  supplyGroupCode: z.string().trim().default(""),
  financeCategoryCode: z.string().trim().default(""),
  preset: z.string().trim().default(""),
});

const saveProductSavedViewSchema = z.object({
  name: z.string().trim().min(1, "请输入视图名称。").max(60, "视图名称不能超过 60 个字符。"),
  tab: productSavedViewTabSchema,
  filters: productSavedViewFiltersSchema,
});

function ensureProductViewAccess(actor: ProductViewActor) {
  if (!canAccessProductModule(actor.role, actor.permissionCodes)) {
    throw new Error("当前角色无权访问商品中心视图。");
  }
}

export function parseProductSavedViewFilters(rawFilters: unknown): ProductCenterSavedFilters {
  if (!rawFilters || typeof rawFilters !== "object" || Array.isArray(rawFilters)) {
    return PRODUCT_CENTER_EMPTY_SAVED_FILTERS;
  }

  const objectFilters = rawFilters as Record<string, unknown>;
  const normalizedInput = Object.fromEntries(
    PRODUCT_CENTER_SAVED_FILTER_KEYS.map((key) => [key, objectFilters[key]]),
  );

  return productSavedViewFiltersSchema.parse(normalizedInput);
}

export async function listProductSavedViews(actor: ProductViewActor) {
  ensureProductViewAccess(actor);

  const items = await prisma.productSavedView.findMany({
    where: {
      ownerId: actor.id,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      tab: true,
      filtersJson: true,
      updatedAt: true,
    },
  });

  return items
    .map((item) => {
      const tabParseResult = productSavedViewTabSchema.safeParse(item.tab);

      if (!tabParseResult.success) {
        return null;
      }

      return {
        id: item.id,
        name: item.name,
        tab: tabParseResult.data as ProductCenterPrimaryTab,
        filters: parseProductSavedViewFilters(item.filtersJson),
        updatedAt: item.updatedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function saveProductSavedView(
  actor: ProductViewActor,
  rawInput: z.input<typeof saveProductSavedViewSchema>,
) {
  ensureProductViewAccess(actor);
  const input = saveProductSavedViewSchema.parse(rawInput);

  return prisma.productSavedView.create({
    data: {
      ownerId: actor.id,
      name: input.name,
      tab: input.tab,
      filtersJson: input.filters as unknown as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      name: true,
      tab: true,
      filtersJson: true,
      updatedAt: true,
    },
  });
}

export async function deleteProductSavedView(actor: ProductViewActor, viewId: string) {
  ensureProductViewAccess(actor);

  const savedView = await prisma.productSavedView.findUnique({
    where: { id: viewId },
    select: {
      id: true,
      ownerId: true,
    },
  });

  if (!savedView || savedView.ownerId !== actor.id) {
    throw new Error("保存视图不存在，或你无权删除。");
  }

  await prisma.productSavedView.delete({
    where: { id: savedView.id },
  });

  return savedView.id;
}
