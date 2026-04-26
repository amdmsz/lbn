import {
  OperationModule,
  OperationTargetType,
  Prisma,
} from "@prisma/client";
import { z } from "zod";
import { canAccessSystemSettings } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  buildSystemSettingQualifiedKey,
  parseSystemSettingValue,
  requireSystemSettingDefinition,
} from "@/lib/system-settings/schema";
import {
  mapSystemSettingRecordToPublic,
  systemSettingSelect,
} from "@/lib/system-settings/queries";
import {
  encryptSystemSettingSecret,
  fingerprintSecret,
  maskSecretFingerprint,
  normalizeSecretInput,
} from "@/lib/system-settings/secrets";

const upsertSystemSettingInputSchema = z
  .object({
    namespace: z.string().trim().min(1).max(191),
    key: z.string().trim().min(1).max(191),
    valueJson: z.unknown(),
    secretPlaintext: z.string().nullable().optional(),
    clearSecret: z.boolean().default(false),
    description: z.string().trim().max(1000).nullable().optional(),
    changeReason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

const mutationSystemSettingSelect = {
  ...systemSettingSelect,
  secretValueEncrypted: true,
} satisfies Prisma.SystemSettingSelect;

type MutationSystemSettingRecord = Prisma.SystemSettingGetPayload<{
  select: typeof mutationSystemSettingSelect;
}>;

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(value: unknown) {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

async function getSystemSettingsActor(actorId: string) {
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

  if (!canAccessSystemSettings(actor.role.code)) {
    throw new Error("Current role cannot manage system settings.");
  }

  return {
    id: actor.id,
    role: actor.role.code,
  };
}

function buildAuditSnapshot(record: MutationSystemSettingRecord) {
  const definition = requireSystemSettingDefinition(record.namespace, record.key);

  return {
    namespace: record.namespace,
    key: record.key,
    qualifiedKey: buildSystemSettingQualifiedKey(record.namespace, record.key),
    title: definition.title,
    valueVersion: record.valueVersion,
    valueJson: record.valueJson ?? null,
    isSecret: record.isSecret,
    secret: {
      supported: definition.supportsSecret,
      configured: Boolean(record.secretFingerprint),
      fingerprintMasked: maskSecretFingerprint(record.secretFingerprint),
    },
  } as Prisma.InputJsonValue;
}

export async function upsertSystemSetting(actorId: string, rawInput: unknown) {
  const actor = await getSystemSettingsActor(actorId);
  const parsed = upsertSystemSettingInputSchema.parse(rawInput);
  const definition = requireSystemSettingDefinition(parsed.namespace, parsed.key);
  const valueJson = parseSystemSettingValue(
    parsed.namespace,
    parsed.key,
    parsed.valueJson,
  );
  const secretPlaintext = normalizeSecretInput(parsed.secretPlaintext);

  if (parsed.clearSecret && secretPlaintext) {
    throw new Error("Cannot clear and update a system setting secret at the same time.");
  }

  if ((parsed.clearSecret || secretPlaintext) && !definition.supportsSecret) {
    throw new Error("This system setting does not support secrets.");
  }

  return prisma.$transaction(async (tx) => {
    const current = await tx.systemSetting.findUnique({
      where: {
        namespace_key: {
          namespace: parsed.namespace,
          key: parsed.key,
        },
      },
      select: mutationSystemSettingSelect,
    });

    let secretValueEncrypted = current?.secretValueEncrypted ?? null;
    let secretFingerprint = current?.secretFingerprint ?? null;

    if (parsed.clearSecret) {
      secretValueEncrypted = null;
      secretFingerprint = null;
    } else if (secretPlaintext) {
      secretValueEncrypted = encryptSystemSettingSecret(secretPlaintext);
      secretFingerprint = fingerprintSecret(secretPlaintext);
    }

    const data = {
      namespace: parsed.namespace,
      key: parsed.key,
      valueJson: toJsonInput(valueJson),
      secretValueEncrypted,
      secretFingerprint,
      isSecret: definition.supportsSecret,
      description: parsed.description?.trim() || definition.description,
      updatedById: actor.id,
    } satisfies Omit<
      Prisma.SystemSettingUncheckedCreateInput,
      "id" | "valueVersion" | "createdAt" | "updatedAt"
    >;

    const saved = current
      ? await tx.systemSetting.update({
          where: { id: current.id },
          data: {
            ...data,
            valueVersion: {
              increment: 1,
            },
          },
          select: mutationSystemSettingSelect,
        })
      : await tx.systemSetting.create({
          data,
          select: mutationSystemSettingSelect,
        });

    await tx.systemSettingRevision.create({
      data: {
        settingId: saved.id,
        namespace: saved.namespace,
        key: saved.key,
        beforeJson: current
          ? toNullableJsonInput(current.valueJson)
          : Prisma.JsonNull,
        afterJson: toNullableJsonInput(saved.valueJson),
        beforeSecretFingerprint: current?.secretFingerprint ?? null,
        afterSecretFingerprint: saved.secretFingerprint ?? null,
        changedById: actor.id,
        changeReason: parsed.changeReason?.trim() || null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SYSTEM,
        action: current ? "system_setting.updated" : "system_setting.created",
        targetType: OperationTargetType.SYSTEM_SETTING,
        targetId: saved.id,
        description: current
          ? `Updated system setting ${saved.namespace}.${saved.key}.`
          : `Created system setting ${saved.namespace}.${saved.key}.`,
        beforeData: current ? buildAuditSnapshot(current) : undefined,
        afterData: buildAuditSnapshot(saved),
      },
    });

    return mapSystemSettingRecordToPublic(saved);
  });
}

export async function clearSystemSettingSecret(actorId: string, input: unknown) {
  await getSystemSettingsActor(actorId);

  const parsed = z
    .object({
      namespace: z.string().trim().min(1).max(191),
      key: z.string().trim().min(1).max(191),
      changeReason: z.string().trim().max(1000).nullable().optional(),
    })
    .strict()
    .parse(input);
  const current = await prisma.systemSetting.findUnique({
    where: {
      namespace_key: {
        namespace: parsed.namespace,
        key: parsed.key,
      },
    },
    select: {
      valueJson: true,
      description: true,
    },
  });

  if (!current) {
    throw new Error("System setting does not exist.");
  }

  return upsertSystemSetting(actorId, {
    namespace: parsed.namespace,
    key: parsed.key,
    valueJson: current.valueJson,
    clearSecret: true,
    description: current.description,
    changeReason: parsed.changeReason,
  });
}
