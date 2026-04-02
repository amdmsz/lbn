"use server";

import { AssignmentType, LeadStatus, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageLeadAssignments, getLeadScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { MAX_BATCH_ASSIGNMENT_SIZE } from "@/lib/leads/metadata";
import { buildLeadWhereInput, parseLeadListFilters } from "@/lib/leads/queries";

const assignLeadsSchema = z.object({
  selectionMode: z.enum(["manual", "filtered"]).default("manual"),
  leadIds: z.array(z.string().trim().min(1)).default([]),
  toUserId: z.string().trim().min(1, "请选择要分配给哪位销售"),
  note: z.string().trim().max(500).optional(),
});

function getFilterParamsFromFormData(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    status: String(formData.get("status") ?? ""),
    tagId: String(formData.get("tagId") ?? ""),
    ownerId: String(formData.get("ownerId") ?? ""),
    createdFrom: String(formData.get("createdFrom") ?? ""),
    createdTo: String(formData.get("createdTo") ?? ""),
    page: String(formData.get("page") ?? "1"),
    pageSize: String(formData.get("pageSize") ?? ""),
  };
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
    const where = buildLeadWhereInput(
      {
        id: session.user.id,
        role: session.user.role,
      },
      filters,
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

  const updatedCustomerIds = new Set<string>();
  let assignedCount = 0;
  let skippedCount = 0;

  await prisma.$transaction(async (tx) => {
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
            ownerId: targetSales.id,
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
              ownerId: targetSales.id,
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
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            ownerId: targetSales.id,
          },
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
