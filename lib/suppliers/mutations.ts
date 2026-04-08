import {
  OperationModule,
  OperationTargetType,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canManageSuppliers } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export type SupplierActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

const upsertSupplierSchema = z.object({
  id: z.string().trim().default(""),
  code: z.string().trim().min(1, "请填写供货商编码").max(50),
  name: z.string().trim().min(1, "请填写供货商名称").max(120),
  contactName: z.string().trim().max(120).default(""),
  contactPhone: z.string().trim().max(30).default(""),
  remark: z.string().trim().max(1000).default(""),
});

export async function upsertSupplier(
  actor: SupplierActor,
  rawInput: z.input<typeof upsertSupplierSchema>,
) {
  if (!canManageSuppliers(actor.role, actor.permissionCodes)) {
    throw new Error("当前角色无权维护供货商。");
  }

  const input = upsertSupplierSchema.parse(rawInput);
  const existingByCode = await prisma.supplier.findFirst({
    where: {
      code: input.code,
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
    select: { id: true },
  });

  if (existingByCode) {
    throw new Error("供货商编码已存在。");
  }

  const existing = input.id
    ? await prisma.supplier.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          code: true,
          name: true,
          contactName: true,
          contactPhone: true,
          remark: true,
          enabled: true,
        },
      })
    : null;

  const supplier = existing
    ? await prisma.supplier.update({
        where: { id: existing.id },
        data: {
          code: input.code,
          name: input.name,
          contactName: input.contactName || null,
          contactPhone: input.contactPhone || null,
          remark: input.remark || null,
          updatedById: actor.id,
        },
        select: { id: true, name: true, code: true },
      })
    : await prisma.supplier.create({
        data: {
          code: input.code,
          name: input.name,
          contactName: input.contactName || null,
          contactPhone: input.contactPhone || null,
          remark: input.remark || null,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: { id: true, name: true, code: true },
      });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.SUPPLIER,
      action: existing ? "supplier.updated" : "supplier.created",
      targetType: OperationTargetType.SUPPLIER,
      targetId: supplier.id,
      description: `${existing ? "更新" : "创建"}供货商：${supplier.name}`,
      beforeData: existing ?? undefined,
      afterData: input,
    },
  });

  return supplier;
}

export async function toggleSupplier(actor: SupplierActor, supplierId: string) {
  if (!canManageSuppliers(actor.role, actor.permissionCodes)) {
    throw new Error("当前角色无权维护供货商。");
  }

  const existing = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: {
      id: true,
      name: true,
      enabled: true,
    },
  });

  if (!existing) {
    throw new Error("供货商不存在。");
  }

  const updated = await prisma.supplier.update({
    where: { id: existing.id },
    data: {
      enabled: !existing.enabled,
      updatedById: actor.id,
    },
    select: {
      id: true,
      enabled: true,
    },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.SUPPLIER,
      action: "supplier.toggled",
      targetType: OperationTargetType.SUPPLIER,
      targetId: existing.id,
      description: `${updated.enabled ? "启用" : "停用"}供货商：${existing.name}`,
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
