import {
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  OperationModule,
  OperationTargetType,
  UserStatus,
  type CustomerStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canCreateCustomer,
  canTransferCustomerOwner,
  getCustomerScope,
} from "@/lib/auth/access";
import { customerManualCreateOperationAction } from "@/lib/customers/metadata";
import {
  assignCustomerToSalesTx,
  getCustomerOwnershipActorContextTx,
} from "@/lib/customers/ownership";
import {
  assertCustomerNotInActiveRecycleBin,
  findActiveCustomerRecycleEntry,
} from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import { normalizeImportedPhone } from "@/lib/lead-imports/metadata";

type CustomerMutationActor = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
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
  remark?: string;
};

export type UpdateCustomerRemarkInput = {
  customerId: string;
  remark?: string;
};

export type CreateOwnedCustomerInput = {
  name: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  remark?: string;
};

export type TransferCustomerOwnerInput = {
  customerId: string;
  targetOwnerId: string;
  note?: string;
};

type TransferCustomerOwnerOptions = {
  source?: "detail" | "batch";
  selectionMode?: "manual" | "filtered";
  selectedCount?: number;
};

const customerStatusValues = [
  "ACTIVE",
  "DORMANT",
  "LOST",
  "BLACKLISTED",
] as const satisfies CustomerStatus[];

const editableCustomerProfileFieldLabels = {
  name: "姓名",
  wechatId: "微信",
  province: "省份",
  city: "城市",
  district: "区县",
  address: "地址",
  status: "状态",
  remark: "备注",
} as const;

type EditableCustomerProfileField = keyof typeof editableCustomerProfileFieldLabels;

type EditableCustomerProfileSnapshot = {
  [Key in EditableCustomerProfileField]:
    | string
    | CustomerStatus
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
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
});

const createOwnedCustomerSchema = z.object({
  name: z.string().trim().min(1, "请输入客户姓名").max(100, "客户姓名不能超过 100 个字符"),
  phone: z.string().trim().min(1, "请输入手机号").max(32, "手机号不能超过 32 个字符"),
  province: z.string().trim().max(50, "省份不能超过 50 个字符").default(""),
  city: z.string().trim().max(50, "城市不能超过 50 个字符").default(""),
  district: z.string().trim().max(50, "区县不能超过 50 个字符").default(""),
  address: z.string().trim().max(500, "地址不能超过 500 个字符").default(""),
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
});

const updateCustomerRemarkSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户 ID"),
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
});

const transferCustomerOwnerSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户 ID"),
  targetOwnerId: z.string().trim().min(1, "请选择新的负责人"),
  note: z.string().trim().max(500, "移交备注不能超过 500 个字符").default(""),
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
  remark: true,
} satisfies Prisma.CustomerSelect;

type EditableCustomerProfileRecord = Prisma.CustomerGetPayload<{
  select: typeof editableCustomerProfileSelect;
}>;

function normalizeOptionalText(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function getDefaultClaimLockedUntil(baseAt: Date) {
  const next = new Date(baseAt);
  next.setDate(next.getDate() + 2);
  return next;
}

function normalizeCustomerPhone(value: string) {
  return normalizeImportedPhone(value);
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

function buildDuplicateCustomerCreateMessage(input: {
  existingCustomerName: string;
  existingOwnerName: string | null;
  existingOwnerUsername: string | null;
  existingOwnerId: string | null;
  existingOwnershipMode: CustomerOwnershipMode;
  actorId: string;
  inRecycleBin: boolean;
}) {
  if (input.inRecycleBin) {
    return `手机号已命中客户 ${input.existingCustomerName}，该客户当前在回收站中，请不要重复新增。`;
  }

  if (input.existingOwnerId === input.actorId) {
    return `手机号已在你的客户池中，无需重复新增客户 ${input.existingCustomerName}。`;
  }

  if (
    input.existingOwnerId === null ||
    input.existingOwnershipMode === CustomerOwnershipMode.PUBLIC ||
    input.existingOwnershipMode === CustomerOwnershipMode.LOCKED
  ) {
    return `手机号已存在客户 ${input.existingCustomerName}，当前应走公海池 / 主管分配链路，不支持重复新增。`;
  }

  const ownerLabel =
    input.existingOwnerName && input.existingOwnerUsername
      ? `${input.existingOwnerName} (@${input.existingOwnerUsername})`
      : input.existingOwnerName || "其他负责人";

  return `手机号已存在客户 ${input.existingCustomerName}，当前承接人为 ${ownerLabel}，不支持重复新增。`;
}

export async function createOwnedCustomer(
  actor: CustomerMutationActor,
  rawInput: CreateOwnedCustomerInput,
) {
  if (!canAccessCustomerModule(actor.role) || !canCreateCustomer(actor.role)) {
    throw new Error("当前角色无权手动新增客户。");
  }

  const parsed = createOwnedCustomerSchema.parse(rawInput);
  const normalizedPhone = normalizeCustomerPhone(parsed.phone);

  if (!normalizedPhone) {
    throw new Error("请输入有效的 11 位手机号。");
  }

  return prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        name: true,
        username: true,
        teamId: true,
        userStatus: true,
        role: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!currentUser || currentUser.role.code !== "SALES") {
      throw new Error("当前账号无法手动新增客户。");
    }

    if (currentUser.userStatus !== UserStatus.ACTIVE) {
      throw new Error("当前账号未激活，不能新增客户。");
    }

    const existingCustomer = await tx.customer.findUnique({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        name: true,
        ownerId: true,
        ownershipMode: true,
        owner: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    });

    if (existingCustomer) {
      const activeRecycleEntry = await findActiveCustomerRecycleEntry(tx, existingCustomer.id);

      throw new Error(
        buildDuplicateCustomerCreateMessage({
          existingCustomerName: existingCustomer.name,
          existingOwnerName: existingCustomer.owner?.name ?? null,
          existingOwnerUsername: existingCustomer.owner?.username ?? null,
          existingOwnerId: existingCustomer.ownerId,
          existingOwnershipMode: existingCustomer.ownershipMode,
          actorId: currentUser.id,
          inRecycleBin: Boolean(activeRecycleEntry),
        }),
      );
    }

    const now = new Date();
    const claimLockedUntil = getDefaultClaimLockedUntil(now);
    const createdCustomer = await tx.customer.create({
      data: {
        name: parsed.name.trim(),
        phone: normalizedPhone,
        province: normalizeOptionalText(parsed.province),
        city: normalizeOptionalText(parsed.city),
        district: normalizeOptionalText(parsed.district),
        address: normalizeOptionalText(parsed.address),
        remark: normalizeOptionalText(parsed.remark),
        ownerId: currentUser.id,
        ownershipMode: CustomerOwnershipMode.PRIVATE,
        lastOwnerId: currentUser.id,
        publicPoolTeamId: currentUser.teamId,
        claimLockedUntil,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: currentUser.id,
        module: OperationModule.CUSTOMER,
        action: customerManualCreateOperationAction,
        targetType: OperationTargetType.CUSTOMER,
        targetId: createdCustomer.id,
        description: `销售手动新增客户 ${createdCustomer.name} (${createdCustomer.phone}) 并归入自己客户池。`,
        afterData: {
          ownerId: currentUser.id,
          ownershipMode: CustomerOwnershipMode.PRIVATE,
          publicPoolTeamId: currentUser.teamId,
          claimLockedUntil: claimLockedUntil.toISOString(),
          source: "SALES_MANUAL_CREATE",
        },
      },
    });

    return {
      customerId: createdCustomer.id,
      customerName: createdCustomer.name,
      description: `已新增客户 ${createdCustomer.name}，并归入你的客户池。`,
    };
  });
}

export async function updateCustomerProfile(
  actor: CustomerMutationActor,
  rawInput: UpdateCustomerProfileInput,
) {
  const customerScope = getCustomerScope(actor.role, actor.id, actor.teamId);

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

export async function updateCustomerRemark(
  actor: CustomerMutationActor,
  rawInput: UpdateCustomerRemarkInput,
) {
  const customerScope = getCustomerScope(actor.role, actor.id, actor.teamId);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("当前角色无权访问客户模块。");
  }

  const parsed = updateCustomerRemarkSchema.parse(rawInput);
  const nextRemark = normalizeOptionalText(parsed.remark);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: {
        id: parsed.customerId,
        ...customerScope,
      },
      select: {
        id: true,
        remark: true,
      },
    });

    if (!customer) {
      throw new Error("客户不存在，或你无权编辑该客户。");
    }

    await assertCustomerNotInActiveRecycleBin(tx, customer.id);

    if (customer.remark === nextRemark) {
      return {
        customerId: customer.id,
        description: "备注未发生变化。",
      };
    }

    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: {
        remark: nextRemark,
      },
      select: {
        id: true,
        remark: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CUSTOMER,
        action: "customer.remark.updated",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description: "更新客户备注",
        beforeData: {
          remark: customer.remark,
        },
        afterData: {
          remark: updated.remark,
        },
      },
    });

    return {
      customerId: updated.id,
      description: "客户备注已更新。",
    };
  });
}

export async function transferCustomerOwner(
  actor: CustomerMutationActor,
  rawInput: TransferCustomerOwnerInput,
  options: TransferCustomerOwnerOptions = {},
) {
  if (!canTransferCustomerOwner(actor.role)) {
    throw new Error("当前角色不能移交客户负责人。");
  }

  const parsed = transferCustomerOwnerSchema.parse(rawInput);
  const transferSource = options.source ?? "detail";

  return prisma.$transaction(async (tx) => {
    const ownershipActor = await getCustomerOwnershipActorContextTx(tx, actor.id);

    if (!canTransferCustomerOwner(ownershipActor.role)) {
      throw new Error("当前角色不能移交客户负责人。");
    }

    if (ownershipActor.role === "SUPERVISOR" && !ownershipActor.teamId) {
      throw new Error("当前主管账号缺少团队范围，不能移交客户负责人。");
    }

    const targetSales = await tx.user.findFirst({
      where: {
        id: parsed.targetOwnerId,
        userStatus: UserStatus.ACTIVE,
        disabledAt: null,
        role: {
          code: "SALES",
        },
      },
      select: {
        id: true,
        name: true,
        username: true,
        teamId: true,
      },
    });

    if (!targetSales) {
      throw new Error("目标负责人不存在、已停用，或不是销售账号。");
    }

    if (
      ownershipActor.role === "SUPERVISOR" &&
      targetSales.teamId !== ownershipActor.teamId
    ) {
      throw new Error("主管只能移交给本团队的销售。");
    }

    const transition = await assignCustomerToSalesTx(tx, {
      actor: ownershipActor,
      targetSales,
      customerId: parsed.customerId,
      reason:
        transferSource === "batch"
          ? CustomerOwnershipEventReason.BATCH_REALLOCATION
          : CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
      note: parsed.note || null,
      operationAction:
        transferSource === "batch"
          ? "customer.owner.batch_transferred"
          : "customer.owner.transferred_from_detail",
      operationDescription:
        transferSource === "batch"
          ? `批量移交客户负责人给 ${targetSales.name} (@${targetSales.username})。`
          : `移交客户负责人给 ${targetSales.name} (@${targetSales.username})。`,
      operationMetadata: {
        source:
          transferSource === "batch"
            ? "CUSTOMER_CENTER_BATCH_OWNER_TRANSFER"
            : "CUSTOMER_DETAIL_OWNER_TRANSFER",
        targetOwnerId: targetSales.id,
        ...(transferSource === "batch"
          ? {
              selectionMode: options.selectionMode ?? "manual",
              selectedCount: options.selectedCount ?? null,
            }
          : {}),
      },
    });

    if (!transition) {
      throw new Error("客户当前已由该负责人承接，无需重复移交。");
    }

    return {
      customerId: transition.customer.id,
      ownerId: targetSales.id,
      ownerName: targetSales.name,
      ownerUsername: targetSales.username,
      description: `已将客户负责人移交给 ${targetSales.name} (@${targetSales.username})。`,
    };
  });
}
