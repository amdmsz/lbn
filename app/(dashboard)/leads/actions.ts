"use server";

import {
  AssignmentType,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  LeadStatus,
  UserStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canAccessLeadModule,
  canManageLeadAssignments,
  getLeadScope,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  assignCustomerToSalesTx,
  getCustomerOwnershipActorContext,
} from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import { MAX_BATCH_ASSIGNMENT_SIZE } from "@/lib/leads/metadata";
import {
  buildLeadWhereInput,
  getLeadImportBatchLeadIds,
  parseLeadListFilters,
} from "@/lib/leads/queries";
import {
  findActiveRecycleEntriesByTargetIds,
  findActiveTargetIds,
} from "@/lib/recycle-bin/repository";
import { moveToRecycleBin } from "@/lib/recycle-bin/lifecycle";
import type {
  MoveToRecycleBinResult,
  RecycleGuardBlocker,
  RecycleReasonInputCode,
} from "@/lib/recycle-bin/types";

const leadRecycleReasonValues = [
  "mistaken_creation",
  "test_data",
  "duplicate",
  "no_longer_needed",
  "other",
] as const;

const assignLeadsSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  leadIds: z.array(z.string().trim().min(1)).default([]),
  toUserId: z.string().trim().min(1, "请选择要分配给哪位销售"),
  note: z.string().trim().max(500).optional(),
});

const batchMoveLeadsToRecycleBinSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  leadIds: z.array(z.string().trim().min(1)).default([]),
  reasonCode: z.enum(leadRecycleReasonValues).default("mistaken_creation"),
});

export type LeadRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: MoveToRecycleBinResult["status"];
};

export type LeadBatchRecycleBlockedReason = {
  code: string;
  label: string;
  count: number;
  description: string;
  group?: string;
  suggestedAction?: string;
};

export type LeadBatchRecycleActionResult = {
  status: "success" | "error";
  message: string;
  summary: {
    totalCount: number;
    createdCount: number;
    alreadyInRecycleBinCount: number;
    blockedCount: number;
  };
  blockedReasons: LeadBatchRecycleBlockedReason[];
};

async function getLeadActionActor() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("登录已失效，请重新登录后再试。");
  }

  return {
    id: session.user.id,
    role: session.user.role,
    permissionCodes: session.user.permissionCodes,
  };
}

function getLeadRecycleReasonCode(formData: FormData): RecycleReasonInputCode {
  const reasonCode = String(formData.get("reasonCode") ?? "");

  if (leadRecycleReasonValues.includes(reasonCode as RecycleReasonInputCode)) {
    return reasonCode as RecycleReasonInputCode;
  }

  return "mistaken_creation";
}

function buildLeadRecycleActionResult(
  result: MoveToRecycleBinResult,
): LeadRecycleActionResult {
  if (result.status === "created") {
    return {
      status: "success",
      message: "线索已移入回收站。",
      recycleStatus: result.status,
    };
  }

  if (result.status === "already_in_recycle_bin") {
    return {
      status: "success",
      message: "线索已在回收站中。",
      recycleStatus: result.status,
    };
  }

  return {
    status: "error",
    message: result.message,
    recycleStatus: result.status,
  };
}

function getFilterParamsFromFormData(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    status: String(formData.get("status") ?? ""),
    tagId: String(formData.get("tagId") ?? ""),
    view: String(formData.get("view") ?? ""),
    quick: String(formData.get("quick") ?? ""),
    importBatchId: String(formData.get("importBatchId") ?? ""),
    assignedOwnerId: String(formData.get("assignedOwnerId") ?? ""),
    ownerId: String(formData.get("ownerId") ?? ""),
    createdFrom: String(formData.get("createdFrom") ?? ""),
    createdTo: String(formData.get("createdTo") ?? ""),
    page: String(formData.get("page") ?? "1"),
    pageSize: String(formData.get("pageSize") ?? ""),
  };
}

function buildLeadBatchRecycleErrorResult(
  message: string,
): LeadBatchRecycleActionResult {
  return {
    status: "error",
    message,
    summary: {
      totalCount: 0,
      createdCount: 0,
      alreadyInRecycleBinCount: 0,
      blockedCount: 0,
    },
    blockedReasons: [],
  };
}

function buildLeadBatchRecycleMessage(summary: {
  createdCount: number;
  alreadyInRecycleBinCount: number;
  blockedCount: number;
}) {
  if (summary.createdCount > 0 && summary.blockedCount === 0) {
    return "已完成批量移入回收站。";
  }

  if (summary.createdCount > 0 || summary.alreadyInRecycleBinCount > 0) {
    return "已部分完成批量移入回收站。";
  }

  return "所选线索均未移入回收站。";
}

function groupLeadBatchRecycleBlocker(
  groupedReasons: Map<string, LeadBatchRecycleBlockedReason>,
  blocker: Pick<
    RecycleGuardBlocker,
    "code" | "group" | "suggestedAction" | "name" | "description"
  >,
) {
  const blockerCode = blocker.code?.trim() || blocker.name;
  const existingBlocker = groupedReasons.get(blockerCode);

  if (existingBlocker) {
    existingBlocker.count += 1;
    return;
  }

  groupedReasons.set(blockerCode, {
    code: blockerCode,
    label: blocker.name,
    count: 1,
    description: blocker.description,
    group: blocker.group,
    suggestedAction: blocker.suggestedAction,
  });
}

function collectLeadBatchRecycleBlockedReasons(
  results: MoveToRecycleBinResult[],
): LeadBatchRecycleBlockedReason[] {
  const groupedReasons = new Map<string, LeadBatchRecycleBlockedReason>();

  for (const result of results) {
    if (result.status !== "blocked") {
      continue;
    }

    if (result.guard.blockers.length === 0) {
      groupLeadBatchRecycleBlocker(groupedReasons, {
        code: "blocked_without_reason",
        name: "其他阻断",
        description: result.message,
      });
      continue;
    }

    for (const blocker of result.guard.blockers) {
      groupLeadBatchRecycleBlocker(groupedReasons, blocker);
    }
  }

  return [...groupedReasons.values()].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
}

async function resolveBatchRecycleLeadIds(input: {
  actor: Awaited<ReturnType<typeof getLeadActionActor>>;
  selectionMode: "manual" | "filtered";
  formData: FormData;
  leadIds: string[];
}): Promise<string[] | LeadBatchRecycleActionResult> {
  if (input.selectionMode === "filtered") {
    const filters = parseLeadListFilters(getFilterParamsFromFormData(input.formData));

    if (filters.view !== "unassigned") {
      return buildLeadBatchRecycleErrorResult(
        "当前只支持未分配视图批量移入回收站。",
      );
    }

    const [importedLeadIds, activeLeadIds] = await Promise.all([
      filters.importBatchId
        ? getLeadImportBatchLeadIds(filters.importBatchId)
        : Promise.resolve([] as string[]),
      findActiveTargetIds(prisma, "LEAD"),
    ]);
    const where = buildLeadWhereInput(
      {
        id: input.actor.id,
        role: input.actor.role,
      },
      {
        ...filters,
        view: "unassigned",
        assignedOwnerId: "",
      },
      importedLeadIds,
      activeLeadIds,
    );
    const matchedLeadIds = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_BATCH_ASSIGNMENT_SIZE + 1,
      select: {
        id: true,
      },
    });

    if (matchedLeadIds.length === 0) {
      return buildLeadBatchRecycleErrorResult(
        "当前筛选条件下没有可移入回收站的线索。",
      );
    }

    if (matchedLeadIds.length > MAX_BATCH_ASSIGNMENT_SIZE) {
      return buildLeadBatchRecycleErrorResult(
        `当前筛选结果超过 ${MAX_BATCH_ASSIGNMENT_SIZE} 条，请先缩小范围后再批量移入回收站。`,
      );
    }

    return matchedLeadIds.map((lead) => lead.id);
  }

  const uniqueLeadIds = [...new Set(input.leadIds)];

  if (uniqueLeadIds.length === 0) {
    return buildLeadBatchRecycleErrorResult("请先选择线索。");
  }

  const scope = getLeadScope(input.actor.role, input.actor.id);

  if (!scope) {
    return buildLeadBatchRecycleErrorResult("当前角色没有访问线索数据的权限。");
  }

  const visibleLeadIds = await prisma.lead.findMany({
    where: {
      id: {
        in: uniqueLeadIds,
      },
      ownerId: null,
      ...scope,
    },
    select: {
      id: true,
    },
  });

  if (visibleLeadIds.length !== uniqueLeadIds.length) {
    return buildLeadBatchRecycleErrorResult(
      "部分线索已不在当前未分配视图，请刷新后重试。",
    );
  }

  return uniqueLeadIds;
}

export async function batchAssignLeadsAction(
  _previousState: {
    status: "idle" | "success" | "error";
    message: string;
    assignedCount: number;
    skippedCount: number;
  },
  formData: FormData,
): Promise<{
  status: "idle" | "success" | "error";
  message: string;
  assignedCount: number;
  skippedCount: number;
}> {
  const session = await auth();

  if (!session?.user) {
    return {
      status: "error",
      message: "登录已失效，请重新登录后再试。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  if (!canManageLeadAssignments(session.user.role)) {
    return {
      status: "error",
      message: "当前角色没有批量分配线索的权限。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const parsed = assignLeadsSchema.safeParse({
    selectionMode: String(formData.get("selectionMode") ?? "manual"),
    leadIds: formData.getAll("leadIds").map((value) => String(value)),
    toUserId: String(formData.get("toUserId") ?? ""),
    note: String(formData.get("note") ?? ""),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量分配。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const scope = getLeadScope(session.user.role, session.user.id);

  if (!scope) {
    return {
      status: "error",
      message: "当前角色没有访问线索数据的权限。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  let uniqueLeadIds: string[] = [];

  if (parsed.data.selectionMode === "filtered") {
    const filters = parseLeadListFilters(getFilterParamsFromFormData(formData));
    const [importedLeadIds, activeLeadIds] = await Promise.all([
      filters.importBatchId
        ? getLeadImportBatchLeadIds(filters.importBatchId)
        : Promise.resolve([] as string[]),
      findActiveTargetIds(prisma, "LEAD"),
    ]);
    const where = buildLeadWhereInput(
      {
        id: session.user.id,
        role: session.user.role,
      },
      filters,
      importedLeadIds,
      activeLeadIds,
    );

    const matchedLeadIds = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_BATCH_ASSIGNMENT_SIZE + 1,
      select: {
        id: true,
      },
    });

    if (matchedLeadIds.length === 0) {
      return {
        status: "error",
        message: "当前筛选条件下没有可分配的线索。",
        assignedCount: 0,
        skippedCount: 0,
      };
    }

    if (matchedLeadIds.length > MAX_BATCH_ASSIGNMENT_SIZE) {
      return {
        status: "error",
        message: `当前筛选结果超过 ${MAX_BATCH_ASSIGNMENT_SIZE} 条，请先缩小范围后再批量分配。`,
        assignedCount: 0,
        skippedCount: 0,
      };
    }

    uniqueLeadIds = matchedLeadIds.map((lead) => lead.id);
  } else {
    uniqueLeadIds = [...new Set(parsed.data.leadIds)];

    if (uniqueLeadIds.length === 0) {
      return {
        status: "error",
        message: "请先选择线索。",
        assignedCount: 0,
        skippedCount: 0,
      };
    }
  }

  if (uniqueLeadIds.length > MAX_BATCH_ASSIGNMENT_SIZE) {
    return {
      status: "error",
      message: `单次最多批量分配 ${MAX_BATCH_ASSIGNMENT_SIZE} 条线索。`,
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const targetSales = await prisma.user.findFirst({
    where: {
      id: parsed.data.toUserId,
      userStatus: UserStatus.ACTIVE,
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
    return {
      status: "error",
      message: "目标销售不存在，或该账号当前不可用。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const leads = await prisma.lead.findMany({
    where: {
      id: {
        in: uniqueLeadIds,
      },
      ...scope,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      province: true,
      city: true,
      district: true,
      address: true,
      remark: true,
      ownerId: true,
      customerId: true,
      status: true,
    },
  });

  if (leads.length !== uniqueLeadIds.length) {
    return {
      status: "error",
      message: "部分线索不存在，或你没有权限操作这些线索。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const activeRecycleEntries = await findActiveRecycleEntriesByTargetIds(
    prisma,
    "LEAD",
    uniqueLeadIds,
  );

  if (activeRecycleEntries.length > 0) {
    return {
      status: "error",
      message:
        activeRecycleEntries.length === 1
          ? "所选线索已在回收站中，不能继续分配。"
          : `所选线索中有 ${activeRecycleEntries.length} 条已在回收站中，不能继续分配。`,
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  const updatedCustomerIds = new Set<string>();
  let assignedCount = 0;
  let skippedCount = 0;
  const ownershipActor = await getCustomerOwnershipActorContext(session.user.id);

  try {
    await prisma.$transaction(async (tx) => {
      const activeEntriesInTx = await findActiveRecycleEntriesByTargetIds(
        tx,
        "LEAD",
        uniqueLeadIds,
      );

      if (activeEntriesInTx.length > 0) {
        throw new Error(
          activeEntriesInTx.length === 1
            ? "所选线索已在回收站中，不能继续分配。"
            : `所选线索中有 ${activeEntriesInTx.length} 条已在回收站中，不能继续分配。`,
        );
      }

      for (const lead of leads) {
      let changed = false;
      const nextStatus =
        lead.status === LeadStatus.NEW ? LeadStatus.ASSIGNED : lead.status;

      let customer =
        lead.customerId !== null
          ? await tx.customer.findUnique({
              where: { id: lead.customerId },
              select: {
                id: true,
                name: true,
                phone: true,
                ownerId: true,
              },
            })
          : await tx.customer.findUnique({
              where: { phone: lead.phone },
              select: {
                id: true,
                name: true,
                phone: true,
                ownerId: true,
              },
            });

      let customerCreatedOnAssignment = false;
      const leadNeedsCustomerLink = lead.customerId === null && customer !== null;

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: lead.name?.trim() || lead.phone,
            phone: lead.phone,
            province: lead.province,
            city: lead.city,
            district: lead.district,
            address: lead.address,
            remark: lead.remark,
            ownershipMode: CustomerOwnershipMode.PUBLIC,
            publicPoolTeamId: targetSales.teamId,
          },
          select: {
            id: true,
            name: true,
            phone: true,
            ownerId: true,
          },
        });

        customerCreatedOnAssignment = true;
        updatedCustomerIds.add(customer.id);
        changed = true;

        await tx.operationLog.create({
          data: {
            actorId: session.user.id,
            module: "CUSTOMER",
            action: "customer.created_from_lead_assignment",
            targetType: "CUSTOMER",
            targetId: customer.id,
            description: `分配线索时自动创建客户 ${customer.name} (${customer.phone}) 并承接给 ${targetSales.name} (@${targetSales.username})`,
            afterData: {
              ownerId: null,
              sourceLeadId: lead.id,
            },
          },
        });
      }

      const nextLeadData: {
        ownerId?: string;
        status?: LeadStatus;
        customerId?: string;
      } = {};

      if (lead.ownerId !== targetSales.id) {
        nextLeadData.ownerId = targetSales.id;
        nextLeadData.status = nextStatus;
      }

      if (lead.customerId !== customer.id) {
        nextLeadData.customerId = customer.id;
      }

      if (Object.keys(nextLeadData).length > 0) {
        await tx.lead.update({
          where: { id: lead.id },
          data: nextLeadData,
        });

        changed = true;
      }

      if (lead.ownerId !== targetSales.id) {
        await tx.leadAssignment.create({
          data: {
            leadId: lead.id,
            fromUserId: lead.ownerId,
            toUserId: targetSales.id,
            assignedById: session.user.id,
            assignmentType: AssignmentType.BATCH,
            note: parsed.data.note || null,
          },
        });

        await tx.operationLog.create({
          data: {
            actorId: session.user.id,
            module: "ASSIGNMENT",
            action: "lead.batch_assign",
            targetType: "LEAD",
            targetId: lead.id,
            description: `将线索分配给 ${targetSales.name} (@${targetSales.username})`,
            beforeData: {
              ownerId: lead.ownerId,
              status: lead.status,
              customerId: lead.customerId,
            },
            afterData: {
              ownerId: targetSales.id,
              status: nextStatus,
              customerId: customer.id,
              assignmentType: AssignmentType.BATCH,
            },
          },
        });

        assignedCount += 1;
      }

      if (lead.customerId !== customer.id) {
        await tx.operationLog.create({
          data: {
            actorId: session.user.id,
            module: "LEAD",
            action: customerCreatedOnAssignment
              ? "lead.customer_created_on_assignment"
              : "lead.customer_linked_on_assignment",
            targetType: "LEAD",
            targetId: lead.id,
            description: customerCreatedOnAssignment
              ? `分配时自动创建并关联客户 ${customer.name} (${customer.phone})`
              : `分配时自动关联已有客户 ${customer.name} (${customer.phone})`,
            beforeData: {
              customerId: lead.customerId,
            },
            afterData: {
              customerId: customer.id,
            },
          },
        });
      }

      if (customer.ownerId !== targetSales.id) {
        await assignCustomerToSalesTx(tx, {
          actor: ownershipActor,
          targetSales,
          customerId: customer.id,
          reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
          note: `Lead assignment sync from ${lead.name?.trim() || lead.phone}`,
          fallbackPublicPoolTeamId: targetSales.teamId ?? ownershipActor.teamId,
        });

        await tx.operationLog.create({
          data: {
            actorId: session.user.id,
            module: "CUSTOMER",
            action: customer.ownerId
              ? "customer.owner_transferred_from_lead_assignment"
              : "customer.owner_assumed_from_lead_assignment",
            targetType: "CUSTOMER",
            targetId: customer.id,
            description: `客户承接人同步为 ${targetSales.name} (@${targetSales.username})，来源线索 ${lead.name?.trim() || lead.phone}`,
            beforeData: {
              ownerId: customer.ownerId,
              sourceLeadId: lead.id,
              sourceLeadOwnerId: lead.ownerId,
            },
            afterData: {
              ownerId: targetSales.id,
              sourceLeadId: lead.id,
              sourceLeadOwnerId: targetSales.id,
            },
          },
        });

        updatedCustomerIds.add(customer.id);
        changed = true;
      } else if (leadNeedsCustomerLink || customerCreatedOnAssignment) {
        updatedCustomerIds.add(customer.id);
      }

        if (!changed) {
          skippedCount += 1;
        }
      }
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "批量分配失败，请稍后重试。",
      assignedCount: 0,
      skippedCount: 0,
    };
  }

  if (assignedCount === 0 && updatedCustomerIds.size === 0) {
    return {
      status: "error",
      message: "所选线索及其关联客户当前负责人均已是目标销售，无需重复分配。",
      assignedCount: 0,
      skippedCount,
    };
  }

  revalidatePath("/leads");
  revalidatePath("/customers");
  revalidatePath("/dashboard");

  for (const lead of leads) {
    revalidatePath(`/leads/${lead.id}`);
  }

  for (const customerId of updatedCustomerIds) {
    revalidatePath(`/customers/${customerId}`);
  }

  return {
    status: "success",
    message: `已完成 ${assignedCount} 条线索分配，并同步 / 补建 ${updatedCustomerIds.size} 位客户承接给 ${targetSales.name}。`,
    assignedCount,
    skippedCount,
  };
}

export async function moveLeadToRecycleBinAction(
  formData: FormData,
): Promise<LeadRecycleActionResult> {
  try {
    const actor = await getLeadActionActor();

    if (!canAccessLeadModule(actor.role)) {
      return {
        status: "error",
        message: "当前角色没有处理线索回收站动作的权限。",
      };
    }

    const leadId = String(formData.get("id") ?? "").trim();

    if (!leadId) {
      return {
        status: "error",
        message: "线索参数不完整，请刷新后重试。",
      };
    }

    const result = await moveToRecycleBin(actor, {
      targetType: "LEAD",
      targetId: leadId,
      reasonCode: getLeadRecycleReasonCode(formData),
      reasonText: String(formData.get("reasonText") ?? "").trim(),
    });

    if (result.status !== "blocked") {
      revalidatePath("/leads");
      revalidatePath(`/leads/${leadId}`);
      revalidatePath("/recycle-bin");
    }

    return buildLeadRecycleActionResult(result);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "移入回收站失败，请稍后重试。",
    };
  }
}

export async function batchMoveLeadsToRecycleBinAction(
  formData: FormData,
): Promise<LeadBatchRecycleActionResult> {
  try {
    const actor = await getLeadActionActor();

    if (!canAccessLeadModule(actor.role) || !canManageLeadAssignments(actor.role)) {
      return buildLeadBatchRecycleErrorResult(
        "当前角色没有批量移入回收站的权限。",
      );
    }

    const parsed = batchMoveLeadsToRecycleBinSchema.safeParse({
      selectionMode: String(formData.get("selectionMode") ?? "manual"),
      leadIds: formData.getAll("leadIds").map((value) => String(value).trim()),
      reasonCode: getLeadRecycleReasonCode(formData),
    });

    if (!parsed.success) {
      return buildLeadBatchRecycleErrorResult(
        parsed.error.issues[0]?.message ?? "提交数据不完整，无法执行批量移入回收站。",
      );
    }

    const resolvedLeadIds = await resolveBatchRecycleLeadIds({
      actor,
      selectionMode: parsed.data.selectionMode,
      formData,
      leadIds: parsed.data.leadIds,
    });

    if (!Array.isArray(resolvedLeadIds)) {
      return resolvedLeadIds;
    }

    if (resolvedLeadIds.length > MAX_BATCH_ASSIGNMENT_SIZE) {
      return buildLeadBatchRecycleErrorResult(
        `单次最多批量移入回收站 ${MAX_BATCH_ASSIGNMENT_SIZE} 条线索。`,
      );
    }

    const results: MoveToRecycleBinResult[] = [];

    for (const leadId of resolvedLeadIds) {
      results.push(
        await moveToRecycleBin(actor, {
          targetType: "LEAD",
          targetId: leadId,
          reasonCode: parsed.data.reasonCode,
        }),
      );
    }

    const summary = {
      totalCount: resolvedLeadIds.length,
      createdCount: results.filter((result) => result.status === "created").length,
      alreadyInRecycleBinCount: results.filter(
        (result) => result.status === "already_in_recycle_bin",
      ).length,
      blockedCount: results.filter((result) => result.status === "blocked").length,
    };
    const blockedReasons = collectLeadBatchRecycleBlockedReasons(results);

    if (summary.createdCount > 0 || summary.alreadyInRecycleBinCount > 0) {
      revalidatePath("/leads");
      revalidatePath("/recycle-bin");
    }

    return {
      status:
        summary.createdCount > 0 || summary.alreadyInRecycleBinCount > 0
          ? "success"
          : "error",
      message: buildLeadBatchRecycleMessage(summary),
      summary,
      blockedReasons,
    };
  } catch (error) {
    return buildLeadBatchRecycleErrorResult(
      error instanceof Error ? error.message : "批量移入回收站失败，请稍后重试。",
    );
  }
}
