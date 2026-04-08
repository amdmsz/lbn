import {
  OperationModule,
  OperationTargetType,
  type CallResult,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessSettingsModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  CALL_RESULT_EFFECT_LEVELS,
  CALL_RESULT_WECHAT_SYNC_ACTIONS,
  SYSTEM_CALL_RESULT_VALUES,
  buildCallResultOptionItems,
  getDefaultSystemCallResultDefinition,
  isSystemCallResultCode,
  mapCallResultCodeToLegacyEnum,
  resolveStoredCallResultCode,
  type CallResultDefinition,
} from "@/lib/calls/metadata";

type SearchParamsValue = string | string[] | undefined;
type DbClient = Prisma.TransactionClient | typeof prisma;

const callResultSettingSelect = {
  id: true,
  code: true,
  label: true,
  description: true,
  isSystem: true,
  isEnabled: true,
  sortOrder: true,
  effectLevel: true,
  resetsPublicPoolClock: true,
  claimProtectionDays: true,
  requiresSupervisorReview: true,
  wechatSyncAction: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CallResultSettingSelect;

type CallResultSettingRecord = Prisma.CallResultSettingGetPayload<{
  select: typeof callResultSettingSelect;
}>;

type ResolvedCallResultDefinition = CallResultDefinition & {
  id: string | null;
  source: "system-default" | "system-override" | "custom";
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type CallResultSettingsPageData = {
  notice: {
    tone: "success" | "danger";
    message: string;
  } | null;
  summary: {
    totalCount: number;
    enabledCount: number;
    systemCount: number;
    customCount: number;
    referencedCount: number;
  };
  items: Array<
    ResolvedCallResultDefinition & {
      usageCount: number;
      canDelete: boolean;
    }
  >;
};

const callResultCodeSchema = z
  .string()
  .trim()
  .min(2, "通话结果 code 至少需要 2 个字符。")
  .max(64, "通话结果 code 不能超过 64 个字符。")
  .regex(/^[A-Z][A-Z0-9_]*$/, "通话结果 code 仅支持大写字母、数字和下划线。");

const upsertCallResultSettingSchema = z.object({
  id: z.string().trim().default(""),
  code: callResultCodeSchema,
  label: z.string().trim().min(1, "请填写通话结果名称。").max(50),
  description: z.string().trim().max(1000).default(""),
  isSystem: z.boolean(),
  isEnabled: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  effectLevel: z.enum(CALL_RESULT_EFFECT_LEVELS),
  resetsPublicPoolClock: z.boolean(),
  claimProtectionDays: z.coerce.number().int().min(0).max(60),
  requiresSupervisorReview: z.boolean(),
  wechatSyncAction: z.enum(CALL_RESULT_WECHAT_SYNC_ACTIONS),
});

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseNotice(
  rawSearchParams?: Record<string, SearchParamsValue>,
): CallResultSettingsPageData["notice"] {
  const status = getParamValue(rawSearchParams?.noticeStatus);
  const message = getParamValue(rawSearchParams?.noticeMessage);

  if (!message || (status !== "success" && status !== "error")) {
    return null;
  }

  return {
    tone: status === "success" ? "success" : "danger",
    message,
  };
}

function requireCallResultSettingsAccess(role: RoleCode) {
  if (!canAccessSettingsModule(role)) {
    throw new Error("Current role cannot manage call-result settings.");
  }
}

function mapRecordToDefinition(record: CallResultSettingRecord): CallResultDefinition {
  return {
    code: record.code,
    label: record.label,
    description: record.description,
    isSystem: record.isSystem,
    isEnabled: record.isEnabled,
    sortOrder: record.sortOrder,
    effectLevel: record.effectLevel,
    resetsPublicPoolClock: record.resetsPublicPoolClock,
    claimProtectionDays: record.claimProtectionDays,
    requiresSupervisorReview: record.requiresSupervisorReview,
    wechatSyncAction: record.wechatSyncAction,
  };
}

function mapRecordToResolvedDefinition(
  record: CallResultSettingRecord,
): ResolvedCallResultDefinition {
  return {
    ...mapRecordToDefinition(record),
    id: record.id,
    source: record.isSystem ? "system-override" : "custom",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mergeCallResultDefinitions(
  rows: CallResultSettingRecord[],
): ResolvedCallResultDefinition[] {
  const rowMap = new Map(rows.map((row) => [row.code, row]));
  const merged: ResolvedCallResultDefinition[] = [];

  for (const code of SYSTEM_CALL_RESULT_VALUES) {
    const override = rowMap.get(code);

    if (override) {
      merged.push({
        ...getDefaultSystemCallResultDefinition(code),
        ...mapRecordToDefinition(override),
        id: override.id,
        source: "system-override",
        createdAt: override.createdAt,
        updatedAt: override.updatedAt,
      });
      continue;
    }

    merged.push({
      ...getDefaultSystemCallResultDefinition(code),
      id: null,
      source: "system-default",
      createdAt: null,
      updatedAt: null,
    });
  }

  for (const row of rows) {
    if (row.isSystem || isSystemCallResultCode(row.code)) {
      continue;
    }

    merged.push(mapRecordToResolvedDefinition(row));
  }

  return merged.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.isSystem !== right.isSystem) {
      return left.isSystem ? -1 : 1;
    }

    return left.label.localeCompare(right.label, "zh-Hans-CN");
  });
}

async function getCallResultUsageMap(
  db: DbClient = prisma,
): Promise<Map<string, number>> {
  const [canonicalGroups, legacyGroups] = await Promise.all([
    db.callRecord.groupBy({
      by: ["resultCode"],
      where: {
        resultCode: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
    }),
    db.callRecord.groupBy({
      by: ["result"],
      where: {
        resultCode: null,
        result: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const usageMap = new Map<string, number>();

  for (const row of canonicalGroups) {
    if (!row.resultCode) {
      continue;
    }

    usageMap.set(row.resultCode, row._count._all);
  }

  for (const row of legacyGroups) {
    if (!row.result) {
      continue;
    }

    usageMap.set(row.result, (usageMap.get(row.result) ?? 0) + row._count._all);
  }

  return usageMap;
}

export async function getMergedCallResultDefinitions(
  db: DbClient = prisma,
): Promise<ResolvedCallResultDefinition[]> {
  const rows = await db.callResultSetting.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: callResultSettingSelect,
  });

  return mergeCallResultDefinitions(rows);
}

export async function getEnabledCallResultOptions(db: DbClient = prisma) {
  const definitions = await getMergedCallResultDefinitions(db);
  return buildCallResultOptionItems(definitions);
}

export async function getCallResultDefinitionByCode(
  code: string,
  db: DbClient = prisma,
): Promise<ResolvedCallResultDefinition | null> {
  if (isSystemCallResultCode(code)) {
    const row = await db.callResultSetting.findUnique({
      where: { code },
      select: callResultSettingSelect,
    });

    if (!row) {
      return {
        ...getDefaultSystemCallResultDefinition(code),
        id: null,
        source: "system-default",
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      ...getDefaultSystemCallResultDefinition(code),
      ...mapRecordToDefinition(row),
      id: row.id,
      source: "system-override",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  const row = await db.callResultSetting.findUnique({
    where: { code },
    select: callResultSettingSelect,
  });

  return row ? mapRecordToResolvedDefinition(row) : null;
}

export async function getEnabledCallResultDefinitionByCode(
  code: string,
  db: DbClient = prisma,
) {
  const definition = await getCallResultDefinitionByCode(code, db);

  if (!definition || !definition.isEnabled) {
    return null;
  }

  return definition;
}

export async function getCallResultDefinitionMapByCodes(
  codes: string[],
  db: DbClient = prisma,
): Promise<Map<string, ResolvedCallResultDefinition>> {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];
  const customCodes = uniqueCodes.filter((code) => !isSystemCallResultCode(code));
  const systemCodes = uniqueCodes.filter((code): code is Parameters<
    typeof getDefaultSystemCallResultDefinition
  >[0] => isSystemCallResultCode(code));

  const rows =
    customCodes.length > 0 || systemCodes.length > 0
      ? await db.callResultSetting.findMany({
          where: {
            code: {
              in: uniqueCodes,
            },
          },
          select: callResultSettingSelect,
        })
      : [];

  const rowMap = new Map(rows.map((row) => [row.code, row]));
  const definitionMap = new Map<string, ResolvedCallResultDefinition>();

  for (const code of systemCodes) {
    const row = rowMap.get(code);

    if (row) {
      definitionMap.set(code, {
        ...getDefaultSystemCallResultDefinition(code),
        ...mapRecordToDefinition(row),
        id: row.id,
        source: "system-override",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    } else {
      definitionMap.set(code, {
        ...getDefaultSystemCallResultDefinition(code),
        id: null,
        source: "system-default",
        createdAt: null,
        updatedAt: null,
      });
    }
  }

  for (const code of customCodes) {
    const row = rowMap.get(code);

    if (row) {
      definitionMap.set(code, mapRecordToResolvedDefinition(row));
    }
  }

  return definitionMap;
}

export async function getCallResultSettingsPageData(
  viewer: {
    id: string;
    role: RoleCode;
  },
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<CallResultSettingsPageData> {
  requireCallResultSettingsAccess(viewer.role);

  const [definitions, usageMap] = await Promise.all([
    getMergedCallResultDefinitions(),
    getCallResultUsageMap(),
  ]);

  const items = definitions.map((item) => {
    const usageCount = usageMap.get(item.code) ?? 0;

    return {
      ...item,
      usageCount,
      canDelete: !item.isSystem && usageCount === 0,
    };
  });

  return {
    notice: parseNotice(rawSearchParams),
    summary: {
      totalCount: items.length,
      enabledCount: items.filter((item) => item.isEnabled).length,
      systemCount: items.filter((item) => item.isSystem).length,
      customCount: items.filter((item) => !item.isSystem).length,
      referencedCount: items.filter((item) => item.usageCount > 0).length,
    },
    items,
  };
}

async function getSettingsActor(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!actor) {
    throw new Error("Current user is unavailable.");
  }

  return {
    id: actor.id,
    role: actor.role.code,
  };
}

function buildCallResultUsageWhere(code: string): Prisma.CallRecordWhereInput {
  const legacyEnum = mapCallResultCodeToLegacyEnum(code);

  if (!legacyEnum) {
    return {
      resultCode: code,
    };
  }

  return {
    OR: [
      {
        resultCode: code,
      },
      {
        resultCode: null,
        result: legacyEnum,
      },
    ],
  };
}

export async function upsertCallResultSetting(
  actorId: string,
  rawInput: unknown,
) {
  const actor = await getSettingsActor(actorId);
  requireCallResultSettingsAccess(actor.role);
  const parsed = upsertCallResultSettingSchema.parse(rawInput);
  const isReservedSystemCode = isSystemCallResultCode(parsed.code);

  if (parsed.isSystem && !isReservedSystemCode) {
    throw new Error("系统结果 code 必须使用内置稳定 code。");
  }

  if (!parsed.isSystem && isReservedSystemCode) {
    throw new Error("自定义结果不能占用系统结果 code。");
  }

  return prisma.$transaction(async (tx) => {
    const current = parsed.id
      ? await tx.callResultSetting.findUnique({
          where: { id: parsed.id },
          select: callResultSettingSelect,
        })
      : await tx.callResultSetting.findUnique({
          where: { code: parsed.code },
          select: callResultSettingSelect,
        });

    if (parsed.id && !current) {
      throw new Error("当前通话结果配置不存在。");
    }

    if (current && current.isSystem !== parsed.isSystem) {
      throw new Error("当前通话结果类型与请求不一致。");
    }

    if (
      current &&
      !current.isSystem &&
      current.code !== parsed.code
    ) {
      throw new Error("自定义结果 code 创建后不可修改。");
    }

    const code = current && !current.isSystem ? current.code : parsed.code;
    const duplicated = await tx.callResultSetting.findUnique({
      where: { code },
      select: {
        id: true,
      },
    });

    if (duplicated && duplicated.id !== current?.id) {
      throw new Error("该通话结果 code 已存在。");
    }

    const payload = {
      code,
      label: parsed.label,
      description: parsed.description || null,
      isSystem: parsed.isSystem,
      isEnabled: parsed.isEnabled,
      sortOrder: parsed.sortOrder,
      effectLevel: parsed.effectLevel,
      resetsPublicPoolClock: parsed.resetsPublicPoolClock,
      claimProtectionDays: parsed.claimProtectionDays,
      requiresSupervisorReview: parsed.requiresSupervisorReview,
      wechatSyncAction: parsed.wechatSyncAction,
    } satisfies Omit<Prisma.CallResultSettingUncheckedCreateInput, "id">;

    const saved = current
      ? await tx.callResultSetting.update({
          where: { id: current.id },
          data: payload,
          select: callResultSettingSelect,
        })
      : await tx.callResultSetting.create({
          data: payload,
          select: callResultSettingSelect,
        });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: current
          ? "call_result_setting.updated"
          : "call_result_setting.created",
        targetType: OperationTargetType.CALL_RESULT_SETTING,
        targetId: saved.id,
        description: current
          ? `Updated call result setting ${saved.code}.`
          : `Created call result setting ${saved.code}.`,
        beforeData: current ? mapRecordToDefinition(current) : undefined,
        afterData: mapRecordToDefinition(saved),
      },
    });

    return saved;
  });
}

export async function deleteCallResultSetting(actorId: string, id: string) {
  const actor = await getSettingsActor(actorId);
  requireCallResultSettingsAccess(actor.role);

  return prisma.$transaction(async (tx) => {
    const current = await tx.callResultSetting.findUnique({
      where: { id },
      select: callResultSettingSelect,
    });

    if (!current) {
      throw new Error("当前通话结果配置不存在。");
    }

    if (current.isSystem || isSystemCallResultCode(current.code)) {
      throw new Error("系统结果不允许删除。");
    }

    const usageCount = await tx.callRecord.count({
      where: buildCallResultUsageWhere(current.code),
    });

    if (usageCount > 0) {
      throw new Error("该通话结果已有历史引用，只允许停用，不允许删除。");
    }

    await tx.callResultSetting.delete({
      where: { id: current.id },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "call_result_setting.deleted",
        targetType: OperationTargetType.CALL_RESULT_SETTING,
        targetId: current.id,
        description: `Deleted call result setting ${current.code}.`,
        beforeData: mapRecordToDefinition(current),
      },
    });

    return current;
  });
}

export async function hydrateCallResultLabels<T extends {
  resultCode?: string | null;
  result?: CallResult | null;
}>(
  rows: T[],
  db: DbClient = prisma,
): Promise<
  Array<
    T & {
      resolvedResultCode: string | null;
      resultLabel: string;
    }
  >
> {
  const codes = rows
    .map((row) => resolveStoredCallResultCode(row))
    .filter((value): value is string => Boolean(value));
  const definitionMap = await getCallResultDefinitionMapByCodes(codes, db);

  return rows.map((row) => {
    const resolvedResultCode = resolveStoredCallResultCode(row);
    const definition = resolvedResultCode
      ? definitionMap.get(resolvedResultCode) ?? null
      : null;

    return {
      ...row,
      resolvedResultCode,
      resultLabel: definition?.label ?? resolvedResultCode ?? "未记录",
    };
  });
}
