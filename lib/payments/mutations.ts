import {
  CodCollectionStatus,
  CollectionTaskStatus,
  OperationModule,
  OperationTargetType,
  PaymentCollectionChannel,
  PaymentPlanStageType,
  PaymentPlanStatus,
  PaymentPlanSubjectType,
  PaymentRecordChannel,
  PaymentRecordStatus,
  PaymentSourceType,
  SalesOrderPaymentScheme,
  ShippingFulfillmentStatus,
  UserStatus,
  type CollectionTaskType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCollectionTaskModule,
  canAccessPaymentRecordModule,
  canConfirmPaymentRecord,
  canManageCollectionTasks,
  canSubmitPaymentRecord,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  buildCollectionTaskScope,
  buildPaymentPlanScope,
  buildPaymentRecordScope,
} from "@/lib/payments/scope";
import {
  buildGiftFreightPaymentPlanSeeds,
  buildSalesOrderPaymentPlanSeeds,
  calculatePaymentPlanProgress,
  deriveCollectionTaskType,
  deriveSalesOrderPaymentSummary,
} from "@/lib/payments/workflow";

type PaymentTransaction = Prisma.TransactionClient;

export type PaymentActor = {
  id: string;
  role: RoleCode;
};

export type SyncSalesOrderPaymentArtifactsInput = {
  tradeOrderId?: string | null;
  salesOrderId: string;
  customerId: string;
  ownerId: string | null;
  paymentScheme: SalesOrderPaymentScheme;
  finalAmount: Prisma.Decimal | number | string;
  depositAmount: Prisma.Decimal | number | string;
  shippingTaskId?: string | null;
  actorId?: string | null;
};

export type EnsureGiftFreightPaymentArtifactsInput = {
  giftRecordId: string;
  customerId: string;
  ownerId: string | null;
  freightAmount: Prisma.Decimal | number | string;
  shippingTaskId?: string | null;
  actorId?: string | null;
};

export type SubmitPaymentRecordInput = {
  paymentPlanId: string;
  amount: string | number;
  channel: PaymentRecordChannel;
  occurredAt: string;
  referenceNo: string;
  remark: string;
};

export type ReviewPaymentRecordInput = {
  paymentRecordId: string;
  status: "CONFIRMED" | "REJECTED";
  remark: string;
};

export type UpsertCollectionTaskInput = {
  paymentPlanId: string;
  ownerId: string;
  dueAt: string;
  nextFollowUpAt: string;
  remark: string;
};

export type UpdateCollectionTaskInput = {
  collectionTaskId: string;
  ownerId: string;
  status: CollectionTaskStatus;
  nextFollowUpAt: string;
  lastContactAt: string;
  remark: string;
};

const submitPaymentRecordSchema = z.object({
  paymentPlanId: z.string().trim().min(1, "Payment plan is required."),
  amount: z.coerce.number().positive("Amount must be greater than 0."),
  channel: z.nativeEnum(PaymentRecordChannel),
  occurredAt: z.string().trim().default(""),
  referenceNo: z.string().trim().max(200).default(""),
  remark: z.string().trim().max(1000).default(""),
});

const reviewPaymentRecordSchema = z.object({
  paymentRecordId: z.string().trim().min(1, "Payment record is required."),
  status: z.enum(["CONFIRMED", "REJECTED"]),
  remark: z.string().trim().max(1000).default(""),
});

const upsertCollectionTaskSchema = z.object({
  paymentPlanId: z.string().trim().min(1, "Payment plan is required."),
  ownerId: z.string().trim().default(""),
  dueAt: z.string().trim().default(""),
  nextFollowUpAt: z.string().trim().default(""),
  remark: z.string().trim().max(1000).default(""),
});

const updateCollectionTaskSchema = z.object({
  collectionTaskId: z.string().trim().min(1, "Collection task is required."),
  ownerId: z.string().trim().default(""),
  status: z.nativeEnum(CollectionTaskStatus),
  nextFollowUpAt: z.string().trim().default(""),
  lastContactAt: z.string().trim().default(""),
  remark: z.string().trim().max(1000).default(""),
});

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseOptionalDate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date value.");
  }

  return parsed;
}

async function getPaymentActorTeamId(actor: PaymentActor) {
  if (actor.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function normalizeDueDate(date: Date | null) {
  if (!date) {
    return null;
  }

  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function buildNextCollectionFollowUp(baseDate = new Date()) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + 2);
  next.setHours(0, 0, 0, 0);
  return next;
}

function normalizeCollectionFollowUpDate(date: Date | null, fallback: Date | null) {
  const base = date ?? fallback;

  if (!base) {
    return null;
  }

  const normalized = new Date(base);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

async function createPaymentPlanLog(
  tx: PaymentTransaction,
  input: {
    actorId?: string | null;
    paymentPlanId: string;
    sourceType: PaymentSourceType;
    salesOrderId?: string | null;
    giftRecordId?: string | null;
    subjectType: PaymentPlanSubjectType;
    stageType: PaymentPlanStageType;
    collectionChannel: PaymentCollectionChannel;
    plannedAmount: number;
    sequence: number;
  },
) {
  await tx.operationLog.create({
    data: {
      actorId: input.actorId ?? null,
      module: OperationModule.PAYMENT,
      action: "payment_plan.created",
      targetType: OperationTargetType.PAYMENT_PLAN,
      targetId: input.paymentPlanId,
      description: "Create payment plan.",
      afterData: {
        sourceType: input.sourceType,
        salesOrderId: input.salesOrderId ?? null,
        giftRecordId: input.giftRecordId ?? null,
        subjectType: input.subjectType,
        stageType: input.stageType,
        collectionChannel: input.collectionChannel,
        plannedAmount: input.plannedAmount,
        sequence: input.sequence,
      },
    },
  });
}

async function syncPaymentPlanAggregateState(tx: PaymentTransaction, paymentPlanId: string) {
  const [plan, records] = await Promise.all([
    tx.paymentPlan.findUnique({
      where: { id: paymentPlanId },
      select: {
        id: true,
        plannedAmount: true,
        status: true,
      },
    }),
    tx.paymentRecord.findMany({
      where: { paymentPlanId },
      select: {
        amount: true,
        status: true,
      },
    }),
  ]);

  if (!plan) {
    return null;
  }

  if (plan.status === PaymentPlanStatus.CANCELED) {
    return {
      submittedAmount: 0,
      confirmedAmount: 0,
      remainingAmount: 0,
      status: PaymentPlanStatus.CANCELED,
    };
  }

  const submittedAmount = roundCurrency(
    records
      .filter(
        (record) =>
          record.status === PaymentRecordStatus.SUBMITTED ||
          record.status === PaymentRecordStatus.CONFIRMED,
      )
      .reduce((sum, record) => sum + toNumber(record.amount), 0),
  );
  const confirmedAmount = roundCurrency(
    records
      .filter((record) => record.status === PaymentRecordStatus.CONFIRMED)
      .reduce((sum, record) => sum + toNumber(record.amount), 0),
  );
  const progress = calculatePaymentPlanProgress({
    plannedAmount: toNumber(plan.plannedAmount),
    submittedAmount,
    confirmedAmount,
  });

  await tx.paymentPlan.update({
    where: { id: paymentPlanId },
    data: {
      submittedAmount: progress.submittedAmount,
      confirmedAmount: progress.confirmedAmount,
      remainingAmount: progress.remainingAmount,
      status: progress.status,
    },
  });

  return progress;
}

async function completeCollectionTasksForPlan(
  tx: PaymentTransaction,
  paymentPlanId: string,
  status: CollectionTaskStatus,
) {
  await tx.collectionTask.updateMany({
    where: {
      paymentPlanId,
      status: {
        in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
      },
    },
    data: {
      status,
      closedAt: new Date(),
    },
  });
}

async function ensureCollectionTaskForPlan(
  tx: PaymentTransaction,
  input: {
    paymentPlanId: string;
    actorId: string | null | undefined;
    tradeOrderId?: string | null;
    ownerId: string;
    sourceType: PaymentSourceType;
    salesOrderId?: string | null;
    giftRecordId?: string | null;
    shippingTaskId?: string | null;
    customerId: string;
    taskType: CollectionTaskType;
    dueAt: Date | null;
    nextFollowUpAt: Date | null;
    remark: string;
  },
) {
  const existing = await tx.collectionTask.findFirst({
    where: {
      paymentPlanId: input.paymentPlanId,
      status: {
        in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
      },
    },
    select: { id: true },
  });

  if (existing) {
    await tx.collectionTask.update({
      where: { id: existing.id },
      data: {
        tradeOrderId: input.tradeOrderId ?? null,
        ownerId: input.ownerId,
        dueAt: input.dueAt,
        nextFollowUpAt: input.nextFollowUpAt,
        remark: input.remark || null,
        updatedById: input.actorId ?? null,
      },
    });

    return {
      id: existing.id,
      created: false,
    };
  }

  const created = await tx.collectionTask.create({
    data: {
      paymentPlanId: input.paymentPlanId,
      tradeOrderId: input.tradeOrderId ?? null,
      sourceType: input.sourceType,
      salesOrderId: input.salesOrderId ?? null,
      giftRecordId: input.giftRecordId ?? null,
      shippingTaskId: input.shippingTaskId ?? null,
      customerId: input.customerId,
      ownerId: input.ownerId,
      taskType: input.taskType,
      dueAt: input.dueAt,
      nextFollowUpAt: input.nextFollowUpAt,
      remark: input.remark || null,
      createdById: input.actorId ?? null,
      updatedById: input.actorId ?? null,
    },
    select: { id: true },
  });

  return {
    id: created.id,
    created: true,
  };
}

async function syncSalesOrderSummary(tx: PaymentTransaction, salesOrderId: string) {
  const plans = await tx.paymentPlan.findMany({
    where: {
      salesOrderId,
      sourceType: PaymentSourceType.SALES_ORDER,
      status: {
        not: PaymentPlanStatus.CANCELED,
      },
    },
    select: {
      subjectType: true,
      stageType: true,
      collectionChannel: true,
      plannedAmount: true,
      submittedAmount: true,
      confirmedAmount: true,
      remainingAmount: true,
    },
  });

  const summary = deriveSalesOrderPaymentSummary(
    plans.map((plan) => ({
      subjectType: plan.subjectType,
      stageType: plan.stageType,
      collectionChannel: plan.collectionChannel,
      plannedAmount: toNumber(plan.plannedAmount),
      submittedAmount: toNumber(plan.submittedAmount),
      confirmedAmount: toNumber(plan.confirmedAmount),
      remainingAmount: toNumber(plan.remainingAmount),
    })),
  );

  await tx.salesOrder.update({
    where: { id: salesOrderId },
    data: {
      depositAmount: summary.depositAmount,
      collectedAmount: summary.collectedAmount,
      paidAmount: summary.paidAmount,
      remainingAmount: summary.remainingAmount,
      codAmount: summary.codAmount,
    },
  });
}

function shouldAutoSubmitOrderPlan(
  plan: Pick<
    Prisma.PaymentPlanCreateInput,
    "subjectType" | "stageType" | "collectionChannel"
  >,
) {
  return (
    plan.subjectType === PaymentPlanSubjectType.GOODS &&
    plan.collectionChannel === PaymentCollectionChannel.PREPAID &&
    plan.stageType !== PaymentPlanStageType.BALANCE
  );
}

async function createSubmittedPaymentRecord(
  tx: PaymentTransaction,
  input: {
    paymentPlanId: string;
    tradeOrderId?: string | null;
    sourceType: PaymentSourceType;
    salesOrderId?: string | null;
    giftRecordId?: string | null;
    shippingTaskId?: string | null;
    customerId?: string | null;
    ownerId?: string | null;
    amount: number;
    actorId: string | null | undefined;
    channel?: PaymentRecordChannel;
    occurredAt?: Date;
    referenceNo?: string | null;
    remark: string;
  },
) {
  if (input.amount <= 0) {
    return null;
  }

  const submittedById = input.actorId ?? input.ownerId;
  if (!submittedById) {
    return null;
  }

  const record = await tx.paymentRecord.create({
    data: {
      paymentPlanId: input.paymentPlanId,
      tradeOrderId: input.tradeOrderId ?? null,
      sourceType: input.sourceType,
      salesOrderId: input.salesOrderId ?? null,
      giftRecordId: input.giftRecordId ?? null,
      shippingTaskId: input.shippingTaskId ?? null,
      customerId: input.customerId ?? null,
      ownerId: input.ownerId ?? null,
      amount: input.amount,
      channel: input.channel ?? PaymentRecordChannel.ORDER_FORM_DECLARED,
      status: PaymentRecordStatus.SUBMITTED,
      occurredAt: input.occurredAt ?? new Date(),
      submittedById,
      referenceNo: input.referenceNo ?? null,
      remark: input.remark || null,
    },
    select: { id: true },
  });

  await tx.operationLog.create({
    data: {
      actorId: input.actorId ?? null,
      module: OperationModule.PAYMENT,
      action: "payment_record.submitted",
      targetType: OperationTargetType.PAYMENT_RECORD,
      targetId: record.id,
      description: "Submit payment record.",
      afterData: {
        paymentPlanId: input.paymentPlanId,
        sourceType: input.sourceType,
        amount: input.amount,
        channel: input.channel ?? PaymentRecordChannel.ORDER_FORM_DECLARED,
        occurredAt: input.occurredAt ?? null,
        referenceNo: input.referenceNo ?? null,
      },
    },
  });

  return record.id;
}

async function resolveCollectionTaskOwner(input: {
  actor: PaymentActor;
  actorTeamId: string | null;
  requestedOwnerId: string;
  fallbackOwnerId: string | null;
}) {
  const requestedOwnerId =
    input.actor.role === "SALES"
      ? input.actor.id
      : input.requestedOwnerId || input.fallbackOwnerId || "";

  if (!requestedOwnerId) {
    throw new Error("Collection task owner is required.");
  }

  const owner = await prisma.user.findFirst({
    where: {
      id: requestedOwnerId,
      userStatus: UserStatus.ACTIVE,
      ...(input.actor.role === "SUPERVISOR" && input.actorTeamId
        ? { teamId: input.actorTeamId }
        : {}),
    },
    select: {
      id: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!owner) {
    throw new Error("Collection task owner is invalid or out of scope.");
  }

  if (
    owner.role.code !== "SALES" &&
    owner.role.code !== "SUPERVISOR" &&
    owner.role.code !== "ADMIN"
  ) {
    throw new Error("Collection task owner must be an internal sales-side role.");
  }

  if (input.actor.role === "SALES" && owner.id !== input.actor.id) {
    throw new Error("Sales can only assign collection tasks to themselves.");
  }

  return owner;
}

export async function syncSalesOrderPaymentArtifacts(
  tx: PaymentTransaction,
  input: SyncSalesOrderPaymentArtifactsInput,
) {
  const existingPlans = await tx.paymentPlan.findMany({
    where: {
      salesOrderId: input.salesOrderId,
      sourceType: PaymentSourceType.SALES_ORDER,
    },
    select: {
      id: true,
      paymentRecords: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (
    existingPlans.some((plan) =>
      plan.paymentRecords.some(
        (record) => record.status === PaymentRecordStatus.CONFIRMED,
      ),
    )
  ) {
    throw new Error(
      "This order already has confirmed payment records. Rebuilding payment plans is blocked.",
    );
  }

  if (existingPlans.length > 0) {
    const planIds = existingPlans.map((plan) => plan.id);

    await tx.collectionTask.deleteMany({
      where: {
        paymentPlanId: {
          in: planIds,
        },
      },
    });

    await tx.paymentRecord.deleteMany({
      where: {
        paymentPlanId: {
          in: planIds,
        },
      },
    });

    await tx.paymentPlan.deleteMany({
      where: {
        id: {
          in: planIds,
        },
      },
    });
  }

  const seeds = buildSalesOrderPaymentPlanSeeds({
    paymentScheme: input.paymentScheme,
    finalAmount: toNumber(input.finalAmount),
    depositAmount: toNumber(input.depositAmount),
  });

  const createdPlanIds: string[] = [];

  for (const seed of seeds) {
    const createdPlan = await tx.paymentPlan.create({
      data: {
        sourceType: PaymentSourceType.SALES_ORDER,
        tradeOrderId: input.tradeOrderId ?? null,
        salesOrderId: input.salesOrderId,
        shippingTaskId: input.shippingTaskId ?? null,
        customerId: input.customerId,
        ownerId: input.ownerId ?? null,
        subjectType: seed.subjectType,
        stageType: seed.stageType,
        collectionChannel: seed.collectionChannel,
        plannedAmount: seed.plannedAmount,
        submittedAmount: 0,
        confirmedAmount: 0,
        remainingAmount: seed.plannedAmount,
        sequence: seed.sequence,
        createdById: input.actorId ?? null,
        updatedById: input.actorId ?? null,
      },
      select: {
        id: true,
        subjectType: true,
        stageType: true,
        collectionChannel: true,
        plannedAmount: true,
        customerId: true,
        ownerId: true,
      },
    });

    createdPlanIds.push(createdPlan.id);

    await createPaymentPlanLog(tx, {
      actorId: input.actorId,
      paymentPlanId: createdPlan.id,
      sourceType: PaymentSourceType.SALES_ORDER,
      salesOrderId: input.salesOrderId,
      subjectType: createdPlan.subjectType,
      stageType: createdPlan.stageType,
      collectionChannel: createdPlan.collectionChannel,
      plannedAmount: toNumber(createdPlan.plannedAmount),
      sequence: seed.sequence,
    });

    if (shouldAutoSubmitOrderPlan(createdPlan)) {
      await createSubmittedPaymentRecord(tx, {
        paymentPlanId: createdPlan.id,
        tradeOrderId: input.tradeOrderId ?? null,
        sourceType: PaymentSourceType.SALES_ORDER,
        salesOrderId: input.salesOrderId,
        shippingTaskId: input.shippingTaskId ?? null,
        customerId: input.customerId,
        ownerId: input.ownerId ?? null,
        amount: toNumber(createdPlan.plannedAmount),
        actorId: input.actorId,
        remark: "Auto-submitted from order payment scheme.",
      });
    }

    const progress = await syncPaymentPlanAggregateState(tx, createdPlan.id);

    if (
      progress &&
      progress.remainingAmount > 0 &&
      createdPlan.ownerId &&
      createdPlan.customerId &&
      createdPlan.collectionChannel === PaymentCollectionChannel.PREPAID
    ) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: createdPlan.id,
        actorId: input.actorId,
        tradeOrderId: input.tradeOrderId ?? null,
        ownerId: createdPlan.ownerId,
        sourceType: PaymentSourceType.SALES_ORDER,
        salesOrderId: input.salesOrderId,
        shippingTaskId: input.shippingTaskId ?? null,
        customerId: createdPlan.customerId,
        taskType: deriveCollectionTaskType({
          subjectType: createdPlan.subjectType,
          stageType: createdPlan.stageType,
          collectionChannel: createdPlan.collectionChannel,
        }),
        dueAt: normalizeDueDate(new Date()),
        nextFollowUpAt: buildNextCollectionFollowUp(),
        remark: "Auto-created from sales order payment plan.",
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: input.actorId ?? null,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task.",
            afterData: {
              paymentPlanId: createdPlan.id,
              salesOrderId: input.salesOrderId,
              ownerId: createdPlan.ownerId,
            },
          },
        });
      }
    }
  }

  await syncSalesOrderSummary(tx, input.salesOrderId);

  return createdPlanIds;
}

export async function ensureGiftFreightPaymentArtifacts(
  tx: PaymentTransaction,
  input: EnsureGiftFreightPaymentArtifactsInput,
) {
  const existingPlans = await tx.paymentPlan.findMany({
    where: {
      giftRecordId: input.giftRecordId,
      sourceType: PaymentSourceType.GIFT_RECORD,
    },
    select: {
      id: true,
      paymentRecords: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (
    existingPlans.some((plan) =>
      plan.paymentRecords.some(
        (record) => record.status === PaymentRecordStatus.CONFIRMED,
      ),
    )
  ) {
    throw new Error(
      "This gift freight record already has confirmed payment records. Rebuilding payment plans is blocked.",
    );
  }

  if (existingPlans.length > 0) {
    const planIds = existingPlans.map((plan) => plan.id);

    await tx.collectionTask.deleteMany({
      where: {
        paymentPlanId: {
          in: planIds,
        },
      },
    });

    await tx.paymentRecord.deleteMany({
      where: {
        paymentPlanId: {
          in: planIds,
        },
      },
    });

    await tx.paymentPlan.deleteMany({
      where: {
        id: {
          in: planIds,
        },
      },
    });
  }

  const seeds = buildGiftFreightPaymentPlanSeeds({
    freightAmount: toNumber(input.freightAmount),
  });

  const createdPlanIds: string[] = [];

  for (const seed of seeds) {
    const createdPlan = await tx.paymentPlan.create({
      data: {
        sourceType: PaymentSourceType.GIFT_RECORD,
        giftRecordId: input.giftRecordId,
        shippingTaskId: input.shippingTaskId ?? null,
        customerId: input.customerId,
        ownerId: input.ownerId ?? null,
        subjectType: seed.subjectType,
        stageType: seed.stageType,
        collectionChannel: seed.collectionChannel,
        plannedAmount: seed.plannedAmount,
        submittedAmount: 0,
        confirmedAmount: 0,
        remainingAmount: seed.plannedAmount,
        sequence: seed.sequence,
        createdById: input.actorId ?? null,
        updatedById: input.actorId ?? null,
      },
      select: {
        id: true,
        subjectType: true,
        stageType: true,
        collectionChannel: true,
        plannedAmount: true,
        customerId: true,
        ownerId: true,
      },
    });

    createdPlanIds.push(createdPlan.id);

    await createPaymentPlanLog(tx, {
      actorId: input.actorId,
      paymentPlanId: createdPlan.id,
      sourceType: PaymentSourceType.GIFT_RECORD,
      giftRecordId: input.giftRecordId,
      subjectType: createdPlan.subjectType,
      stageType: createdPlan.stageType,
      collectionChannel: createdPlan.collectionChannel,
      plannedAmount: toNumber(createdPlan.plannedAmount),
      sequence: seed.sequence,
    });

    await syncPaymentPlanAggregateState(tx, createdPlan.id);

    if (createdPlan.ownerId && createdPlan.customerId) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: createdPlan.id,
        actorId: input.actorId,
        ownerId: createdPlan.ownerId,
        sourceType: PaymentSourceType.GIFT_RECORD,
        giftRecordId: input.giftRecordId,
        shippingTaskId: input.shippingTaskId ?? null,
        customerId: createdPlan.customerId,
        taskType: deriveCollectionTaskType({
          subjectType: createdPlan.subjectType,
          stageType: createdPlan.stageType,
          collectionChannel: createdPlan.collectionChannel,
        }),
        dueAt: normalizeDueDate(new Date()),
        nextFollowUpAt: buildNextCollectionFollowUp(),
        remark: "Auto-created from gift freight payment plan.",
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: input.actorId ?? null,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task.",
            afterData: {
              paymentPlanId: createdPlan.id,
              giftRecordId: input.giftRecordId,
              ownerId: createdPlan.ownerId,
            },
          },
        });
      }
    }
  }

  return createdPlanIds;
}

export async function attachSalesOrderPaymentArtifactsToShippingTask(
  tx: PaymentTransaction,
  salesOrderId: string,
  shippingTaskId: string,
) {
  await tx.paymentPlan.updateMany({
    where: {
      salesOrderId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });

  await tx.paymentRecord.updateMany({
    where: {
      salesOrderId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });

  await tx.collectionTask.updateMany({
    where: {
      salesOrderId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });
}

export async function attachGiftFreightPaymentArtifactsToShippingTask(
  tx: PaymentTransaction,
  giftRecordId: string,
  shippingTaskId: string,
) {
  await tx.paymentPlan.updateMany({
    where: {
      giftRecordId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });

  await tx.paymentRecord.updateMany({
    where: {
      giftRecordId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });

  await tx.collectionTask.updateMany({
    where: {
      giftRecordId,
      shippingTaskId: null,
    },
    data: { shippingTaskId },
  });
}

function isShippingCollectionReady(status: ShippingFulfillmentStatus) {
  return (
    status === ShippingFulfillmentStatus.SHIPPED ||
    status === ShippingFulfillmentStatus.DELIVERED ||
    status === ShippingFulfillmentStatus.COMPLETED
  );
}

function getCodCollectionTaskRemark(status: CodCollectionStatus) {
  switch (status) {
    case CodCollectionStatus.EXCEPTION:
      return "COD collection marked as exception; sales follow-up required.";
    case CodCollectionStatus.REJECTED:
      return "COD collection marked as refused/rejected; sales follow-up required.";
    case CodCollectionStatus.UNCOLLECTED:
      return "COD collection remains outstanding after shipment; sales follow-up required.";
    case CodCollectionStatus.PENDING_COLLECTION:
    default:
      return "COD collection pending after shipment.";
  }
}

function buildCodCollectionAfterData(input: {
  paymentPlanId: string;
  salesOrderId: string;
  shippingTaskId: string;
  status: CodCollectionStatus;
  expectedAmount: number;
  collectedAmount: number;
  paymentRecordId?: string | null;
  occurredAt?: Date | null;
  remark?: string | null;
}) {
  return {
    paymentPlanId: input.paymentPlanId,
    salesOrderId: input.salesOrderId,
    shippingTaskId: input.shippingTaskId,
    status: input.status,
    expectedAmount: input.expectedAmount,
    collectedAmount: input.collectedAmount,
    paymentRecordId: input.paymentRecordId ?? null,
    occurredAt: input.occurredAt ?? null,
    remark: input.remark ?? null,
  };
}

export async function cancelSalesOrderCollectionTasks(
  tx: PaymentTransaction,
  salesOrderId: string,
) {
  await tx.collectionTask.updateMany({
    where: {
      salesOrderId,
      status: {
        in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
      },
    },
    data: {
      status: CollectionTaskStatus.CANCELED,
      closedAt: new Date(),
    },
  });
}

export async function syncShippingCollectionTasks(
  tx: PaymentTransaction,
  input: {
    salesOrderId: string;
    shippingTaskId: string;
    shippingStatus: ShippingFulfillmentStatus;
    actorId?: string | null;
    codCollectionStatus?: CodCollectionStatus | null;
    codCollectedAmount?: Prisma.Decimal | number | string | null;
    codRemark?: string | null;
  },
) {
  const plans = await tx.paymentPlan.findMany({
    where: {
      salesOrderId: input.salesOrderId,
      collectionChannel: PaymentCollectionChannel.COD,
      status: {
        not: PaymentPlanStatus.CANCELED,
      },
    },
    select: {
      id: true,
      sourceType: true,
      tradeOrderId: true,
      salesOrderId: true,
      giftRecordId: true,
      customerId: true,
      ownerId: true,
      subjectType: true,
      stageType: true,
      collectionChannel: true,
      plannedAmount: true,
      remainingAmount: true,
      codCollectionRecord: {
        select: {
          id: true,
          status: true,
          expectedAmount: true,
          collectedAmount: true,
          occurredAt: true,
          remark: true,
          paymentRecordId: true,
          paymentRecord: {
            select: {
              id: true,
              amount: true,
              status: true,
              occurredAt: true,
              remark: true,
            },
          },
        },
      },
    },
  });

  for (const plan of plans) {
    const shippingReady = isShippingCollectionReady(input.shippingStatus);
    const customerId = plan.customerId;
    const expectedAmount = roundCurrency(toNumber(plan.plannedAmount));
    const remainingAmount = roundCurrency(toNumber(plan.remainingAmount));
    const requestedCodStatus = input.codCollectionStatus ?? null;
    let codCollectionRecord = plan.codCollectionRecord;

    if (shippingReady && !codCollectionRecord) {
      if (!customerId || !plan.salesOrderId) {
        throw new Error("COD collection requires a linked sales order and customer.");
      }

      codCollectionRecord = await tx.codCollectionRecord.create({
        data: {
          paymentPlanId: plan.id,
          salesOrderId: plan.salesOrderId,
          shippingTaskId: input.shippingTaskId,
          customerId,
          ownerId: plan.ownerId ?? null,
          status: CodCollectionStatus.PENDING_COLLECTION,
          expectedAmount,
          collectedAmount: 0,
          remark: "Auto-created after shipment for COD tracking.",
        },
        select: {
          id: true,
          status: true,
          expectedAmount: true,
          collectedAmount: true,
          occurredAt: true,
          remark: true,
          paymentRecordId: true,
          paymentRecord: {
            select: {
              id: true,
              amount: true,
              status: true,
              occurredAt: true,
              remark: true,
            },
          },
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: input.actorId ?? null,
          module: OperationModule.COLLECTION,
          action: "cod_collection_record.created",
          targetType: OperationTargetType.COD_COLLECTION_RECORD,
          targetId: codCollectionRecord.id,
          description: "Create COD collection record after shipment.",
          afterData: buildCodCollectionAfterData({
            paymentPlanId: plan.id,
            salesOrderId: plan.salesOrderId ?? input.salesOrderId,
            shippingTaskId: input.shippingTaskId,
            status: CodCollectionStatus.PENDING_COLLECTION,
            expectedAmount,
            collectedAmount: 0,
            remark: "Auto-created after shipment for COD tracking.",
          }),
        },
      });
    }

    if (shippingReady) {
      if (toNumber(plan.remainingAmount) > 0 && plan.ownerId && plan.customerId) {
        const task = await ensureCollectionTaskForPlan(tx, {
          paymentPlanId: plan.id,
          actorId: input.actorId,
          ownerId: plan.ownerId,
          sourceType: plan.sourceType,
          salesOrderId: plan.salesOrderId,
          giftRecordId: plan.giftRecordId,
          shippingTaskId: input.shippingTaskId,
          customerId: plan.customerId,
          taskType: deriveCollectionTaskType({
            subjectType: plan.subjectType,
            stageType: plan.stageType,
            collectionChannel: plan.collectionChannel,
          }),
          dueAt: normalizeDueDate(new Date()),
          nextFollowUpAt: buildNextCollectionFollowUp(),
          remark: "Auto-created from COD collection after shipment.",
        });

        if (task.created) {
          await tx.operationLog.create({
            data: {
              actorId: input.actorId ?? null,
              module: OperationModule.COLLECTION,
              action: "collection_task.created",
              targetType: OperationTargetType.COLLECTION_TASK,
              targetId: task.id,
              description: "Create collection task.",
              afterData: {
                paymentPlanId: plan.id,
                salesOrderId: plan.salesOrderId,
                shippingTaskId: input.shippingTaskId,
              },
            },
          });
        }
      }
    }

    if (input.shippingStatus === ShippingFulfillmentStatus.CANCELED) {
      await completeCollectionTasksForPlan(
        tx,
        plan.id,
        CollectionTaskStatus.CANCELED,
      );

      if (
        codCollectionRecord &&
        codCollectionRecord.status === CodCollectionStatus.PENDING_COLLECTION
      ) {
        const nextRemark = input.codRemark?.trim()
          ? input.codRemark.trim()
          : "Shipment canceled before COD was collected.";

        await tx.codCollectionRecord.update({
          where: { id: codCollectionRecord.id },
          data: {
            status: CodCollectionStatus.UNCOLLECTED,
            collectedAmount: 0,
            occurredAt: new Date(),
            remark: nextRemark,
          },
        });

        await tx.operationLog.create({
          data: {
            actorId: input.actorId ?? null,
            module: OperationModule.COLLECTION,
            action: "cod_collection_record.updated",
            targetType: OperationTargetType.COD_COLLECTION_RECORD,
            targetId: codCollectionRecord.id,
            description: "Mark COD collection as uncollected after shipment cancellation.",
            beforeData: buildCodCollectionAfterData({
              paymentPlanId: plan.id,
              salesOrderId: plan.salesOrderId ?? input.salesOrderId,
              shippingTaskId: input.shippingTaskId,
              status: codCollectionRecord.status,
              expectedAmount: toNumber(codCollectionRecord.expectedAmount),
              collectedAmount: toNumber(codCollectionRecord.collectedAmount),
              paymentRecordId: codCollectionRecord.paymentRecordId,
              occurredAt: codCollectionRecord.occurredAt,
              remark: codCollectionRecord.remark,
            }),
            afterData: buildCodCollectionAfterData({
              paymentPlanId: plan.id,
              salesOrderId: plan.salesOrderId ?? input.salesOrderId,
              shippingTaskId: input.shippingTaskId,
              status: CodCollectionStatus.UNCOLLECTED,
              expectedAmount,
              collectedAmount: 0,
              paymentRecordId: codCollectionRecord.paymentRecordId,
              occurredAt: new Date(),
              remark: nextRemark,
            }),
          },
        });
      }
    }

    if (!requestedCodStatus) {
      continue;
    }

    if (!shippingReady && requestedCodStatus !== CodCollectionStatus.PENDING_COLLECTION) {
      throw new Error("COD collection can only be recorded after the shipment enters a shipped state.");
    }

    if (!plan.salesOrderId || !customerId) {
      throw new Error("COD collection requires a linked sales order and customer.");
    }

    if (!codCollectionRecord) {
      codCollectionRecord = await tx.codCollectionRecord.create({
        data: {
          paymentPlanId: plan.id,
          salesOrderId: plan.salesOrderId,
          shippingTaskId: input.shippingTaskId,
          customerId,
          ownerId: plan.ownerId ?? null,
          status: requestedCodStatus,
          expectedAmount,
          collectedAmount: 0,
          remark: input.codRemark?.trim() || null,
        },
        select: {
          id: true,
          status: true,
          expectedAmount: true,
          collectedAmount: true,
          occurredAt: true,
          remark: true,
          paymentRecordId: true,
          paymentRecord: {
            select: {
              id: true,
              amount: true,
              status: true,
              occurredAt: true,
              remark: true,
            },
          },
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: input.actorId ?? null,
          module: OperationModule.COLLECTION,
          action: "cod_collection_record.created",
          targetType: OperationTargetType.COD_COLLECTION_RECORD,
          targetId: codCollectionRecord.id,
          description: "Create COD collection record.",
          afterData: buildCodCollectionAfterData({
            paymentPlanId: plan.id,
            salesOrderId: plan.salesOrderId,
            shippingTaskId: input.shippingTaskId,
            status: requestedCodStatus,
            expectedAmount,
            collectedAmount: 0,
            remark: input.codRemark?.trim() || null,
          }),
        },
      });
    }

    if (
      requestedCodStatus !== CodCollectionStatus.COLLECTED &&
      codCollectionRecord.paymentRecord?.status === PaymentRecordStatus.CONFIRMED
    ) {
      throw new Error("Confirmed COD payment records cannot be rolled back from the shipping center.");
    }

    const now = new Date();

    const codSubmittedById = input.actorId ?? plan.ownerId;

    if (requestedCodStatus === CodCollectionStatus.COLLECTED) {
      const collectedAmount = roundCurrency(
        Math.max(
          Number((input.codCollectedAmount ?? remainingAmount) || expectedAmount),
          0,
        ),
      );

      if (collectedAmount <= 0) {
        throw new Error("Collected COD amount must be greater than 0.");
      }

      if (collectedAmount > expectedAmount) {
        throw new Error("Collected COD amount cannot exceed the planned COD amount.");
      }

      if (collectedAmount < expectedAmount) {
        throw new Error("Partial COD receipts should be tracked as exception or uncollected, not fully collected.");
      }

      let paymentRecordId = codCollectionRecord.paymentRecordId ?? null;

      if (codCollectionRecord.paymentRecordId && codCollectionRecord.paymentRecord) {
        if (codCollectionRecord.paymentRecord.status === PaymentRecordStatus.CONFIRMED) {
          if (roundCurrency(toNumber(codCollectionRecord.paymentRecord.amount)) !== collectedAmount) {
            throw new Error("This COD payment record is already confirmed with a different amount.");
          }
        } else {
          if (!codSubmittedById) {
            throw new Error("A shipping actor or payment owner is required to record COD collection.");
          }

          await tx.paymentRecord.update({
            where: { id: codCollectionRecord.paymentRecordId },
            data: {
              amount: collectedAmount,
              channel: PaymentRecordChannel.COD,
              status: PaymentRecordStatus.SUBMITTED,
              occurredAt: now,
              submittedById: codSubmittedById,
              referenceNo: null,
              remark: input.codRemark?.trim() || codCollectionRecord.paymentRecord.remark || null,
            },
          });

          await tx.operationLog.create({
            data: {
              actorId: input.actorId ?? null,
              module: OperationModule.PAYMENT,
              action: "payment_record.submitted",
              targetType: OperationTargetType.PAYMENT_RECORD,
              targetId: codCollectionRecord.paymentRecordId,
              description: "Refresh COD payment record from shipping center.",
              afterData: {
                paymentPlanId: plan.id,
                salesOrderId: plan.salesOrderId,
                shippingTaskId: input.shippingTaskId,
                amount: collectedAmount,
                channel: PaymentRecordChannel.COD,
                occurredAt: now,
              },
            },
          });
        }
      } else {
        if (!codSubmittedById) {
          throw new Error("A shipping actor or payment owner is required to record COD collection.");
        }

        paymentRecordId = await createSubmittedPaymentRecord(tx, {
          paymentPlanId: plan.id,
          sourceType: plan.sourceType,
          salesOrderId: plan.salesOrderId,
          giftRecordId: plan.giftRecordId,
          shippingTaskId: input.shippingTaskId,
          customerId,
          ownerId: plan.ownerId ?? null,
          amount: collectedAmount,
          actorId: codSubmittedById,
          channel: PaymentRecordChannel.COD,
          occurredAt: now,
          referenceNo: null,
          remark: input.codRemark?.trim() || "Recorded from shipping center COD collection.",
        });
      }

      await tx.codCollectionRecord.update({
        where: { id: codCollectionRecord.id },
        data: {
          shippingTaskId: input.shippingTaskId,
          status: CodCollectionStatus.COLLECTED,
          expectedAmount,
          collectedAmount,
          paymentRecordId,
          occurredAt: now,
          remark: input.codRemark?.trim() || codCollectionRecord.remark || null,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: input.actorId ?? null,
          module: OperationModule.COLLECTION,
          action: "cod_collection_record.updated",
          targetType: OperationTargetType.COD_COLLECTION_RECORD,
          targetId: codCollectionRecord.id,
          description: "Record COD collection result.",
          beforeData: buildCodCollectionAfterData({
            paymentPlanId: plan.id,
            salesOrderId: plan.salesOrderId,
            shippingTaskId: input.shippingTaskId,
            status: codCollectionRecord.status,
            expectedAmount: toNumber(codCollectionRecord.expectedAmount),
            collectedAmount: toNumber(codCollectionRecord.collectedAmount),
            paymentRecordId: codCollectionRecord.paymentRecordId,
            occurredAt: codCollectionRecord.occurredAt,
            remark: codCollectionRecord.remark,
          }),
          afterData: buildCodCollectionAfterData({
            paymentPlanId: plan.id,
            salesOrderId: plan.salesOrderId,
            shippingTaskId: input.shippingTaskId,
            status: CodCollectionStatus.COLLECTED,
            expectedAmount,
            collectedAmount,
            paymentRecordId,
            occurredAt: now,
            remark: input.codRemark?.trim() || codCollectionRecord.remark || null,
          }),
        },
      });

      await syncPaymentPlanAggregateState(tx, plan.id);
      await syncSalesOrderSummary(tx, plan.salesOrderId);
      await completeCollectionTasksForPlan(tx, plan.id, CollectionTaskStatus.COMPLETED);
      continue;
    }

    if (
      codCollectionRecord.paymentRecordId &&
      codCollectionRecord.paymentRecord &&
      codCollectionRecord.paymentRecord.status !== PaymentRecordStatus.CONFIRMED
    ) {
      await tx.paymentRecord.update({
        where: { id: codCollectionRecord.paymentRecordId },
        data: {
          status: PaymentRecordStatus.REJECTED,
          confirmedById: null,
          confirmedAt: null,
          remark: input.codRemark?.trim() || codCollectionRecord.paymentRecord.remark || null,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: input.actorId ?? null,
          module: OperationModule.PAYMENT,
          action: "payment_record.rejected",
          targetType: OperationTargetType.PAYMENT_RECORD,
          targetId: codCollectionRecord.paymentRecordId,
          description: "Reject COD payment record after shipping-side status update.",
          beforeData: {
            status: codCollectionRecord.paymentRecord.status,
            amount: codCollectionRecord.paymentRecord.amount,
            occurredAt: codCollectionRecord.paymentRecord.occurredAt,
            remark: codCollectionRecord.paymentRecord.remark,
          },
          afterData: {
            status: PaymentRecordStatus.REJECTED,
            remark: input.codRemark?.trim() || codCollectionRecord.paymentRecord.remark || null,
          },
        },
      });
    }

    await tx.codCollectionRecord.update({
      where: { id: codCollectionRecord.id },
      data: {
        shippingTaskId: input.shippingTaskId,
        status: requestedCodStatus,
        expectedAmount,
        collectedAmount: 0,
        occurredAt: requestedCodStatus === CodCollectionStatus.PENDING_COLLECTION ? null : now,
        remark: input.codRemark?.trim() || codCollectionRecord.remark || null,
        paymentRecordId: null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: input.actorId ?? null,
        module: OperationModule.COLLECTION,
        action: "cod_collection_record.updated",
        targetType: OperationTargetType.COD_COLLECTION_RECORD,
        targetId: codCollectionRecord.id,
        description: "Update COD collection status from shipping center.",
        beforeData: buildCodCollectionAfterData({
          paymentPlanId: plan.id,
          salesOrderId: plan.salesOrderId,
          shippingTaskId: input.shippingTaskId,
          status: codCollectionRecord.status,
          expectedAmount: toNumber(codCollectionRecord.expectedAmount),
          collectedAmount: toNumber(codCollectionRecord.collectedAmount),
          paymentRecordId: codCollectionRecord.paymentRecordId,
          occurredAt: codCollectionRecord.occurredAt,
          remark: codCollectionRecord.remark,
        }),
        afterData: buildCodCollectionAfterData({
          paymentPlanId: plan.id,
          salesOrderId: plan.salesOrderId,
          shippingTaskId: input.shippingTaskId,
          status: requestedCodStatus,
          expectedAmount,
          collectedAmount: 0,
          paymentRecordId: null,
          occurredAt:
            requestedCodStatus === CodCollectionStatus.PENDING_COLLECTION ? null : now,
          remark: input.codRemark?.trim() || codCollectionRecord.remark || null,
        }),
      },
    });

    await syncPaymentPlanAggregateState(tx, plan.id);
    await syncSalesOrderSummary(tx, plan.salesOrderId);

    if (plan.ownerId && plan.customerId) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: plan.id,
        actorId: input.actorId,
        ownerId: plan.ownerId,
        sourceType: plan.sourceType,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        shippingTaskId: input.shippingTaskId,
        customerId,
        taskType: deriveCollectionTaskType({
          subjectType: plan.subjectType,
          stageType: plan.stageType,
          collectionChannel: plan.collectionChannel,
        }),
        dueAt: normalizeDueDate(now),
        nextFollowUpAt: buildNextCollectionFollowUp(now),
        remark: getCodCollectionTaskRemark(requestedCodStatus),
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: input.actorId ?? null,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task for COD follow-up.",
            afterData: {
              paymentPlanId: plan.id,
              salesOrderId: plan.salesOrderId,
              shippingTaskId: input.shippingTaskId,
              codCollectionStatus: requestedCodStatus,
            },
          },
        });
      }
    }
  }
}

export async function submitPaymentRecord(
  actor: PaymentActor,
  rawInput: z.input<typeof submitPaymentRecordSchema>,
) {
  if (!canAccessPaymentRecordModule(actor.role) || !canSubmitPaymentRecord(actor.role)) {
    throw new Error("You do not have permission to submit payment records.");
  }

  const input = submitPaymentRecordSchema.parse(rawInput);
  const teamId = await getPaymentActorTeamId(actor);
  const planScope = buildPaymentPlanScope(actor, teamId);

  const plan = await prisma.paymentPlan.findFirst({
    where: {
      id: input.paymentPlanId,
      status: {
        not: PaymentPlanStatus.CANCELED,
      },
      AND: [planScope],
    },
    select: {
      id: true,
      sourceType: true,
      tradeOrderId: true,
      salesOrderId: true,
      giftRecordId: true,
      shippingTaskId: true,
      customerId: true,
      ownerId: true,
      subjectType: true,
      stageType: true,
      collectionChannel: true,
      plannedAmount: true,
      remainingAmount: true,
      status: true,
    },
  });

  if (!plan) {
    throw new Error("Payment plan not found or out of scope.");
  }

  if (plan.collectionChannel === PaymentCollectionChannel.COD) {
    throw new Error("COD collection must be recorded from the shipping center.");
  }

  if (
    plan.status === PaymentPlanStatus.COLLECTED ||
    toNumber(plan.remainingAmount) <= 0
  ) {
    throw new Error("This payment plan is already fully submitted.");
  }

  const amount = roundCurrency(input.amount);
  if (amount > toNumber(plan.remainingAmount)) {
    throw new Error("Submitted amount cannot exceed the remaining amount.");
  }

  const occurredAt = parseOptionalDate(input.occurredAt) ?? new Date();

  const result = await prisma.$transaction(async (tx) => {
    const record = await tx.paymentRecord.create({
      data: {
        paymentPlanId: plan.id,
        tradeOrderId: plan.tradeOrderId,
        sourceType: plan.sourceType,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        shippingTaskId: plan.shippingTaskId,
        customerId: plan.customerId,
        ownerId: plan.ownerId,
        amount,
        channel: input.channel,
        status: PaymentRecordStatus.SUBMITTED,
        occurredAt,
        submittedById: actor.id,
        referenceNo: input.referenceNo || null,
        remark: input.remark || null,
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.PAYMENT,
        action: "payment_record.submitted",
        targetType: OperationTargetType.PAYMENT_RECORD,
        targetId: record.id,
        description: "Submit payment record.",
        afterData: {
          paymentPlanId: plan.id,
          sourceType: plan.sourceType,
          salesOrderId: plan.salesOrderId,
          giftRecordId: plan.giftRecordId,
          amount,
          channel: input.channel,
          occurredAt,
          referenceNo: input.referenceNo || null,
        },
      },
    });

    const progress = await syncPaymentPlanAggregateState(tx, plan.id);

    if (plan.sourceType === PaymentSourceType.SALES_ORDER && plan.salesOrderId) {
      await syncSalesOrderSummary(tx, plan.salesOrderId);
    }

    if (progress && progress.remainingAmount <= 0) {
      await completeCollectionTasksForPlan(
        tx,
        plan.id,
        CollectionTaskStatus.COMPLETED,
      );
    } else if (plan.ownerId && plan.customerId) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: plan.id,
        actorId: actor.id,
        tradeOrderId: plan.tradeOrderId,
        ownerId: plan.ownerId,
        sourceType: plan.sourceType,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        shippingTaskId: plan.shippingTaskId,
        customerId: plan.customerId,
        taskType: deriveCollectionTaskType({
          subjectType: plan.subjectType,
          stageType: plan.stageType,
          collectionChannel: plan.collectionChannel,
        }),
        dueAt: normalizeDueDate(occurredAt),
        nextFollowUpAt: buildNextCollectionFollowUp(occurredAt),
        remark: "Pending follow-up after payment submission.",
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task.",
            afterData: {
              paymentPlanId: plan.id,
              salesOrderId: plan.salesOrderId,
              giftRecordId: plan.giftRecordId,
              ownerId: plan.ownerId,
            },
          },
        });
      }
    }

    return {
      paymentRecordId: record.id,
      salesOrderId: plan.salesOrderId,
      giftRecordId: plan.giftRecordId,
      customerId: plan.customerId,
    };
  });

  return result;
}

export async function reviewPaymentRecord(
  actor: PaymentActor,
  rawInput: z.input<typeof reviewPaymentRecordSchema>,
) {
  if (!canAccessPaymentRecordModule(actor.role) || !canConfirmPaymentRecord(actor.role)) {
    throw new Error("You do not have permission to review payment records.");
  }

  const input = reviewPaymentRecordSchema.parse(rawInput);
  const teamId = await getPaymentActorTeamId(actor);
  const recordScope = buildPaymentRecordScope(actor, teamId);

  const existing = await prisma.paymentRecord.findFirst({
    where: {
      id: input.paymentRecordId,
      status: PaymentRecordStatus.SUBMITTED,
      AND: [recordScope],
    },
    select: {
      id: true,
      paymentPlanId: true,
      sourceType: true,
      salesOrderId: true,
      tradeOrderId: true,
      giftRecordId: true,
      shippingTaskId: true,
      customerId: true,
      ownerId: true,
      amount: true,
      channel: true,
      occurredAt: true,
      referenceNo: true,
      remark: true,
      paymentPlan: {
        select: {
          id: true,
          tradeOrderId: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          customerId: true,
          ownerId: true,
          codCollectionRecord: {
            select: {
              id: true,
              status: true,
              expectedAmount: true,
              collectedAmount: true,
              occurredAt: true,
              remark: true,
            },
          },
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Payment record not found or not reviewable.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.paymentRecord.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        confirmedById: input.status === "CONFIRMED" ? actor.id : null,
        confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
        remark: input.remark || existing.remark || null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.PAYMENT,
        action:
          input.status === "CONFIRMED"
            ? "payment_record.confirmed"
            : "payment_record.rejected",
        targetType: OperationTargetType.PAYMENT_RECORD,
        targetId: existing.id,
        description:
          input.status === "CONFIRMED"
            ? "Confirm payment record."
            : "Reject payment record.",
        beforeData: {
          status: PaymentRecordStatus.SUBMITTED,
          remark: existing.remark,
        },
        afterData: {
          status: input.status,
          remark: input.remark || existing.remark || null,
          confirmedById: input.status === "CONFIRMED" ? actor.id : null,
        },
      },
    });

    const progress = await syncPaymentPlanAggregateState(tx, existing.paymentPlanId);

    if (existing.sourceType === PaymentSourceType.SALES_ORDER && existing.salesOrderId) {
      await syncSalesOrderSummary(tx, existing.salesOrderId);
    }

    if (existing.paymentPlan.collectionChannel === PaymentCollectionChannel.COD) {
      const codCollectionRecord = existing.paymentPlan.codCollectionRecord;

      if (codCollectionRecord && existing.salesOrderId) {
        await tx.codCollectionRecord.update({
          where: { id: codCollectionRecord.id },
          data: {
            status:
              input.status === "CONFIRMED"
                ? CodCollectionStatus.COLLECTED
                : CodCollectionStatus.EXCEPTION,
            collectedAmount:
              input.status === "CONFIRMED" ? existing.amount : 0,
            paymentRecordId: existing.id,
            occurredAt: existing.occurredAt,
            remark:
              input.status === "REJECTED"
                ? input.remark || codCollectionRecord.remark || "COD payment confirmation was rejected."
                : input.remark || codCollectionRecord.remark || null,
          },
        });

        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.COLLECTION,
            action: "cod_collection_record.updated",
            targetType: OperationTargetType.COD_COLLECTION_RECORD,
            targetId: codCollectionRecord.id,
            description:
              input.status === "CONFIRMED"
                ? "Confirm COD collection record from payment review."
                : "Mark COD collection record as exception after payment rejection.",
            beforeData: buildCodCollectionAfterData({
              paymentPlanId: existing.paymentPlanId,
              salesOrderId: existing.salesOrderId,
              shippingTaskId: existing.shippingTaskId ?? "",
              status: codCollectionRecord.status,
              expectedAmount: toNumber(codCollectionRecord.expectedAmount),
              collectedAmount: toNumber(codCollectionRecord.collectedAmount),
              paymentRecordId: existing.id,
              occurredAt: codCollectionRecord.occurredAt,
              remark: codCollectionRecord.remark,
            }),
            afterData: buildCodCollectionAfterData({
              paymentPlanId: existing.paymentPlanId,
              salesOrderId: existing.salesOrderId,
              shippingTaskId: existing.shippingTaskId ?? "",
              status:
                input.status === "CONFIRMED"
                  ? CodCollectionStatus.COLLECTED
                  : CodCollectionStatus.EXCEPTION,
              expectedAmount: toNumber(codCollectionRecord.expectedAmount),
              collectedAmount: input.status === "CONFIRMED" ? toNumber(existing.amount) : 0,
              paymentRecordId: existing.id,
              occurredAt: existing.occurredAt,
              remark:
                input.status === "REJECTED"
                  ? input.remark || codCollectionRecord.remark || "COD payment confirmation was rejected."
                  : input.remark || codCollectionRecord.remark || null,
            }),
          },
        });
      }
    }

    if (progress && progress.remainingAmount <= 0) {
      await completeCollectionTasksForPlan(
        tx,
        existing.paymentPlanId,
        CollectionTaskStatus.COMPLETED,
      );
    } else if (
      existing.paymentPlan.collectionChannel === PaymentCollectionChannel.COD &&
      existing.paymentPlan.ownerId &&
      existing.paymentPlan.customerId
    ) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: existing.paymentPlanId,
        actorId: actor.id,
        tradeOrderId: existing.paymentPlan.tradeOrderId,
        ownerId: existing.paymentPlan.ownerId,
        sourceType: existing.sourceType,
        salesOrderId: existing.salesOrderId,
        giftRecordId: existing.giftRecordId,
        shippingTaskId: existing.shippingTaskId,
        customerId: existing.paymentPlan.customerId,
        taskType: deriveCollectionTaskType({
          subjectType: existing.paymentPlan.subjectType,
          stageType: existing.paymentPlan.stageType,
          collectionChannel: existing.paymentPlan.collectionChannel,
        }),
        dueAt: normalizeDueDate(existing.occurredAt),
        nextFollowUpAt: buildNextCollectionFollowUp(existing.occurredAt),
        remark:
          input.status === "REJECTED"
            ? "Re-opened after COD payment record rejection."
            : "COD collection follow-up remains open until finance confirmation completes.",
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task.",
            afterData: {
              paymentPlanId: existing.paymentPlanId,
              salesOrderId: existing.salesOrderId,
              giftRecordId: existing.giftRecordId,
              ownerId: existing.paymentPlan.ownerId,
              sourceType: "COD_PAYMENT_REVIEW",
            },
          },
        });
      }
    } else if (
      existing.paymentPlan.ownerId &&
      existing.paymentPlan.customerId &&
      existing.paymentPlan.collectionChannel !== PaymentCollectionChannel.COD
    ) {
      const task = await ensureCollectionTaskForPlan(tx, {
        paymentPlanId: existing.paymentPlanId,
        actorId: actor.id,
        tradeOrderId: existing.paymentPlan.tradeOrderId,
        ownerId: existing.paymentPlan.ownerId,
        sourceType: existing.sourceType,
        salesOrderId: existing.salesOrderId,
        giftRecordId: existing.giftRecordId,
        shippingTaskId: existing.shippingTaskId,
        customerId: existing.paymentPlan.customerId,
        taskType: deriveCollectionTaskType({
          subjectType: existing.paymentPlan.subjectType,
          stageType: existing.paymentPlan.stageType,
          collectionChannel: existing.paymentPlan.collectionChannel,
        }),
        dueAt: normalizeDueDate(existing.occurredAt),
        nextFollowUpAt: buildNextCollectionFollowUp(existing.occurredAt),
        remark:
          input.status === "REJECTED"
            ? "Re-opened after payment record rejection."
            : "Follow-up remains open after partial confirmation.",
      });

      if (task.created) {
        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.COLLECTION,
            action: "collection_task.created",
            targetType: OperationTargetType.COLLECTION_TASK,
            targetId: task.id,
            description: "Create collection task.",
            afterData: {
              paymentPlanId: existing.paymentPlanId,
              salesOrderId: existing.salesOrderId,
              giftRecordId: existing.giftRecordId,
              ownerId: existing.paymentPlan.ownerId,
            },
          },
        });
      }
    }

    return {
      paymentRecordId: existing.id,
      salesOrderId: existing.salesOrderId,
      giftRecordId: existing.giftRecordId,
      customerId: existing.customerId,
    };
  });

  return result;
}

export async function upsertCollectionTask(
  actor: PaymentActor,
  rawInput: z.input<typeof upsertCollectionTaskSchema>,
) {
  if (!canAccessCollectionTaskModule(actor.role) || !canManageCollectionTasks(actor.role)) {
    throw new Error("You do not have permission to manage collection tasks.");
  }

  const input = upsertCollectionTaskSchema.parse(rawInput);
  const teamId = await getPaymentActorTeamId(actor);
  const planScope = buildPaymentPlanScope(actor, teamId);

  const plan = await prisma.paymentPlan.findFirst({
    where: {
      id: input.paymentPlanId,
      AND: [planScope],
    },
    select: {
      id: true,
      sourceType: true,
      tradeOrderId: true,
      salesOrderId: true,
      giftRecordId: true,
      shippingTaskId: true,
      customerId: true,
      ownerId: true,
      subjectType: true,
      stageType: true,
      collectionChannel: true,
      status: true,
    },
  });

  if (!plan || !plan.customerId) {
    throw new Error("Payment plan not found or out of scope.");
  }

  if (
    plan.status === PaymentPlanStatus.COLLECTED ||
    plan.status === PaymentPlanStatus.CANCELED
  ) {
    throw new Error("Completed or canceled payment plans do not need active collection tasks.");
  }

  const owner = await resolveCollectionTaskOwner({
    actor,
    actorTeamId: teamId,
    requestedOwnerId: input.ownerId,
    fallbackOwnerId: plan.ownerId,
  });

  const dueAt = normalizeDueDate(parseOptionalDate(input.dueAt));
  const nextFollowUpAt = normalizeCollectionFollowUpDate(
    parseOptionalDate(input.nextFollowUpAt),
    buildNextCollectionFollowUp(dueAt ?? new Date()),
  );
  const customerId = plan.customerId;

  if (!customerId) {
    throw new Error("Collection tasks require a linked customer.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.collectionTask.findFirst({
      where: {
        paymentPlanId: plan.id,
        status: {
          in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        ownerId: true,
        dueAt: true,
        nextFollowUpAt: true,
        remark: true,
      },
    });

    if (existing) {
      await tx.collectionTask.update({
        where: { id: existing.id },
        data: {
          tradeOrderId: plan.tradeOrderId,
          ownerId: owner.id,
          dueAt,
          nextFollowUpAt,
          remark: input.remark || null,
          updatedById: actor.id,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.COLLECTION,
          action: "collection_task.updated",
          targetType: OperationTargetType.COLLECTION_TASK,
          targetId: existing.id,
          description: "Update collection task.",
          beforeData: {
            ownerId: existing.ownerId,
            dueAt: existing.dueAt,
            nextFollowUpAt: existing.nextFollowUpAt,
            remark: existing.remark,
          },
          afterData: {
            ownerId: owner.id,
            dueAt,
            nextFollowUpAt,
            remark: input.remark || null,
          },
        },
      });

      return {
        collectionTaskId: existing.id,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        customerId,
      };
    }

    const created = await tx.collectionTask.create({
      data: {
        paymentPlanId: plan.id,
        tradeOrderId: plan.tradeOrderId,
        sourceType: plan.sourceType,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        shippingTaskId: plan.shippingTaskId,
        customerId,
        ownerId: owner.id,
        taskType: deriveCollectionTaskType({
          subjectType: plan.subjectType,
          stageType: plan.stageType,
          collectionChannel: plan.collectionChannel,
        }),
        dueAt,
        nextFollowUpAt,
        remark: input.remark || null,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "collection_task.created",
        targetType: OperationTargetType.COLLECTION_TASK,
        targetId: created.id,
        description: "Create collection task.",
        afterData: {
          paymentPlanId: plan.id,
          sourceType: plan.sourceType,
          salesOrderId: plan.salesOrderId,
          giftRecordId: plan.giftRecordId,
          ownerId: owner.id,
          dueAt,
          nextFollowUpAt,
        },
      },
    });

      return {
        collectionTaskId: created.id,
        salesOrderId: plan.salesOrderId,
        giftRecordId: plan.giftRecordId,
        customerId,
      };
  });

  return result;
}

export async function updateCollectionTask(
  actor: PaymentActor,
  rawInput: z.input<typeof updateCollectionTaskSchema>,
) {
  if (!canAccessCollectionTaskModule(actor.role) || !canManageCollectionTasks(actor.role)) {
    throw new Error("You do not have permission to manage collection tasks.");
  }

  const input = updateCollectionTaskSchema.parse(rawInput);
  const teamId = await getPaymentActorTeamId(actor);
  const taskScope = buildCollectionTaskScope(actor, teamId);

  const existing = await prisma.collectionTask.findFirst({
    where: {
      id: input.collectionTaskId,
      AND: [taskScope],
    },
    select: {
      id: true,
      salesOrderId: true,
      giftRecordId: true,
      customerId: true,
      ownerId: true,
      status: true,
      nextFollowUpAt: true,
      lastContactAt: true,
      remark: true,
      paymentPlan: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Collection task not found or out of scope.");
  }

  if (actor.role === "SALES" && existing.ownerId !== actor.id) {
    throw new Error("Sales can only update their own collection tasks.");
  }

  const owner = await resolveCollectionTaskOwner({
    actor,
    actorTeamId: teamId,
    requestedOwnerId: input.ownerId,
    fallbackOwnerId: existing.ownerId || existing.paymentPlan.ownerId,
  });

  const nextFollowUpAt = normalizeCollectionFollowUpDate(
    parseOptionalDate(input.nextFollowUpAt),
    existing.nextFollowUpAt,
  );
  const lastContactAt = parseOptionalDate(input.lastContactAt) ?? existing.lastContactAt;
  const closedAt =
    input.status === CollectionTaskStatus.COMPLETED ||
    input.status === CollectionTaskStatus.CANCELED
      ? new Date()
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.collectionTask.update({
      where: { id: existing.id },
      data: {
        ownerId: owner.id,
        status: input.status,
        nextFollowUpAt,
        lastContactAt,
        closedAt,
        remark: input.remark || null,
        updatedById: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "collection_task.updated",
        targetType: OperationTargetType.COLLECTION_TASK,
        targetId: existing.id,
        description: "Update collection task.",
        beforeData: {
          ownerId: existing.ownerId,
          status: existing.status,
          nextFollowUpAt: existing.nextFollowUpAt,
          lastContactAt: existing.lastContactAt,
          remark: existing.remark,
        },
        afterData: {
          ownerId: owner.id,
          status: input.status,
          nextFollowUpAt,
          lastContactAt,
          closedAt,
          remark: input.remark || null,
        },
      },
    });
  });

  return {
    collectionTaskId: existing.id,
    salesOrderId: existing.salesOrderId,
    giftRecordId: existing.giftRecordId,
    customerId: existing.customerId,
  };
}
