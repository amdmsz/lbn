import {
  OperationModule,
  OperationTargetType,
  ShippingTaskStatus,
  UserStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canReviewGiftRecord, getGiftScope } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { mapShippingTaskStatusToShippingStatus } from "@/lib/fulfillment/metadata";
import { attachGiftFreightPaymentArtifactsToShippingTask } from "@/lib/payments/mutations";

export type GiftFulfillmentCompatActor = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type SaveGiftFulfillmentCompatInput = {
  giftRecordId: string;
  assigneeId: string;
  trackingNumber: string;
  status: ShippingTaskStatus;
  remark: string;
};

const saveGiftFulfillmentCompatSchema = z.object({
  giftRecordId: z.string().trim().min(1, "缺少礼品记录"),
  assigneeId: z.string().trim().default(""),
  trackingNumber: z.string().trim().max(100).default(""),
  status: z.nativeEnum(ShippingTaskStatus),
  remark: z.string().trim().max(1000).default(""),
});

function normalizeTrackingNumber(
  status: ShippingTaskStatus,
  trackingNumber: string,
  currentTrackingNumber?: string | null,
) {
  const normalized = trackingNumber.trim() || currentTrackingNumber?.trim() || "";

  if (["SHIPPED", "COMPLETED"].includes(status) && !normalized) {
    throw new Error("推进到已发货或已完成前，必须填写物流单号。");
  }

  return normalized || null;
}

async function getGiftCompatAssignee(assigneeId: string) {
  if (!assigneeId) {
    return null;
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: assigneeId,
      userStatus: UserStatus.ACTIVE,
      role: {
        code: "SHIPPER",
      },
    },
    select: {
      id: true,
      name: true,
      username: true,
    },
  });

  if (!assignee) {
    throw new Error("所选发货负责人不存在，或账号状态不可用。");
  }

  return assignee;
}

export async function saveGiftFulfillmentCompatTask(
  actor: GiftFulfillmentCompatActor,
  rawInput: SaveGiftFulfillmentCompatInput,
) {
  if (!canReviewGiftRecord(actor.role)) {
    throw new Error("当前角色无权处理礼品履约兼容任务。");
  }

  const parsed = saveGiftFulfillmentCompatSchema.parse(rawInput);
  const scope = getGiftScope(actor.role, actor.id, actor.teamId);

  if (!scope) {
    throw new Error("当前角色无权处理礼品履约兼容任务。");
  }

  const [giftRecord, assignee] = await Promise.all([
    prisma.giftRecord.findFirst({
      where: {
        id: parsed.giftRecordId,
        ...scope,
      },
      select: {
        id: true,
        customerId: true,
        giftName: true,
        reviewStatus: true,
        shippingStatus: true,
        shippingTask: {
          select: {
            id: true,
            assigneeId: true,
            trackingNumber: true,
            status: true,
            shippedAt: true,
            remark: true,
          },
        },
      },
    }),
    getGiftCompatAssignee(parsed.assigneeId),
  ]);

  if (!giftRecord) {
    throw new Error("礼品记录不存在，或你无权处理该履约任务。");
  }

  if (!giftRecord.shippingTask && giftRecord.reviewStatus !== "APPROVED") {
    throw new Error("礼品审核通过后才能创建履约兼容任务。");
  }

  const trackingNumber = normalizeTrackingNumber(
    parsed.status,
    parsed.trackingNumber,
    giftRecord.shippingTask?.trackingNumber,
  );
  const shippingStatus = mapShippingTaskStatusToShippingStatus(parsed.status);

  const result = await prisma.$transaction(async (tx) => {
    const shippingTask = giftRecord.shippingTask
      ? await tx.shippingTask.update({
          where: { id: giftRecord.shippingTask.id },
          data: {
            assigneeId: assignee?.id ?? null,
            trackingNumber,
            status: parsed.status,
            shippedAt:
              parsed.status === "SHIPPED" || parsed.status === "COMPLETED"
                ? giftRecord.shippingTask.shippedAt ?? new Date()
                : giftRecord.shippingTask.shippedAt,
            remark: parsed.remark || null,
          },
          select: {
            id: true,
          },
        })
      : await tx.shippingTask.create({
          data: {
            customerId: giftRecord.customerId,
            giftRecordId: giftRecord.id,
            assigneeId: assignee?.id ?? null,
            trackingNumber,
            status: parsed.status,
            shippedAt:
              parsed.status === "SHIPPED" || parsed.status === "COMPLETED"
                ? new Date()
                : null,
            remark: parsed.remark || null,
          },
          select: {
            id: true,
          },
        });

    await tx.giftRecord.update({
      where: { id: giftRecord.id },
      data: {
        shippingStatus,
      },
    });

    await attachGiftFreightPaymentArtifactsToShippingTask(
      tx,
      giftRecord.id,
      shippingTask.id,
    );

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: giftRecord.shippingTask
          ? "gift_fulfillment_compat.updated"
          : "gift_fulfillment_compat.created",
        targetType: OperationTargetType.SHIPPING_TASK,
        targetId: shippingTask.id,
        description: `更新礼品履约兼容任务：${giftRecord.giftName}`,
        ...(giftRecord.shippingTask
          ? {
              beforeData: {
                assigneeId: giftRecord.shippingTask.assigneeId,
                trackingNumber: giftRecord.shippingTask.trackingNumber,
                status: giftRecord.shippingTask.status,
                remark: giftRecord.shippingTask.remark,
              },
            }
          : {}),
        afterData: {
          giftRecordId: giftRecord.id,
          assigneeId: assignee?.id ?? null,
          trackingNumber,
          status: parsed.status,
          remark: parsed.remark || null,
          shippingStatus,
        },
      },
    });

    return shippingTask;
  });

  return {
    id: result.id,
    customerId: giftRecord.customerId,
    giftRecordId: giftRecord.id,
  };
}
