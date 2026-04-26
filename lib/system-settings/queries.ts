import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  SYSTEM_SETTING_DEFINITIONS,
  buildSystemSettingQualifiedKey,
  parseSystemSettingValue,
  requireSystemSettingDefinition,
} from "@/lib/system-settings/schema";
import {
  decryptSystemSettingSecret,
  maskSecretFingerprint,
} from "@/lib/system-settings/secrets";

type DbClient = Prisma.TransactionClient | typeof prisma;

export const systemSettingSelect = {
  id: true,
  namespace: true,
  key: true,
  valueJson: true,
  secretFingerprint: true,
  valueVersion: true,
  isSecret: true,
  description: true,
  updatedById: true,
  updatedBy: {
    select: {
      id: true,
      username: true,
      name: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SystemSettingSelect;

const systemSettingSecretSelect = {
  id: true,
  namespace: true,
  key: true,
  secretValueEncrypted: true,
} satisfies Prisma.SystemSettingSelect;

export type SystemSettingRecord = Prisma.SystemSettingGetPayload<{
  select: typeof systemSettingSelect;
}>;

export type SystemSettingPublic = {
  id: string | null;
  namespace: string;
  key: string;
  qualifiedKey: string;
  title: string;
  description: string;
  value: unknown;
  source: "database" | "default";
  valueVersion: number;
  isSecret: boolean;
  secret: {
    supported: boolean;
    configured: boolean;
    fingerprintMasked: string | null;
  };
  updatedBy: {
    id: string;
    username: string;
    name: string;
  } | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

function buildDefaultSystemSettingPublic(namespace: string, key: string): SystemSettingPublic {
  const definition = requireSystemSettingDefinition(namespace, key);

  return {
    id: null,
    namespace,
    key,
    qualifiedKey: buildSystemSettingQualifiedKey(namespace, key),
    title: definition.title,
    description: definition.description,
    value: definition.defaultValue,
    source: "default",
    valueVersion: 0,
    isSecret: definition.supportsSecret,
    secret: {
      supported: definition.supportsSecret,
      configured: false,
      fingerprintMasked: null,
    },
    updatedBy: null,
    createdAt: null,
    updatedAt: null,
  };
}

export function mapSystemSettingRecordToPublic(
  record: SystemSettingRecord,
): SystemSettingPublic {
  const definition = requireSystemSettingDefinition(record.namespace, record.key);
  const value = parseSystemSettingValue(
    record.namespace,
    record.key,
    record.valueJson ?? definition.defaultValue,
  );

  return {
    id: record.id,
    namespace: record.namespace,
    key: record.key,
    qualifiedKey: buildSystemSettingQualifiedKey(record.namespace, record.key),
    title: definition.title,
    description: record.description ?? definition.description,
    value,
    source: "database",
    valueVersion: record.valueVersion,
    isSecret: record.isSecret,
    secret: {
      supported: definition.supportsSecret,
      configured: Boolean(record.secretFingerprint),
      fingerprintMasked: maskSecretFingerprint(record.secretFingerprint),
    },
    updatedBy: record.updatedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getSystemSetting(
  namespace: string,
  key: string,
  db: DbClient = prisma,
) {
  requireSystemSettingDefinition(namespace, key);

  const record = await db.systemSetting.findUnique({
    where: {
      namespace_key: {
        namespace,
        key,
      },
    },
    select: systemSettingSelect,
  });

  return record
    ? mapSystemSettingRecordToPublic(record)
    : buildDefaultSystemSettingPublic(namespace, key);
}

export async function getSystemSettingsOverview(db: DbClient = prisma) {
  const records = await db.systemSetting.findMany({
    where: {
      OR: SYSTEM_SETTING_DEFINITIONS.map((definition) => ({
        namespace: definition.namespace,
        key: definition.key,
      })),
    },
    select: systemSettingSelect,
    orderBy: [{ namespace: "asc" }, { key: "asc" }],
  });
  const recordMap = new Map(
    records.map((record) => [
      buildSystemSettingQualifiedKey(record.namespace, record.key),
      record,
    ]),
  );

  return SYSTEM_SETTING_DEFINITIONS.map((definition) => {
    const record = recordMap.get(
      buildSystemSettingQualifiedKey(definition.namespace, definition.key),
    );

    return record
      ? mapSystemSettingRecordToPublic(record)
      : buildDefaultSystemSettingPublic(definition.namespace, definition.key);
  });
}

export async function resolveSystemSettingValue<T = unknown>(
  namespace: string,
  key: string,
  options: {
    fallbackValue?: T;
    db?: DbClient;
  } = {},
): Promise<{
  value: T;
  source: "database" | "fallback" | "default";
}> {
  const definition = requireSystemSettingDefinition(namespace, key);
  const db = options.db ?? prisma;
  const record = await db.systemSetting.findUnique({
    where: {
      namespace_key: {
        namespace,
        key,
      },
    },
    select: {
      valueJson: true,
    },
  });

  if (record) {
    return {
      value: parseSystemSettingValue(namespace, key, record.valueJson) as T,
      source: "database",
    };
  }

  if (options.fallbackValue !== undefined) {
    return {
      value: definition.schema.parse(options.fallbackValue) as T,
      source: "fallback",
    };
  }

  return {
    value: definition.defaultValue as T,
    source: "default",
  };
}

export async function getSystemSettingSecret(
  namespace: string,
  key: string,
  db: DbClient = prisma,
) {
  const definition = requireSystemSettingDefinition(namespace, key);

  if (!definition.supportsSecret) {
    return null;
  }

  const record = await db.systemSetting.findUnique({
    where: {
      namespace_key: {
        namespace,
        key,
      },
    },
    select: systemSettingSecretSelect,
  });

  if (!record?.secretValueEncrypted) {
    return null;
  }

  return decryptSystemSettingSecret(record.secretValueEncrypted);
}

export async function getSystemSettingRevisions(
  namespace: string,
  key: string,
  options: {
    limit?: number;
    db?: DbClient;
  } = {},
) {
  requireSystemSettingDefinition(namespace, key);

  return (options.db ?? prisma).systemSettingRevision.findMany({
    where: {
      namespace,
      key,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Math.min(Math.max(options.limit ?? 20, 1), 100),
    select: {
      id: true,
      namespace: true,
      key: true,
      beforeJson: true,
      afterJson: true,
      beforeSecretFingerprint: true,
      afterSecretFingerprint: true,
      changeReason: true,
      createdAt: true,
      changedBy: {
        select: {
          id: true,
          username: true,
          name: true,
        },
      },
    },
  });
}
