import {
  PaymentCollectionChannel,
  PaymentPlanStageType,
  PaymentPlanStatus,
  PaymentPlanSubjectType,
  SalesOrderPaymentScheme,
} from "@prisma/client";

export type SalesOrderPaymentPlanSeed = {
  subjectType: PaymentPlanSubjectType;
  stageType: PaymentPlanStageType;
  collectionChannel: PaymentCollectionChannel;
  plannedAmount: number;
  sequence: number;
};

export type PaymentPlanProgress = {
  submittedAmount: number;
  confirmedAmount: number;
  remainingAmount: number;
  status: PaymentPlanStatus;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildSalesOrderPaymentPlanSeeds(input: {
  paymentScheme: SalesOrderPaymentScheme;
  finalAmount: number;
  depositAmount: number;
}) {
  const finalAmount = roundCurrency(Math.max(input.finalAmount, 0));
  const depositAmount = roundCurrency(Math.max(input.depositAmount, 0));
  const balanceAmount = roundCurrency(Math.max(finalAmount - depositAmount, 0));

  switch (input.paymentScheme) {
    case SalesOrderPaymentScheme.FULL_PREPAID:
      return [
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.FULL,
          collectionChannel: PaymentCollectionChannel.PREPAID,
          plannedAmount: finalAmount,
          sequence: 1,
        },
      ] satisfies SalesOrderPaymentPlanSeed[];
    case SalesOrderPaymentScheme.DEPOSIT_PLUS_BALANCE:
      return [
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.DEPOSIT,
          collectionChannel: PaymentCollectionChannel.PREPAID,
          plannedAmount: depositAmount,
          sequence: 1,
        },
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.BALANCE,
          collectionChannel: PaymentCollectionChannel.PREPAID,
          plannedAmount: balanceAmount,
          sequence: 2,
        },
      ].filter((item) => item.plannedAmount > 0) satisfies SalesOrderPaymentPlanSeed[];
    case SalesOrderPaymentScheme.FULL_COD:
      return [
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.FULL,
          collectionChannel: PaymentCollectionChannel.COD,
          plannedAmount: finalAmount,
          sequence: 1,
        },
      ] satisfies SalesOrderPaymentPlanSeed[];
    case SalesOrderPaymentScheme.DEPOSIT_PLUS_COD:
      return [
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.DEPOSIT,
          collectionChannel: PaymentCollectionChannel.PREPAID,
          plannedAmount: depositAmount,
          sequence: 1,
        },
        {
          subjectType: PaymentPlanSubjectType.GOODS,
          stageType: PaymentPlanStageType.BALANCE,
          collectionChannel: PaymentCollectionChannel.COD,
          plannedAmount: balanceAmount,
          sequence: 2,
        },
      ].filter((item) => item.plannedAmount > 0) satisfies SalesOrderPaymentPlanSeed[];
    default:
      return [];
  }
}

export function buildGiftFreightPaymentPlanSeeds(input: { freightAmount: number }) {
  const freightAmount = roundCurrency(Math.max(input.freightAmount, 0));

  if (freightAmount <= 0) {
    return [] satisfies SalesOrderPaymentPlanSeed[];
  }

  return [
    {
      subjectType: PaymentPlanSubjectType.FREIGHT,
      stageType: PaymentPlanStageType.FULL,
      collectionChannel: PaymentCollectionChannel.PREPAID,
      plannedAmount: freightAmount,
      sequence: 1,
    },
  ] satisfies SalesOrderPaymentPlanSeed[];
}

export function calculatePaymentPlanProgress(input: {
  plannedAmount: number;
  submittedAmount: number;
  confirmedAmount: number;
}) {
  const plannedAmount = roundCurrency(Math.max(input.plannedAmount, 0));
  const submittedAmount = roundCurrency(
    Math.min(Math.max(input.submittedAmount, 0), plannedAmount),
  );
  const confirmedAmount = roundCurrency(
    Math.min(Math.max(input.confirmedAmount, 0), submittedAmount),
  );
  const remainingAmount = roundCurrency(Math.max(plannedAmount - submittedAmount, 0));

  if (plannedAmount === 0 || confirmedAmount >= plannedAmount) {
    return {
      submittedAmount,
      confirmedAmount,
      remainingAmount,
      status: PaymentPlanStatus.COLLECTED,
    } satisfies PaymentPlanProgress;
  }

  if (confirmedAmount > 0) {
    return {
      submittedAmount,
      confirmedAmount,
      remainingAmount,
      status: PaymentPlanStatus.PARTIALLY_COLLECTED,
    } satisfies PaymentPlanProgress;
  }

  if (submittedAmount > 0) {
    return {
      submittedAmount,
      confirmedAmount,
      remainingAmount,
      status: PaymentPlanStatus.SUBMITTED,
    } satisfies PaymentPlanProgress;
  }

  return {
    submittedAmount,
    confirmedAmount,
    remainingAmount,
    status: PaymentPlanStatus.PENDING,
  } satisfies PaymentPlanProgress;
}

export function deriveCollectionTaskType(input: {
  subjectType: PaymentPlanSubjectType;
  stageType: PaymentPlanStageType;
  collectionChannel: PaymentCollectionChannel;
}) {
  if (input.subjectType === PaymentPlanSubjectType.FREIGHT) {
    return "FREIGHT_COLLECTION" as const;
  }

  if (input.collectionChannel === PaymentCollectionChannel.COD) {
    return "COD_COLLECTION" as const;
  }

  if (input.stageType === PaymentPlanStageType.BALANCE) {
    return "BALANCE_COLLECTION" as const;
  }

  return "GENERAL_COLLECTION" as const;
}

export function deriveSalesOrderPaymentSummary(
  plans: Array<{
    subjectType: PaymentPlanSubjectType;
    stageType: PaymentPlanStageType;
    collectionChannel: PaymentCollectionChannel;
    plannedAmount: number;
    submittedAmount: number;
    confirmedAmount: number;
    remainingAmount: number;
  }>,
) {
  return plans.reduce(
    (summary, plan) => {
      if (plan.subjectType !== PaymentPlanSubjectType.GOODS) {
        return summary;
      }

      summary.depositAmount = roundCurrency(
        summary.depositAmount +
          (plan.stageType === PaymentPlanStageType.DEPOSIT ? plan.plannedAmount : 0),
      );
      summary.collectedAmount = roundCurrency(summary.collectedAmount + plan.submittedAmount);
      summary.paidAmount = roundCurrency(summary.paidAmount + plan.confirmedAmount);
      summary.remainingAmount = roundCurrency(summary.remainingAmount + plan.remainingAmount);
      summary.codAmount = roundCurrency(
        summary.codAmount +
          (plan.collectionChannel === PaymentCollectionChannel.COD ? plan.plannedAmount : 0),
      );

      return summary;
    },
    {
      depositAmount: 0,
      collectedAmount: 0,
      paidAmount: 0,
      remainingAmount: 0,
      codAmount: 0,
    },
  );
}
