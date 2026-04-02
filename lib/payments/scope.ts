import type { Prisma, RoleCode } from "@prisma/client";

export type PaymentScopedViewer = {
  id: string;
  role: RoleCode;
};

function buildSupervisorTeamScope(teamId: string | null) {
  return teamId
    ? { teamId }
    : { id: "__missing_payment_team_scope__" };
}

function buildSalesPaymentPlanScope(userId: string): Prisma.PaymentPlanWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { customer: { ownerId: userId } },
      { salesOrder: { ownerId: userId } },
      { salesOrder: { customer: { ownerId: userId } } },
      { giftRecord: { salesId: userId } },
      { giftRecord: { customer: { ownerId: userId } } },
    ],
  };
}

function buildSupervisorPaymentPlanScope(teamId: string | null): Prisma.PaymentPlanWhereInput {
  const teamScope = buildSupervisorTeamScope(teamId);

  return {
    OR: [
      { owner: { is: teamScope } },
      { customer: { owner: { is: teamScope } } },
      { salesOrder: { owner: { is: teamScope } } },
      { salesOrder: { customer: { owner: { is: teamScope } } } },
      { giftRecord: { sales: { is: teamScope } } },
      { giftRecord: { customer: { owner: { is: teamScope } } } },
    ],
  };
}

function buildSalesPaymentRecordScope(userId: string): Prisma.PaymentRecordWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { customer: { ownerId: userId } },
      { salesOrder: { ownerId: userId } },
      { salesOrder: { customer: { ownerId: userId } } },
      { giftRecord: { salesId: userId } },
      { giftRecord: { customer: { ownerId: userId } } },
      { submittedById: userId },
    ],
  };
}

function buildSupervisorPaymentRecordScope(
  teamId: string | null,
): Prisma.PaymentRecordWhereInput {
  const teamScope = buildSupervisorTeamScope(teamId);

  return {
    OR: [
      { owner: { is: teamScope } },
      { customer: { owner: { is: teamScope } } },
      { salesOrder: { owner: { is: teamScope } } },
      { salesOrder: { customer: { owner: { is: teamScope } } } },
      { giftRecord: { sales: { is: teamScope } } },
      { giftRecord: { customer: { owner: { is: teamScope } } } },
      { submittedBy: { is: teamScope } },
      { confirmedBy: { is: teamScope } },
    ],
  };
}

function buildSalesCollectionTaskScope(userId: string): Prisma.CollectionTaskWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { customer: { ownerId: userId } },
      { salesOrder: { ownerId: userId } },
      { salesOrder: { customer: { ownerId: userId } } },
      { giftRecord: { salesId: userId } },
      { giftRecord: { customer: { ownerId: userId } } },
    ],
  };
}

function buildSupervisorCollectionTaskScope(
  teamId: string | null,
): Prisma.CollectionTaskWhereInput {
  const teamScope = buildSupervisorTeamScope(teamId);

  return {
    OR: [
      { owner: { is: teamScope } },
      { customer: { owner: { is: teamScope } } },
      { salesOrder: { owner: { is: teamScope } } },
      { salesOrder: { customer: { owner: { is: teamScope } } } },
      { giftRecord: { sales: { is: teamScope } } },
      { giftRecord: { customer: { owner: { is: teamScope } } } },
    ],
  };
}

export function buildPaymentPlanScope(
  viewer: PaymentScopedViewer,
  teamId: string | null,
): Prisma.PaymentPlanWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return buildSupervisorPaymentPlanScope(teamId);
  }

  if (viewer.role === "SALES") {
    return buildSalesPaymentPlanScope(viewer.id);
  }

  return { id: "__forbidden_payment_plan_scope__" };
}

export function buildPaymentRecordScope(
  viewer: PaymentScopedViewer,
  teamId: string | null,
): Prisma.PaymentRecordWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return buildSupervisorPaymentRecordScope(teamId);
  }

  if (viewer.role === "SALES") {
    return buildSalesPaymentRecordScope(viewer.id);
  }

  return { id: "__forbidden_payment_record_scope__" };
}

export function buildCollectionTaskScope(
  viewer: PaymentScopedViewer,
  teamId: string | null,
): Prisma.CollectionTaskWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return buildSupervisorCollectionTaskScope(teamId);
  }

  if (viewer.role === "SALES") {
    return buildSalesCollectionTaskScope(viewer.id);
  }

  return { id: "__forbidden_collection_task_scope__" };
}
