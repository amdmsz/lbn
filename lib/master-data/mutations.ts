import {
  OperationModule,
  OperationTargetType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canManageMasterData,
  canUseCustomerTags,
  canUseLeadTags,
  getCustomerScope,
  getLeadScope,
} from "@/lib/auth/access";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import { isValidHexColor } from "@/lib/master-data/metadata";
import { findActiveRecycleEntry } from "@/lib/recycle-bin/repository";

type Actor = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

const codeSchema = z
  .string()
  .trim()
  .min(1, "编码不能为空")
  .max(50, "编码不能超过 50 个字符");

const sortOrderSchema = z.coerce
  .number()
  .int()
  .min(0, "排序值不能小于 0")
  .max(9999, "排序值不能超过 9999");

const baseSchema = z.object({
  id: z.string().trim().default(""),
  code: codeSchema,
  name: z.string().trim().min(1, "名称不能为空").max(100, "名称不能超过 100 个字符"),
  description: z
    .string()
    .trim()
    .max(1000, "描述不能超过 1000 个字符")
    .default(""),
  sortOrder: sortOrderSchema.default(0),
});

const tagCategorySchema = baseSchema.extend({
  groupId: z.string().trim().min(1, "请选择所属标签组"),
});

const tagSchema = baseSchema.extend({
  groupId: z.string().trim().min(1, "请选择所属标签组"),
  categoryId: z.string().trim().default(""),
  color: z.string().trim().max(20, "颜色值不能超过 20 个字符").default(""),
});

const dictionaryTypeSchema = baseSchema.extend({
  categoryId: z.string().trim().default(""),
});

const dictionaryItemSchema = z.object({
  id: z.string().trim().default(""),
  typeId: z.string().trim().min(1, "请选择字典类型"),
  code: codeSchema,
  label: z.string().trim().min(1, "名称不能为空").max(100, "名称不能超过 100 个字符"),
  value: z.string().trim().min(1, "值不能为空").max(200, "值不能超过 200 个字符"),
  description: z
    .string()
    .trim()
    .max(1000, "描述不能超过 1000 个字符")
    .default(""),
  sortOrder: sortOrderSchema.default(0),
});

function assertMasterDataManager(role: RoleCode) {
  if (!canManageMasterData(role)) {
    throw new Error("当前角色无权维护标签和字典主数据。");
  }
}

function normalizeCode(code: string) {
  return code.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function normalizeOptional(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function normalizeColor(value: string) {
  const next = value.trim();
  if (!next) {
    return null;
  }

  if (!isValidHexColor(next)) {
    throw new Error("颜色必须是合法的十六进制值，例如 #A65A2A。");
  }

  return next.toUpperCase();
}

async function createOperationLog(
  tx: Prisma.TransactionClient,
  data: Prisma.OperationLogCreateInput,
) {
  await tx.operationLog.create({ data });
}

async function assertLeadNotInRecycleBin(
  tx: Prisma.TransactionClient,
  leadId: string,
) {
  const activeRecycleEntry = await findActiveRecycleEntry(tx, "LEAD", leadId);

  if (activeRecycleEntry) {
    throw new Error("该线索已在回收站中，不能继续修改标签。");
  }
}

async function toggleIsActive<T extends { id: string; isActive: boolean }>(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: {
    getRecord: () => Promise<(T & { name?: string | null; label?: string | null }) | null>;
    updateRecord: (nextIsActive: boolean) => Promise<
      T & { name?: string | null; label?: string | null }
    >;
    action: string;
    targetType: OperationTargetType;
    label: string;
  },
) {
  const existing = await input.getRecord();

  if (!existing) {
    throw new Error(`${input.label}不存在。`);
  }

  const updated = await input.updateRecord(!existing.isActive);
  const displayName = updated.name ?? updated.label ?? input.label;

  await createOperationLog(tx, {
    actor: { connect: { id: actor.id } },
    module: OperationModule.MASTER_DATA,
    action: input.action,
    targetType: input.targetType,
    targetId: updated.id,
    description: `${updated.isActive ? "启用" : "停用"}${input.label}：${displayName}`,
    beforeData: { isActive: existing.isActive },
    afterData: { isActive: updated.isActive },
  });

  return updated;
}

export async function upsertTagGroup(actor: Actor, rawInput: z.input<typeof baseSchema>) {
  assertMasterDataManager(actor.role);
  const parsed = baseSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const payload = {
      code: normalizeCode(parsed.code),
      name: parsed.name,
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.tagGroup.findUnique({ where: { id: parsed.id } });
      if (!existing) {
        throw new Error("标签组不存在。");
      }

      const updated = await tx.tagGroup.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "tag_group.updated",
        targetType: OperationTargetType.TAG_GROUP,
        targetId: updated.id,
        description: `更新标签组：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.tagGroup.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "tag_group.created",
      targetType: OperationTargetType.TAG_GROUP,
      targetId: created.id,
      description: `创建标签组：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleTagGroup(actor: Actor, tagGroupId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () => tx.tagGroup.findUnique({ where: { id: tagGroupId } }),
      updateRecord: (nextIsActive) =>
        tx.tagGroup.update({
          where: { id: tagGroupId },
          data: { isActive: nextIsActive },
        }),
      action: "tag_group.toggled",
      targetType: OperationTargetType.TAG_GROUP,
      label: "标签组",
    }),
  );
}

export async function upsertTagCategory(
  actor: Actor,
  rawInput: z.input<typeof tagCategorySchema>,
) {
  assertMasterDataManager(actor.role);
  const parsed = tagCategorySchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const group = await tx.tagGroup.findUnique({
      where: { id: parsed.groupId },
      select: { id: true, name: true },
    });

    if (!group) {
      throw new Error("所属标签组不存在。");
    }

    const payload = {
      groupId: parsed.groupId,
      code: normalizeCode(parsed.code),
      name: parsed.name,
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.tagCategory.findUnique({ where: { id: parsed.id } });
      if (!existing) {
        throw new Error("标签分类不存在。");
      }

      const updated = await tx.tagCategory.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "tag_category.updated",
        targetType: OperationTargetType.TAG_CATEGORY,
        targetId: updated.id,
        description: `更新标签分类：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.tagCategory.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "tag_category.created",
      targetType: OperationTargetType.TAG_CATEGORY,
      targetId: created.id,
      description: `创建标签分类：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleTagCategory(actor: Actor, tagCategoryId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () => tx.tagCategory.findUnique({ where: { id: tagCategoryId } }),
      updateRecord: (nextIsActive) =>
        tx.tagCategory.update({
          where: { id: tagCategoryId },
          data: { isActive: nextIsActive },
        }),
      action: "tag_category.toggled",
      targetType: OperationTargetType.TAG_CATEGORY,
      label: "标签分类",
    }),
  );
}

export async function upsertTag(actor: Actor, rawInput: z.input<typeof tagSchema>) {
  assertMasterDataManager(actor.role);
  const parsed = tagSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const group = await tx.tagGroup.findUnique({
      where: { id: parsed.groupId },
      select: { id: true },
    });

    if (!group) {
      throw new Error("所属标签组不存在。");
    }

    if (parsed.categoryId) {
      const category = await tx.tagCategory.findUnique({
        where: { id: parsed.categoryId },
        select: { id: true, groupId: true },
      });

      if (!category) {
        throw new Error("所属标签分类不存在。");
      }

      if (category.groupId !== parsed.groupId) {
        throw new Error("标签分类与标签组不匹配。");
      }
    }

    const payload = {
      groupId: parsed.groupId,
      categoryId: parsed.categoryId || null,
      code: normalizeCode(parsed.code),
      name: parsed.name,
      color: normalizeColor(parsed.color),
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.tag.findUnique({ where: { id: parsed.id } });
      if (!existing) {
        throw new Error("标签不存在。");
      }

      const updated = await tx.tag.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "tag.updated",
        targetType: OperationTargetType.TAG,
        targetId: updated.id,
        description: `更新标签：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.tag.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "tag.created",
      targetType: OperationTargetType.TAG,
      targetId: created.id,
      description: `创建标签：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleTag(actor: Actor, tagId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () => tx.tag.findUnique({ where: { id: tagId } }),
      updateRecord: (nextIsActive) =>
        tx.tag.update({
          where: { id: tagId },
          data: { isActive: nextIsActive },
        }),
      action: "tag.toggled",
      targetType: OperationTargetType.TAG,
      label: "标签",
    }),
  );
}

export async function upsertCategory(actor: Actor, rawInput: z.input<typeof baseSchema>) {
  assertMasterDataManager(actor.role);
  const parsed = baseSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const payload = {
      code: normalizeCode(parsed.code),
      name: parsed.name,
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.category.findUnique({ where: { id: parsed.id } });
      if (!existing) {
        throw new Error("分类不存在。");
      }

      const updated = await tx.category.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "category.updated",
        targetType: OperationTargetType.CATEGORY,
        targetId: updated.id,
        description: `更新分类：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.category.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "category.created",
      targetType: OperationTargetType.CATEGORY,
      targetId: created.id,
      description: `创建分类：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleCategory(actor: Actor, categoryId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () => tx.category.findUnique({ where: { id: categoryId } }),
      updateRecord: (nextIsActive) =>
        tx.category.update({
          where: { id: categoryId },
          data: { isActive: nextIsActive },
        }),
      action: "category.toggled",
      targetType: OperationTargetType.CATEGORY,
      label: "分类",
    }),
  );
}

export async function upsertDictionaryType(
  actor: Actor,
  rawInput: z.input<typeof dictionaryTypeSchema>,
) {
  assertMasterDataManager(actor.role);
  const parsed = dictionaryTypeSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    if (parsed.categoryId) {
      const category = await tx.category.findUnique({
        where: { id: parsed.categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new Error("所属分类不存在。");
      }
    }

    const payload = {
      categoryId: parsed.categoryId || null,
      code: normalizeCode(parsed.code),
      name: parsed.name,
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.dictionaryType.findUnique({
        where: { id: parsed.id },
      });
      if (!existing) {
        throw new Error("字典类型不存在。");
      }

      const updated = await tx.dictionaryType.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "dictionary_type.updated",
        targetType: OperationTargetType.DICTIONARY_TYPE,
        targetId: updated.id,
        description: `更新字典类型：${updated.name}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.dictionaryType.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "dictionary_type.created",
      targetType: OperationTargetType.DICTIONARY_TYPE,
      targetId: created.id,
      description: `创建字典类型：${created.name}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleDictionaryType(actor: Actor, dictionaryTypeId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () =>
        tx.dictionaryType.findUnique({ where: { id: dictionaryTypeId } }),
      updateRecord: (nextIsActive) =>
        tx.dictionaryType.update({
          where: { id: dictionaryTypeId },
          data: { isActive: nextIsActive },
        }),
      action: "dictionary_type.toggled",
      targetType: OperationTargetType.DICTIONARY_TYPE,
      label: "字典类型",
    }),
  );
}

export async function upsertDictionaryItem(
  actor: Actor,
  rawInput: z.input<typeof dictionaryItemSchema>,
) {
  assertMasterDataManager(actor.role);
  const parsed = dictionaryItemSchema.parse(rawInput);

  return prisma.$transaction(async (tx) => {
    const type = await tx.dictionaryType.findUnique({
      where: { id: parsed.typeId },
      select: { id: true },
    });

    if (!type) {
      throw new Error("所属字典类型不存在。");
    }

    const payload = {
      typeId: parsed.typeId,
      code: normalizeCode(parsed.code),
      label: parsed.label,
      value: parsed.value,
      description: normalizeOptional(parsed.description),
      sortOrder: parsed.sortOrder,
    };

    if (parsed.id) {
      const existing = await tx.dictionaryItem.findUnique({
        where: { id: parsed.id },
      });
      if (!existing) {
        throw new Error("字典项不存在。");
      }

      const updated = await tx.dictionaryItem.update({
        where: { id: parsed.id },
        data: payload,
      });

      await createOperationLog(tx, {
        actor: { connect: { id: actor.id } },
        module: OperationModule.MASTER_DATA,
        action: "dictionary_item.updated",
        targetType: OperationTargetType.DICTIONARY_ITEM,
        targetId: updated.id,
        description: `更新字典项：${updated.label}`,
        beforeData: existing,
        afterData: updated,
      });

      return updated;
    }

    const created = await tx.dictionaryItem.create({ data: payload });
    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.MASTER_DATA,
      action: "dictionary_item.created",
      targetType: OperationTargetType.DICTIONARY_ITEM,
      targetId: created.id,
      description: `创建字典项：${created.label}`,
      afterData: created,
    });

    return created;
  });
}

export async function toggleDictionaryItem(actor: Actor, dictionaryItemId: string) {
  assertMasterDataManager(actor.role);
  return prisma.$transaction((tx) =>
    toggleIsActive(tx, actor, {
      getRecord: () =>
        tx.dictionaryItem.findUnique({ where: { id: dictionaryItemId } }),
      updateRecord: (nextIsActive) =>
        tx.dictionaryItem.update({
          where: { id: dictionaryItemId },
          data: { isActive: nextIsActive },
        }),
      action: "dictionary_item.toggled",
      targetType: OperationTargetType.DICTIONARY_ITEM,
      label: "字典项",
    }),
  );
}

export async function assignCustomerTag(
  actor: Actor,
  input: {
    customerId: string;
    tagId: string;
  },
) {
  if (!canUseCustomerTags(actor.role)) {
    throw new Error("当前角色无权使用客户标签。");
  }

  const customerScope = getCustomerScope(actor.role, actor.id, actor.teamId);
  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  return prisma.$transaction(async (tx) => {
    const [customer, tag] = await Promise.all([
      tx.customer.findFirst({
        where: { id: input.customerId, ...customerScope },
        select: { id: true, name: true, phone: true },
      }),
      tx.tag.findFirst({
        where: { id: input.tagId, isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    if (!customer) {
      throw new Error("客户不存在，或你无权访问该客户。");
    }

    await assertCustomerNotInActiveRecycleBin(tx, customer.id);

    if (!tag) {
      throw new Error("标签不存在或已停用。");
    }

    const existing = await tx.customerTag.findUnique({
      where: {
        customerId_tagId: {
          customerId: customer.id,
          tagId: tag.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        status: "already_assigned" as const,
        relationId: existing.id,
      };
    }

    const created = await tx.customerTag.create({
      data: {
        customerId: customer.id,
        tagId: tag.id,
        assignedById: actor.id,
      },
      select: { id: true },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.CUSTOMER,
      action: "customer_tag.assigned",
      targetType: OperationTargetType.CUSTOMER,
      targetId: customer.id,
      description: `为客户 ${customer.name} (${customer.phone}) 添加标签：${tag.name}`,
      afterData: {
        customerTagId: created.id,
        customerId: customer.id,
        tagId: tag.id,
        tagCode: tag.code,
      },
    });

    return {
      status: "created" as const,
      relationId: created.id,
    };
  });
}

export async function removeCustomerTag(
  actor: Actor,
  input: {
    customerId: string;
    tagId: string;
  },
) {
  if (!canUseCustomerTags(actor.role)) {
    throw new Error("当前角色无权使用客户标签。");
  }

  const customerScope = getCustomerScope(actor.role, actor.id, actor.teamId);
  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
  }

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, ...customerScope },
      select: { id: true, name: true, phone: true },
    });

    if (!customer) {
      throw new Error("客户不存在，或你无权访问该客户。");
    }

    await assertCustomerNotInActiveRecycleBin(tx, customer.id);

    const relation = await tx.customerTag.findUnique({
      where: {
        customerId_tagId: {
          customerId: input.customerId,
          tagId: input.tagId,
        },
      },
      include: {
        tag: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!relation) {
      return null;
    }

    await tx.customerTag.delete({
      where: {
        customerId_tagId: {
          customerId: input.customerId,
          tagId: input.tagId,
        },
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.CUSTOMER,
      action: "customer_tag.removed",
      targetType: OperationTargetType.CUSTOMER,
      targetId: customer.id,
      description: `移除客户 ${customer.name} (${customer.phone}) 的标签：${relation.tag.name}`,
      beforeData: {
        customerId: customer.id,
        tagId: relation.tag.id,
        tagCode: relation.tag.code,
      },
    });

    return relation;
  });
}

export async function assignLeadTag(
  actor: Actor,
  input: {
    leadId: string;
    tagId: string;
  },
) {
  if (!canUseLeadTags(actor.role)) {
    throw new Error("当前角色无权使用线索标签。");
  }

  const leadScope = getLeadScope(actor.role, actor.id, actor.teamId);
  if (!leadScope) {
    throw new Error("当前角色无权访问该线索。");
  }

  return prisma.$transaction(async (tx) => {
    await assertLeadNotInRecycleBin(tx, input.leadId);

    const [lead, tag] = await Promise.all([
      tx.lead.findFirst({
        where: { id: input.leadId, ...leadScope },
        select: { id: true, name: true, phone: true },
      }),
      tx.tag.findFirst({
        where: { id: input.tagId, isActive: true },
        select: { id: true, name: true, code: true },
      }),
    ]);

    if (!lead) {
      throw new Error("线索不存在，或你无权访问该线索。");
    }

    if (!tag) {
      throw new Error("标签不存在或已停用。");
    }

    const existing = await tx.leadTag.findUnique({
      where: {
        leadId_tagId: {
          leadId: lead.id,
          tagId: tag.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    const created = await tx.leadTag.create({
      data: {
        leadId: lead.id,
        tagId: tag.id,
        assignedById: actor.id,
      },
      select: { id: true },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.LEAD,
      action: "lead_tag.assigned",
      targetType: OperationTargetType.LEAD,
      targetId: lead.id,
      description: `为线索 ${lead.name ?? lead.phone} 添加标签：${tag.name}`,
      afterData: {
        leadTagId: created.id,
        leadId: lead.id,
        tagId: tag.id,
        tagCode: tag.code,
      },
    });

    return created;
  });
}

export async function removeLeadTag(
  actor: Actor,
  input: {
    leadId: string;
    tagId: string;
  },
) {
  if (!canUseLeadTags(actor.role)) {
    throw new Error("当前角色无权使用线索标签。");
  }

  const leadScope = getLeadScope(actor.role, actor.id, actor.teamId);
  if (!leadScope) {
    throw new Error("当前角色无权访问该线索。");
  }

  return prisma.$transaction(async (tx) => {
    await assertLeadNotInRecycleBin(tx, input.leadId);

    const lead = await tx.lead.findFirst({
      where: { id: input.leadId, ...leadScope },
      select: { id: true, name: true, phone: true },
    });

    if (!lead) {
      throw new Error("线索不存在，或你无权访问该线索。");
    }

    const relation = await tx.leadTag.findUnique({
      where: {
        leadId_tagId: {
          leadId: input.leadId,
          tagId: input.tagId,
        },
      },
      include: {
        tag: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!relation) {
      return null;
    }

    await tx.leadTag.delete({
      where: {
        leadId_tagId: {
          leadId: input.leadId,
          tagId: input.tagId,
        },
      },
    });

    await createOperationLog(tx, {
      actor: { connect: { id: actor.id } },
      module: OperationModule.LEAD,
      action: "lead_tag.removed",
      targetType: OperationTargetType.LEAD,
      targetId: lead.id,
      description: `移除线索 ${lead.name ?? lead.phone} 的标签：${relation.tag.name}`,
      beforeData: {
        leadId: lead.id,
        tagId: relation.tag.id,
        tagCode: relation.tag.code,
      },
    });

    return relation;
  });
}
