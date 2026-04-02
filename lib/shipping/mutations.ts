import {
  CodCollectionStatus,
  LogisticsFollowUpTaskStatus,
  OperationModule,
  OperationTargetType,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  ShippingTaskStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canManageLogisticsFollowUp,
  canManageShippingReporting,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { syncShippingCollectionTasks } from "@/lib/payments/mutations";
import { writeShippingExportCsv } from "@/lib/shipping/export";

export type ShippingActor = {
  id: string;
  role: RoleCode;
};

export type CreateShippingTaskInput = {
  customerId: string;
  orderId: string;
  giftRecordId: string;
  assigneeId: string;
  content: string;
  screenshotUrl: string;
  trackingNumber: string;
  status: ShippingTaskStatus;
  remark: string;
};

export type UpdateShippingTaskInput = {
  shippingTaskId: string;
  trackingNumber: string;
  status: ShippingTaskStatus;
};

export type CreateShippingExportBatchInput = {
  supplierId: string;
  fileName: string;
  remark: string;
};

export type UpdateSalesOrderShippingInput = {
  shippingTaskId: string;
  shippingProvider: string;
  trackingNumber: string;
  shippingStatus: ShippingFulfillmentStatus;
  codCollectionStatus: "" | CodCollectionStatus;
  codCollectedAmount: string;
  codRemark: string;
};

export type UpdateLogisticsFollowUpTaskInput = {
  logisticsFollowUpTaskId: string;
  status: LogisticsFollowUpTaskStatus;
  nextTriggerAt: string;
  lastFollowedUpAt: string;
  remark: string;
};

const createShippingExportBatchSchema = z.object({
  supplierId: z.string().trim().min(1, "请选择供货商。"),
  fileName: z.string().trim().min(1, "请填写导出文件名。").max(200),
  remark: z.string().trim().max(1000).default(""),
});

const updateSalesOrderShippingSchema = z.object({
  shippingTaskId: z.string().trim().min(1, "缺少发货任务。"),
  shippingProvider: z.string().trim().max(120).default(""),
  trackingNumber: z.string().trim().max(100).default(""),
  shippingStatus: z.nativeEnum(ShippingFulfillmentStatus),
  codCollectionStatus: z
    .enum(["", "PENDING_COLLECTION", "COLLECTED", "EXCEPTION", "REJECTED", "UNCOLLECTED"])
    .default(""),
  codCollectedAmount: z.string().trim().default(""),
  codRemark: z.string().trim().max(1000).default(""),
});

const updateLogisticsFollowUpTaskSchema = z.object({
  logisticsFollowUpTaskId: z.string().trim().min(1, "缺少物流跟进任务。"),
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "CANCELED"]),
  nextTriggerAt: z.string().trim().default(""),
  lastFollowedUpAt: z.string().trim().default(""),
  remark: z.string().trim().max(1000).default(""),
});

const LEGACY_SHIPPING_WRITE_PATH_RETIRED_MESSAGE =
  "Legacy ShippingTask.orderId write path retired; use SalesOrder shipping flow.";

export async function createShippingTask(
  _actor: ShippingActor,
  _rawInput: CreateShippingTaskInput,
) {
  void _actor;
  void _rawInput;
  throw new Error(LEGACY_SHIPPING_WRITE_PATH_RETIRED_MESSAGE);
}

export async function updateShippingTask(
  _actor: ShippingActor,
  _rawInput: UpdateShippingTaskInput,
) {
  void _actor;
  void _rawInput;
  throw new Error(LEGACY_SHIPPING_WRITE_PATH_RETIRED_MESSAGE);
}

async function getShippingActorTeamId(actor: ShippingActor) {
  if (actor.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function buildShippingTaskManageWhere(actor: ShippingActor, teamId: string | null) {
  if (actor.role === "ADMIN" || actor.role === "SHIPPER") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    return teamId
      ? {
          OR: [
            { salesOrder: { owner: { is: { teamId } } } },
            { salesOrder: { customer: { owner: { is: { teamId } } } } },
          ],
        }
      : { id: "__missing_shipping_scope__" };
  }

  return { id: "__forbidden_shipping_scope__" };
}

function buildShippingExportNo() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes(),
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const suffix = Math.random().toString().slice(2, 6);
  return `SEB${stamp}${suffix}`;
}

function buildExportProductSummary(
  items: Array<{
    exportDisplayNameSnapshot?: string | null;
    productNameSnapshot: string;
    qty: number;
  }>,
) {
  return items
    .map((item) => `${item.exportDisplayNameSnapshot || item.productNameSnapshot}【*${item.qty}】`)
    .join("+");
}

function mapFulfillmentStatusToLegacyTaskStatus(status: ShippingFulfillmentStatus) {
  switch (status) {
    case "READY_TO_SHIP":
      return ShippingTaskStatus.PROCESSING;
    case "SHIPPED":
      return ShippingTaskStatus.SHIPPED;
    case "DELIVERED":
    case "COMPLETED":
      return ShippingTaskStatus.COMPLETED;
    case "CANCELED":
      return ShippingTaskStatus.CANCELED;
    case "PENDING":
    default:
      return ShippingTaskStatus.PENDING;
  }
}

function isShippingReadyForCod(status: ShippingFulfillmentStatus) {
  return status === "SHIPPED" || status === "DELIVERED" || status === "COMPLETED";
}

function parseOptionalDate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("日期格式无效。");
  }

  return parsed;
}

function normalizeDate(date: Date | null) {
  if (!date) {
    return null;
  }

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function buildLogisticsTaskWhere(actor: ShippingActor, teamId: string | null) {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    return teamId
      ? {
          OR: [
            { owner: { is: { teamId } } },
            { customer: { owner: { is: { teamId } } } },
            { salesOrder: { owner: { is: { teamId } } } },
            { salesOrder: { customer: { owner: { is: { teamId } } } } },
          ],
        }
      : { id: "__missing_logistics_scope__" };
  }

  if (actor.role === "SALES") {
    return {
      OR: [{ ownerId: actor.id }, { customer: { ownerId: actor.id } }],
    };
  }

  return { id: "__forbidden_logistics_scope__" };
}

export async function createShippingExportBatch(
  actor: ShippingActor,
  rawInput: CreateShippingExportBatchInput,
) {
  if (!canManageShippingReporting(actor.role)) {
    throw new Error("当前角色无权创建报单批次。");
  }

  const input = createShippingExportBatchSchema.parse(rawInput);
  const teamId = await getShippingActorTeamId(actor);
  const scope = buildShippingTaskManageWhere(actor, teamId);
  const exportNo = buildShippingExportNo();

  const tasks = await prisma.shippingTask.findMany({
    where: {
      salesOrderId: { not: null },
      supplierId: input.supplierId,
      reportStatus: ShippingReportStatus.PENDING,
      salesOrder: {
        reviewStatus: "APPROVED",
      },
      ...scope,
    },
    select: {
      id: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              exportDisplayNameSnapshot: true,
              productNameSnapshot: true,
              qty: true,
            },
          },
        },
      },
    },
  });

  if (tasks.length === 0) {
    throw new Error("当前供货商下没有可报单的待发货任务。");
  }

  const exportedFile = await writeShippingExportCsv({
    exportNo,
    fileName: input.fileName,
    rows: tasks.map((task) => {
      if (!task.salesOrder) {
        throw new Error("存在未关联销售订单的发货任务，无法导出。");
      }

      return {
        orderNo: task.salesOrder.orderNo,
        receiverName: task.salesOrder.receiverNameSnapshot,
        receiverPhone: task.salesOrder.receiverPhoneSnapshot,
        receiverAddress: task.salesOrder.receiverAddressSnapshot,
        productName: buildExportProductSummary(task.salesOrder.items),
        qty: task.salesOrder.items.reduce((total, item) => total + item.qty, 0),
        codAmount: task.codAmount.toString(),
        insuranceRequired: task.insuranceRequired,
        insuranceAmount: task.insuranceAmount.toString(),
      };
    }),
  });

  const batch = await prisma.$transaction(async (tx) => {
    const exportedAt = new Date();

    const created = await tx.shippingExportBatch.create({
      data: {
        exportNo,
        supplierId: input.supplierId,
        exportedById: actor.id,
        orderCount: tasks.length,
        fileName: exportedFile.fileName,
        fileUrl: exportedFile.fileUrl,
        remark: input.remark || null,
      },
      select: {
        id: true,
        exportNo: true,
      },
    });

    for (const task of tasks) {
      await tx.shippingTask.update({
        where: { id: task.id },
        data: {
          exportBatchId: created.id,
          reportStatus: ShippingReportStatus.REPORTED,
          reportedAt: exportedAt,
          status: ShippingTaskStatus.PROCESSING,
          shippingStatus: ShippingFulfillmentStatus.READY_TO_SHIP,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SHIPPING_EXPORT,
          action: "shipping_task.reported",
          targetType: OperationTargetType.SHIPPING_TASK,
          targetId: task.id,
          description: `发货任务加入报单批次 ${created.exportNo}`,
          afterData: {
            exportBatchId: created.id,
            exportNo: created.exportNo,
            reportStatus: ShippingReportStatus.REPORTED,
            reportedAt: exportedAt,
          },
        },
      });
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING_EXPORT,
        action: "shipping_export_batch.created",
        targetType: OperationTargetType.SHIPPING_EXPORT_BATCH,
        targetId: created.id,
        description: `创建报单批次 ${created.exportNo}`,
        afterData: {
          supplierId: input.supplierId,
          orderCount: tasks.length,
          fileName: exportedFile.fileName,
          fileUrl: exportedFile.fileUrl,
        },
      },
    });

    return created;
  });

  return batch;
}

export async function updateSalesOrderShipping(
  actor: ShippingActor,
  rawInput: UpdateSalesOrderShippingInput,
) {
  if (!canManageShippingReporting(actor.role)) {
    throw new Error("当前角色无权更新发货状态。");
  }

  const input = updateSalesOrderShippingSchema.parse(rawInput);
  const teamId = await getShippingActorTeamId(actor);
  const scope = buildShippingTaskManageWhere(actor, teamId);

  const existing = await prisma.shippingTask.findFirst({
    where: {
      id: input.shippingTaskId,
      salesOrderId: { not: null },
      ...scope,
    },
    select: {
      id: true,
      customerId: true,
      salesOrderId: true,
      reportStatus: true,
      trackingNumber: true,
      shippingStatus: true,
      shippingProvider: true,
      codAmount: true,
      shippedAt: true,
      completedAt: true,
      salesOrder: {
        select: {
          id: true,
          ownerId: true,
        },
      },
      customer: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  if (!existing || !existing.salesOrderId || !existing.salesOrder) {
    throw new Error("发货任务不存在，或你无权更新该任务。");
  }

  const salesOrder = existing.salesOrder;
  const normalizedTrackingNumber =
    input.trackingNumber.trim() || existing.trackingNumber?.trim() || "";
  const isCodTask = Number(existing.codAmount) > 0;
  const normalizedCodStatus = input.codCollectionStatus || "";
  const normalizedCodRemark = input.codRemark.trim();
  const enteringShippedState = isShippingReadyForCod(input.shippingStatus);

  if (enteringShippedState && !normalizedTrackingNumber) {
    throw new Error("进入已发货、已签收或已完成前，必须先回填物流单号。");
  }

  if (
    enteringShippedState &&
    existing.reportStatus !== ShippingReportStatus.REPORTED
  ) {
    throw new Error("订单完成报单后，才能推进到已发货及后续状态。");
  }

  if (normalizedCodStatus && !isCodTask) {
    throw new Error("当前发货任务不是 COD 订单，不能登记 COD 回款状态。");
  }

  if (normalizedCodStatus && !enteringShippedState) {
    throw new Error("只有在已发货、已签收或已完成阶段，才能登记 COD 回款状态。");
  }

  await prisma.$transaction(async (tx) => {
    await tx.shippingTask.update({
      where: { id: existing.id },
      data: {
        shippingProvider: input.shippingProvider || null,
        trackingNumber: normalizedTrackingNumber || null,
        shippingStatus: input.shippingStatus,
        status: mapFulfillmentStatusToLegacyTaskStatus(input.shippingStatus),
        shippedAt: enteringShippedState ? existing.shippedAt ?? new Date() : existing.shippedAt,
        completedAt:
          input.shippingStatus === ShippingFulfillmentStatus.COMPLETED ||
          input.shippingStatus === ShippingFulfillmentStatus.CANCELED
            ? existing.completedAt ?? new Date()
            : existing.completedAt,
      },
    });

    const logisticsOwnerId = salesOrder.ownerId ?? existing.customer.ownerId;
    const createdFirstTracking =
      Boolean(normalizedTrackingNumber) && !existing.trackingNumber?.trim();

    if (createdFirstTracking && logisticsOwnerId) {
      const openTask = await tx.logisticsFollowUpTask.findFirst({
        where: {
          shippingTaskId: existing.id,
          status: {
            in: [
              LogisticsFollowUpTaskStatus.PENDING,
              LogisticsFollowUpTaskStatus.IN_PROGRESS,
            ],
          },
        },
        select: { id: true },
      });

      if (!openTask) {
        const nextTriggerAt = new Date();
        nextTriggerAt.setDate(nextTriggerAt.getDate() + 2);

        const followUpTask = await tx.logisticsFollowUpTask.create({
          data: {
            salesOrderId: salesOrder.id,
            shippingTaskId: existing.id,
            customerId: existing.customerId,
            ownerId: logisticsOwnerId,
            intervalDays: 2,
            nextTriggerAt,
            remark: "首次回填物流单号后自动创建的物流跟进任务。",
          },
          select: {
            id: true,
          },
        });

        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.LOGISTICS,
            action: "logistics_follow_up_task.created",
            targetType: OperationTargetType.LOGISTICS_FOLLOW_UP_TASK,
            targetId: followUpTask.id,
            description: "首次回填物流单号后创建物流跟进任务。",
            afterData: {
              salesOrderId: salesOrder.id,
              shippingTaskId: existing.id,
              ownerId: logisticsOwnerId,
              intervalDays: 2,
              nextTriggerAt,
            },
          },
        });
      }
    }

    if (
      input.shippingStatus === ShippingFulfillmentStatus.DELIVERED ||
      input.shippingStatus === ShippingFulfillmentStatus.COMPLETED ||
      input.shippingStatus === ShippingFulfillmentStatus.CANCELED
    ) {
      await tx.logisticsFollowUpTask.updateMany({
        where: {
          shippingTaskId: existing.id,
          status: {
            in: [
              LogisticsFollowUpTaskStatus.PENDING,
              LogisticsFollowUpTaskStatus.IN_PROGRESS,
            ],
          },
        },
        data: {
          status:
            input.shippingStatus === ShippingFulfillmentStatus.CANCELED
              ? LogisticsFollowUpTaskStatus.CANCELED
              : LogisticsFollowUpTaskStatus.DONE,
          closedAt: new Date(),
        },
      });
    }

    await syncShippingCollectionTasks(tx, {
      salesOrderId: salesOrder.id,
      shippingTaskId: existing.id,
      shippingStatus: input.shippingStatus,
      actorId: actor.id,
      codCollectionStatus: normalizedCodStatus || null,
      codCollectedAmount: input.codCollectedAmount || null,
      codRemark: normalizedCodRemark || null,
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_task.v2_updated",
        targetType: OperationTargetType.SHIPPING_TASK,
        targetId: existing.id,
        description: "更新销售订单发货状态。",
        beforeData: {
          reportStatus: existing.reportStatus,
          shippingProvider: existing.shippingProvider,
          trackingNumber: existing.trackingNumber,
          shippingStatus: existing.shippingStatus,
        },
        afterData: {
          reportStatus: existing.reportStatus,
          shippingProvider: input.shippingProvider || null,
          trackingNumber: normalizedTrackingNumber || null,
          shippingStatus: input.shippingStatus,
          codCollectionStatus: normalizedCodStatus || null,
          codRemark: normalizedCodRemark || null,
        },
      },
    });
  });

  return {
    id: existing.id,
    salesOrderId: existing.salesOrderId,
    customerId: existing.customerId,
  };
}

export async function updateLogisticsFollowUpTask(
  actor: ShippingActor,
  rawInput: UpdateLogisticsFollowUpTaskInput,
) {
  if (!canManageLogisticsFollowUp(actor.role)) {
    throw new Error("当前角色无权更新物流跟进任务。");
  }

  const input = updateLogisticsFollowUpTaskSchema.parse(rawInput);
  const teamId = await getShippingActorTeamId(actor);
  const scope = buildLogisticsTaskWhere(actor, teamId);

  const existing = await prisma.logisticsFollowUpTask.findFirst({
    where: {
      id: input.logisticsFollowUpTaskId,
      ...scope,
    },
    select: {
      id: true,
      salesOrderId: true,
      shippingTaskId: true,
      customerId: true,
      ownerId: true,
      status: true,
      nextTriggerAt: true,
      lastFollowedUpAt: true,
      closedAt: true,
      remark: true,
    },
  });

  if (!existing) {
    throw new Error("物流跟进任务不存在，或你无权更新。");
  }

  const nextTriggerAt =
    normalizeDate(parseOptionalDate(input.nextTriggerAt)) ?? existing.nextTriggerAt;
  const fallbackFollowedAt =
    input.status === LogisticsFollowUpTaskStatus.IN_PROGRESS ||
    input.status === LogisticsFollowUpTaskStatus.DONE
      ? new Date()
      : existing.lastFollowedUpAt;
  const lastFollowedUpAt =
    parseOptionalDate(input.lastFollowedUpAt) ?? fallbackFollowedAt;
  const normalizedRemark = input.remark.trim();
  const closedAt =
    input.status === LogisticsFollowUpTaskStatus.DONE ||
    input.status === LogisticsFollowUpTaskStatus.CANCELED
      ? existing.closedAt ?? new Date()
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.logisticsFollowUpTask.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        nextTriggerAt,
        lastFollowedUpAt,
        closedAt,
        remark: normalizedRemark || null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LOGISTICS,
        action: "logistics_follow_up_task.updated",
        targetType: OperationTargetType.LOGISTICS_FOLLOW_UP_TASK,
        targetId: existing.id,
        description: "更新物流跟进任务。",
        beforeData: {
          salesOrderId: existing.salesOrderId,
          shippingTaskId: existing.shippingTaskId,
          ownerId: existing.ownerId,
          status: existing.status,
          nextTriggerAt: existing.nextTriggerAt,
          lastFollowedUpAt: existing.lastFollowedUpAt,
          closedAt: existing.closedAt,
          remark: existing.remark,
        },
        afterData: {
          salesOrderId: existing.salesOrderId,
          shippingTaskId: existing.shippingTaskId,
          ownerId: existing.ownerId,
          status: input.status,
          nextTriggerAt,
          lastFollowedUpAt,
          closedAt,
          remark: normalizedRemark || null,
        },
      },
    });
  });

  return {
    id: existing.id,
    salesOrderId: existing.salesOrderId,
    shippingTaskId: existing.shippingTaskId,
    customerId: existing.customerId,
  };
}
