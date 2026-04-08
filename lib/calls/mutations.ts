import {
  OperationModule,
  OperationTargetType,
  WechatAddStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canCreateCallRecord,
  getCustomerScope,
} from "@/lib/auth/access";
import { mapCallResultCodeToLegacyEnum } from "@/lib/calls/metadata";
import {
  getEnabledCallResultDefinitionByCode,
} from "@/lib/calls/settings";
import { prisma } from "@/lib/db/prisma";

export type CallRecordActor = {
  id: string;
  role: RoleCode;
};

export type CreateCallRecordInput = {
  customerId: string;
  callTime: string;
  durationSeconds: number;
  result: string;
  remark: string;
  nextFollowUpAt: string;
};

const createCallRecordSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户信息"),
  callTime: z.string().trim().min(1, "请选择通话时间"),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(0, "通话时长不能小于 0")
    .max(24 * 60 * 60, "通话时长不能超过 24 小时"),
  result: z.string().trim().min(1, "请选择通话结果"),
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
  nextFollowUpAt: z.string().trim().default(""),
});

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}格式不正确。`);
  }

  return parsed;
}

function mapWechatSyncActionToStatus(action: "NONE" | "PENDING" | "ADDED" | "REFUSED") {
  switch (action) {
    case "PENDING":
      return WechatAddStatus.PENDING;
    case "ADDED":
      return WechatAddStatus.ADDED;
    case "REFUSED":
      return WechatAddStatus.REJECTED;
    default:
      return null;
  }
}

export async function createCallRecord(
  actor: CallRecordActor,
  rawInput: CreateCallRecordInput,
) {
  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("当前角色无权访问客户模块。");
  }

  if (!canCreateCallRecord(actor.role)) {
    throw new Error("当前角色不能新增通话记录。");
  }

  const parsed = createCallRecordSchema.parse(rawInput);
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

  if (actor.role === "SALES" && customer.ownerId !== actor.id) {
    throw new Error("销售只能为自己负责的客户新增通话记录。");
  }

  const callTime = parseDateTimeInput(parsed.callTime, "通话时间");
  const nextFollowUpAt = parsed.nextFollowUpAt
    ? parseDateTimeInput(parsed.nextFollowUpAt, "下次跟进时间")
    : null;

  if (nextFollowUpAt && nextFollowUpAt < callTime) {
    throw new Error("下次跟进时间不能早于通话时间。");
  }

  const resultDefinition = await getEnabledCallResultDefinitionByCode(parsed.result);

  if (!resultDefinition) {
    throw new Error("当前通话结果不存在或已停用。");
  }

  const salesId = actor.role === "SALES" ? actor.id : customer.ownerId ?? actor.id;
  const legacyResult = mapCallResultCodeToLegacyEnum(resultDefinition.code);
  const linkedWechatStatus = mapWechatSyncActionToStatus(
    resultDefinition.wechatSyncAction,
  );

  const callRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.callRecord.create({
      data: {
        customerId: customer.id,
        salesId,
        callTime,
        durationSeconds: parsed.durationSeconds,
        result: legacyResult,
        resultCode: resultDefinition.code,
        remark: parsed.remark || null,
        nextFollowUpAt,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "call_record.created",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description: `新增通话记录：${customer.name} (${customer.phone})`,
        afterData: {
          callRecordId: created.id,
          customerId: customer.id,
          salesId,
          callTime,
          durationSeconds: parsed.durationSeconds,
          result: legacyResult,
          resultCode: resultDefinition.code,
          resultLabel: resultDefinition.label,
          nextFollowUpAt,
        },
      },
    });

    if (linkedWechatStatus) {
      const linkedWechatRecord = await tx.wechatRecord.create({
        data: {
          customerId: customer.id,
          salesId,
          addedStatus: linkedWechatStatus,
          addedAt: linkedWechatStatus === WechatAddStatus.ADDED ? callTime : null,
          summary: parsed.remark || "由通话结果自动同步的微信跟进记录",
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
          action: "wechat_record.created_from_call_result",
          targetType: OperationTargetType.CUSTOMER,
          targetId: customer.id,
          description: `根据通话结果同步微信记录：${customer.name} (${customer.phone})`,
          afterData: {
            wechatRecordId: linkedWechatRecord.id,
            customerId: customer.id,
            salesId,
            fromCallRecordId: created.id,
            fromResultCode: resultDefinition.code,
            fromResultLabel: resultDefinition.label,
            addedStatus: linkedWechatStatus,
            addedAt: linkedWechatStatus === WechatAddStatus.ADDED ? callTime : null,
            nextFollowUpAt,
          },
        },
      });
    }

    return created;
  });

  return {
    id: callRecord.id,
    customerId: customer.id,
  };
}
