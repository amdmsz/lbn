import {
  OperationModule,
  OperationTargetType,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canCreateProducts, canManageProducts } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export type ProductActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

const upsertProductSchema = z.object({
  id: z.string().trim().default(""),
  supplierId: z.string().trim().min(1, "请选择供货商"),
  code: z.string().trim().min(1, "请填写商品编码").max(50),
  name: z.string().trim().min(1, "请填写商品名称").max(120),
  description: z.string().trim().max(1000).default(""),
});

const upsertProductSkuSchema = z.object({
  id: z.string().trim().default(""),
  productId: z.string().trim().min(1, "缺少商品信息"),
  skuCode: z.string().trim().min(1, "请填写 SKU 编码").max(50),
  skuName: z.string().trim().min(1, "请填写 SKU 名称").max(120),
  specText: z.string().trim().min(1, "请填写规格").max(120),
  unit: z.string().trim().min(1, "请填写单位").max(30),
  defaultUnitPrice: z.coerce.number().min(0, "默认单价不能小于 0"),
  codSupported: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
  insuranceSupported: z
    .enum(["true", "false"])
    .transform((value) => value === "true"),
  defaultInsuranceAmount: z.coerce.number().min(0, "保价金额不能小于 0"),
});

function ensureManageProducts(actor: ProductActor) {
  if (!canManageProducts(actor.role, actor.permissionCodes)) {
    throw new Error("当前角色无权维护商品主数据。");
  }
}

function ensureCreateProducts(actor: ProductActor) {
  if (!canCreateProducts(actor.role, actor.permissionCodes)) {
    throw new Error("当前角色无权新建商品。");
  }
}

export async function upsertProduct(
  actor: ProductActor,
  rawInput: z.input<typeof upsertProductSchema>,
) {
  const input = upsertProductSchema.parse(rawInput);

  if (input.id) {
    ensureManageProducts(actor);
  } else {
    ensureCreateProducts(actor);
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: input.supplierId },
    select: { id: true, name: true },
  });

  if (!supplier) {
    throw new Error("供货商不存在。");
  }

  const existingByCode = await prisma.product.findFirst({
    where: {
      code: input.code,
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
    select: { id: true },
  });

  if (existingByCode) {
    throw new Error("商品编码已存在。");
  }

  const existing = input.id
    ? await prisma.product.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          supplierId: true,
          code: true,
          name: true,
          description: true,
          enabled: true,
        },
      })
    : null;

  const product = existing
    ? await prisma.product.update({
        where: { id: existing.id },
        data: {
          supplierId: input.supplierId,
          code: input.code,
          name: input.name,
          description: input.description || null,
          updatedById: actor.id,
        },
        select: { id: true, name: true },
      })
    : await prisma.product.create({
        data: {
          supplierId: input.supplierId,
          code: input.code,
          name: input.name,
          description: input.description || null,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true, name: true },
      });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: existing ? "product.updated" : "product.created",
      targetType: OperationTargetType.PRODUCT,
      targetId: product.id,
      description: `${existing ? "更新" : "创建"}商品：${product.name}`,
      beforeData: existing ?? undefined,
      afterData: {
        ...input,
        supplierName: supplier.name,
      },
    },
  });

  return product;
}

export async function toggleProduct(actor: ProductActor, productId: string) {
  ensureManageProducts(actor);

  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      enabled: true,
    },
  });

  if (!existing) {
    throw new Error("商品不存在。");
  }

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data: {
      enabled: !existing.enabled,
      updatedById: actor.id,
    },
    select: {
      enabled: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: "product.toggled",
      targetType: OperationTargetType.PRODUCT,
      targetId: existing.id,
      description: `${updated.enabled ? "启用" : "停用"}商品：${existing.name}`,
      beforeData: { enabled: existing.enabled },
      afterData: { enabled: updated.enabled },
    },
  });

  return {
    id: existing.id,
    name: existing.name,
    enabled: updated.enabled,
  };
}

export async function upsertProductSku(
  actor: ProductActor,
  rawInput: z.input<typeof upsertProductSkuSchema>,
) {
  ensureManageProducts(actor);
  const input = upsertProductSkuSchema.parse(rawInput);

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true, name: true },
  });

  if (!product) {
    throw new Error("商品不存在。");
  }

  const existingByCode = await prisma.productSku.findFirst({
    where: {
      skuCode: input.skuCode,
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
    select: { id: true },
  });

  if (existingByCode) {
    throw new Error("SKU 编码已存在。");
  }

  const existing = input.id
    ? await prisma.productSku.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          skuCode: true,
          skuName: true,
          specText: true,
          unit: true,
          defaultUnitPrice: true,
          codSupported: true,
          insuranceSupported: true,
          defaultInsuranceAmount: true,
          enabled: true,
        },
      })
    : null;

  const sku = existing
    ? await prisma.productSku.update({
        where: { id: existing.id },
        data: {
          skuCode: input.skuCode,
          skuName: input.skuName,
          specText: input.specText,
          unit: input.unit,
          defaultUnitPrice: input.defaultUnitPrice,
          codSupported: input.codSupported,
          insuranceSupported: input.insuranceSupported,
          defaultInsuranceAmount: input.defaultInsuranceAmount,
        },
        select: { id: true, skuName: true },
      })
    : await prisma.productSku.create({
        data: {
          productId: input.productId,
          skuCode: input.skuCode,
          skuName: input.skuName,
          specText: input.specText,
          unit: input.unit,
          defaultUnitPrice: input.defaultUnitPrice,
          codSupported: input.codSupported,
          insuranceSupported: input.insuranceSupported,
          defaultInsuranceAmount: input.defaultInsuranceAmount,
        },
        select: { id: true, skuName: true },
      });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: existing ? "product_sku.updated" : "product_sku.created",
      targetType: OperationTargetType.PRODUCT_SKU,
      targetId: sku.id,
      description: `${existing ? "更新" : "创建"} SKU：${sku.skuName}`,
      beforeData: existing
        ? {
            ...existing,
            defaultUnitPrice: existing.defaultUnitPrice.toString(),
            defaultInsuranceAmount: existing.defaultInsuranceAmount.toString(),
          }
        : undefined,
      afterData: input,
    },
  });

  return sku;
}

export async function toggleProductSku(actor: ProductActor, skuId: string) {
  ensureManageProducts(actor);

  const existing = await prisma.productSku.findUnique({
    where: { id: skuId },
    select: {
      id: true,
      skuName: true,
      enabled: true,
    },
  });

  if (!existing) {
    throw new Error("SKU 不存在。");
  }

  const updated = await prisma.productSku.update({
    where: { id: existing.id },
    data: {
      enabled: !existing.enabled,
    },
    select: {
      enabled: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.PRODUCT,
      action: "product_sku.toggled",
      targetType: OperationTargetType.PRODUCT_SKU,
      targetId: existing.id,
      description: `${updated.enabled ? "启用" : "停用"} SKU：${existing.skuName}`,
      beforeData: { enabled: existing.enabled },
      afterData: { enabled: updated.enabled },
    },
  });

  return {
    id: existing.id,
    skuName: existing.skuName,
    enabled: updated.enabled,
  };
}
