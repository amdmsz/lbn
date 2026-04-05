import { OperationModule, OperationTargetType, WechatAddStatus, type RoleCode } from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canCreateWechatRecord,
  getCustomerScope,
} from "@/lib/auth/access";
import { touchCustomerEffectiveFollowUpFromWechatTx } from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import { parseWechatTags } from "@/lib/wechat/metadata";

export type WechatActor = {
  id: string;
  role: RoleCode;
};

export type CreateWechatRecordInput = {
  customerId: string;
  addedStatus: string;
  addedAt: string;
  wechatAccount: string;
  wechatNickname: string;
  wechatRemarkName: string;
  tags: string;
  summary: string;
  nextFollowUpAt: string;
};

const createWechatRecordSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户信息"),
  addedStatus: z.enum(["PENDING", "ADDED", "REJECTED", "BLOCKED"], {
    message: "请选择加微状态",
  }),
  addedAt: z.string().trim().default(""),
  wechatAccount: z.string().trim().max(100).default(""),
  wechatNickname: z.string().trim().max(100).default(""),
  wechatRemarkName: z.string().trim().max(100).default(""),
  tags: z.string().trim().max(300).default(""),
  summary: z.string().trim().max(1000, "总结不能超过 1000 个字符").default(""),
  nextFollowUpAt: z.string().trim().default(""),
});

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}格式不正确。`);
  }

  return parsed;
}

export async function createWechatRecord(
  actor: WechatActor,
  rawInput: CreateWechatRecordInput,
) {
  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("当前角色无权访问客户模块。");
  }

  if (!canCreateWechatRecord(actor.role)) {
    throw new Error("当前角色不能新增微信记录。");
  }

  const parsed = createWechatRecordSchema.parse(rawInput);
  const customerScope = getCustomerScope(actor.role, actor.id);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: parsed.customerId,
      ...customerScope,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      ownerId: true,
    },
  });

  if (!customer) {
    throw new Error("客户不存在，或你无权访问该客户。");
  }

  if (customer.ownerId !== actor.id) {
    throw new Error("销售只能为自己负责的客户新增微信记录。");
  }

  const addedStatus = parsed.addedStatus as WechatAddStatus;
  const addedAt = parsed.addedAt ? parseDateTimeInput(parsed.addedAt, "加微时间") : null;
  const nextFollowUpAt = parsed.nextFollowUpAt
    ? parseDateTimeInput(parsed.nextFollowUpAt, "下次跟进时间")
    : null;

  if (addedStatus === WechatAddStatus.ADDED && !addedAt) {
    throw new Error("已加微状态下必须填写加微时间。");
  }

  if (addedAt && nextFollowUpAt && nextFollowUpAt < addedAt) {
    throw new Error("下次跟进时间不能早于加微时间。");
  }

  const tags = parseWechatTags(parsed.tags);

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.wechatRecord.create({
      data: {
        customerId: customer.id,
        salesId: actor.id,
        addedStatus,
        addedAt,
        wechatAccount: parsed.wechatAccount || null,
        wechatNickname: parsed.wechatNickname || null,
        wechatRemarkName: parsed.wechatRemarkName || null,
        tags: tags.length > 0 ? tags : undefined,
        summary: parsed.summary || null,
        nextFollowUpAt,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.WECHAT,
        action: "wechat_record.created",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description: `新增微信记录：${customer.name} (${customer.phone})`,
        afterData: {
          wechatRecordId: created.id,
          customerId: customer.id,
          salesId: actor.id,
          addedStatus,
          addedAt,
          nextFollowUpAt,
          tags,
        },
      },
    });

    await touchCustomerEffectiveFollowUpFromWechatTx(tx, {
      customerId: customer.id,
      occurredAt: addedAt ?? new Date(),
      addedStatus,
    });

    return created;
  });

  return {
    id: record.id,
    customerId: customer.id,
  };
}
