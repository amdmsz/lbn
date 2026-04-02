import {
  GiftQualificationSource,
  GiftReviewStatus,
  OperationModule,
  OperationTargetType,
  ShippingStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessGiftModule,
  canCreateGiftRecord,
  canReviewGiftRecord,
  getCustomerScope,
  getGiftScope,
} from "@/lib/auth/access";
import { buildReceiverInfo } from "@/lib/fulfillment/metadata";
import { prisma } from "@/lib/db/prisma";
import { ensureGiftFreightPaymentArtifacts } from "@/lib/payments/mutations";

export type GiftActor = {
  id: string;
  role: RoleCode;
};

export type CreateGiftRecordInput = {
  customerId: string;
  liveSessionId: string;
  giftName: string;
  qualificationSource: GiftQualificationSource;
  freightAmount: number;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark: string;
};

export type UpdateGiftReviewInput = {
  giftRecordId: string;
  reviewStatus: GiftReviewStatus;
};

const createGiftRecordSchema = z.object({
  customerId: z.string().trim().min(1, "请选择客户"),
  liveSessionId: z.string().trim().default(""),
  giftName: z.string().trim().min(1, "请填写礼品名称").max(120),
  qualificationSource: z.nativeEnum(GiftQualificationSource),
  freightAmount: z.coerce.number().min(0, "运费不能小于 0"),
  receiverName: z.string().trim().min(1, "请填写收件人"),
  receiverPhone: z.string().trim().min(1, "请填写收件电话").max(30),
  receiverAddress: z.string().trim().min(1, "请填写收件地址").max(500),
  remark: z.string().trim().max(1000).default(""),
});

const updateGiftReviewSchema = z.object({
  giftRecordId: z.string().trim().min(1, "缺少礼品记录"),
  reviewStatus: z.nativeEnum(GiftReviewStatus),
});

function deriveShippingStatusForReview(
  reviewStatus: GiftReviewStatus,
  currentShippingStatus: ShippingStatus,
) {
  if (reviewStatus === "APPROVED" && currentShippingStatus === "PENDING") {
    return ShippingStatus.READY;
  }

  if (reviewStatus === "REJECTED") {
    return ShippingStatus.CANCELED;
  }

  return currentShippingStatus;
}

export async function createGiftRecord(
  actor: GiftActor,
  rawInput: CreateGiftRecordInput,
) {
  if (!canAccessGiftModule(actor.role)) {
    throw new Error("当前角色无权访问礼品模块。");
  }

  if (!canCreateGiftRecord(actor.role)) {
    throw new Error("当前角色无权创建礼品记录。");
  }

  const parsed = createGiftRecordSchema.parse(rawInput);
  const customerScope = getCustomerScope(
    actor.role === "OPS" ? "SUPERVISOR" : actor.role,
    actor.id,
  );

  if (!customerScope) {
    throw new Error("当前角色无权选择该客户。");
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
      leads: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error("客户不存在，或你无权为该客户创建礼品记录。");
  }

  if (parsed.liveSessionId) {
    const liveSession = await prisma.liveSession.findUnique({
      where: { id: parsed.liveSessionId },
      select: { id: true },
    });

    if (!liveSession) {
      throw new Error("所选直播场次不存在。");
    }
  }

  const receiverInfo = buildReceiverInfo(
    parsed.receiverName,
    parsed.receiverPhone,
    parsed.receiverAddress,
  );

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.giftRecord.create({
      data: {
        customerId: customer.id,
        leadId: customer.leads[0]?.id ?? null,
        liveSessionId: parsed.liveSessionId || null,
        salesId: customer.ownerId ?? (actor.role === "SALES" ? actor.id : null),
        giftName: parsed.giftName,
        qualificationSource: parsed.qualificationSource,
        freightAmount: parsed.freightAmount,
        reviewStatus: GiftReviewStatus.PENDING_REVIEW,
        shippingStatus: ShippingStatus.PENDING,
        receiverInfo,
        receiverName: parsed.receiverName,
        receiverPhone: parsed.receiverPhone,
        receiverAddress: parsed.receiverAddress,
        remark: parsed.remark || null,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.GIFT,
        action: "gift_record.created",
        targetType: OperationTargetType.GIFT_RECORD,
        targetId: created.id,
        description: `为客户 ${customer.name} 创建礼品记录`,
        afterData: {
          customerId: customer.id,
          liveSessionId: parsed.liveSessionId || null,
          giftName: parsed.giftName,
          qualificationSource: parsed.qualificationSource,
          freightAmount: parsed.freightAmount,
          reviewStatus: GiftReviewStatus.PENDING_REVIEW,
        },
      },
    });

    await ensureGiftFreightPaymentArtifacts(tx, {
      giftRecordId: created.id,
      customerId: customer.id,
      ownerId: customer.ownerId ?? (actor.role === "SALES" ? actor.id : null),
      freightAmount: parsed.freightAmount,
      actorId: actor.id,
    });

    return created;
  });

  return {
    id: record.id,
    customerId: customer.id,
  };
}

export async function updateGiftReview(
  actor: GiftActor,
  rawInput: UpdateGiftReviewInput,
) {
  if (!canAccessGiftModule(actor.role)) {
    throw new Error("当前角色无权访问礼品模块。");
  }

  if (!canReviewGiftRecord(actor.role)) {
    throw new Error("当前角色无权审核礼品记录。");
  }

  const parsed = updateGiftReviewSchema.parse(rawInput);
  const scope = getGiftScope(actor.role, actor.id);

  if (!scope) {
    throw new Error("当前角色无权审核礼品记录。");
  }

  const existing = await prisma.giftRecord.findFirst({
    where: {
      id: parsed.giftRecordId,
      ...scope,
    },
    select: {
      id: true,
      customerId: true,
      reviewStatus: true,
      shippingStatus: true,
      shippingTask: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("礼品记录不存在，或你无权审核该记录。");
  }

  const nextShippingStatus = deriveShippingStatusForReview(
    parsed.reviewStatus,
    existing.shippingStatus,
  );

  await prisma.$transaction(async (tx) => {
    await tx.giftRecord.update({
      where: { id: existing.id },
      data: {
        reviewStatus: parsed.reviewStatus,
        shippingStatus: nextShippingStatus,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.GIFT,
        action: "gift_record.review_updated",
        targetType: OperationTargetType.GIFT_RECORD,
        targetId: existing.id,
        description: "更新礼品审核状态",
        beforeData: {
          reviewStatus: existing.reviewStatus,
          shippingStatus: existing.shippingStatus,
        },
        afterData: {
          reviewStatus: parsed.reviewStatus,
          shippingStatus: nextShippingStatus,
        },
      },
    });
  });

  return {
    id: existing.id,
    customerId: existing.customerId,
  };
}
