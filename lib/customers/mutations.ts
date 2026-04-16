import {
  OperationModule,
  OperationTargetType,
  type CustomerLevel,
  type CustomerStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  getCustomerScope,
} from "@/lib/auth/access";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";

type CustomerMutationActor = {
  id: string;
  role: RoleCode;
};

export type UpdateCustomerProfileInput = {
  customerId: string;
  name: string;
  wechatId?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  status: string;
  level: string;
  remark?: string;
};

const customerStatusValues = [
  "ACTIVE",
  "DORMANT",
  "LOST",
  "BLACKLISTED",
] as const satisfies CustomerStatus[];

const customerLevelValues = [
  "NEW",
  "REGULAR",
  "VIP",
] as const satisfies CustomerLevel[];

const editableCustomerProfileFieldLabels = {
  name: "姓名",
  wechatId: "微信",
  province: "省份",
  city: "城市",
  district: "区县",
  address: "地址",
  status: "状态",
  level: "等级",
  remark: "备注",
} as const;

type EditableCustomerProfileField = keyof typeof editableCustomerProfileFieldLabels;

type EditableCustomerProfileSnapshot = {
  [Key in EditableCustomerProfileField]:
    | string
    | CustomerStatus
    | CustomerLevel
    | null;
};

const updateCustomerProfileSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户 ID"),
  name: z.string().trim().min(1, "请输入客户姓名").max(100, "客户姓名不能超过 100 个字符"),
  wechatId: z.string().trim().max(100, "微信号不能超过 100 个字符").default(""),
  province: z.string().trim().max(50, "省份不能超过 50 个字符").default(""),
  city: z.string().trim().max(50, "城市不能超过 50 个字符").default(""),
  district: z.string().trim().max(50, "区县不能超过 50 个字符").default(""),
  address: z.string().trim().max(500, "地址不能超过 500 个字符").default(""),
  status: z.enum(customerStatusValues, { message: "客户状态无效" }),
  level: z.enum(customerLevelValues, { message: "客户等级无效" }),
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
});

const editableCustomerProfileSelect = {
  id: true,
  name: true,
  wechatId: true,
  province: true,
  city: true,
  district: true,
  address: true,
  status: true,
  level: true,
  remark: true,
} satisfies Prisma.CustomerSelect;

type EditableCustomerProfileRecord = Prisma.CustomerGetPayload<{
  select: typeof editableCustomerProfileSelect;
}>;

function normalizeOptionalText(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function buildEditableCustomerProfileSnapshot(
  customer: EditableCustomerProfileRecord,
): EditableCustomerProfileSnapshot {
  return {
    name: customer.name,
    wechatId: customer.wechatId,
    province: customer.province,
    city: customer.city,
    district: customer.district,
    address: customer.address,
    status: customer.status,
    level: customer.level,
    remark: customer.remark,
  };
}

function buildEditableCustomerProfileUpdateData(
  input: z.output<typeof updateCustomerProfileSchema>,
) {
  return {
    name: input.name.trim(),
    wechatId: normalizeOptionalText(input.wechatId),
    province: normalizeOptionalText(input.province),
    city: normalizeOptionalText(input.city),
    district: normalizeOptionalText(input.district),
    address: normalizeOptionalText(input.address),
    status: input.status,
    level: input.level,
    remark: normalizeOptionalText(input.remark),
  } satisfies Prisma.CustomerUpdateInput;
}

function getChangedEditableCustomerProfileFields(
  beforeData: EditableCustomerProfileSnapshot,
  afterData: EditableCustomerProfileSnapshot,
) {
  return (
    Object.keys(editableCustomerProfileFieldLabels) as EditableCustomerProfileField[]
  ).filter((field) => beforeData[field] !== afterData[field]);
}

function buildCustomerProfileUpdateDescription(
  fields: EditableCustomerProfileField[],
) {
  return `更新客户基础资料：${fields
    .map((field) => editableCustomerProfileFieldLabels[field])
    .join(" / ")}`;
}

export async function updateCustomerProfile(
  actor: CustomerMutationActor,
  rawInput: UpdateCustomerProfileInput,
) {
  const customerScope = getCustomerScope(actor.role, actor.id);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("当前角色无权访问客户模块。");
  }

  const parsed = updateCustomerProfileSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: parsed.customerId,
        ...customerScope,
      },
      select: editableCustomerProfileSelect,
    });

    if (!customer) {
      throw new Error("客户不存在，或你无权编辑该客户。");
    }

    await assertCustomerNotInActiveRecycleBin(tx, customer.id);

    const beforeData = buildEditableCustomerProfileSnapshot(customer);
    const updateData = buildEditableCustomerProfileUpdateData(parsed);

    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: updateData,
      select: editableCustomerProfileSelect,
    });

    const afterData = buildEditableCustomerProfileSnapshot(updated);
    const changedFields = getChangedEditableCustomerProfileFields(
      beforeData,
      afterData,
    );

    if (changedFields.length === 0) {
      throw new Error("未检测到资料变更。");
    }

    const description = buildCustomerProfileUpdateDescription(changedFields);

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CUSTOMER,
        action: "customer.profile.updated",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description,
        beforeData,
        afterData,
      },
    });

    return {
      customerId: updated.id,
      description,
    };
  });
}
