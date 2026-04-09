import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import {
  CallResult,
  CustomerLevel,
  CustomerOwnershipEventReason,
  CustomerOwnershipMode,
  CustomerStatus,
  OperationModule,
  OperationTargetType,
  PrismaClient,
  PublicPoolReason,
  RoleCode,
  UserStatus,
  WechatAddStatus,
} from "@prisma/client";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    process.env.DATABASE_URL ?? "mysql://root:password@127.0.0.1:3306/liquor_crm",
  ),
  log: ["warn", "error"],
});

const MODE_DRY_RUN = "dry-run";
const MODE_APPLY = "apply";
const DEFAULT_CLAIM_PROTECTION_DAYS = 2;
const DEFAULT_SHEET_NAME = "导入模板";
const DEFAULT_HEADER_ROW_INDEX = 2;
const LEGACY_TAG_GROUP_CODE = "LEGACY_IMPORT";
const LEGACY_TAG_GROUP_NAME = "老系统导入";
const LEGACY_TAG_CATEGORY_TYPE_CODE = "LEGACY_CUSTOMER_TYPE";
const LEGACY_TAG_CATEGORY_TYPE_NAME = "老系统客户类型";
const LEGACY_TAG_CATEGORY_CLASS_CODE = "LEGACY_CUSTOMER_CATEGORY";
const LEGACY_TAG_CATEGORY_CLASS_NAME = "老系统客户分类";
const DEFAULT_OWNER_ASSIGNMENT_EXCLUDED_CATEGORIES = [
  "拒绝添加",
  "无效客户（空号/停机）",
];
const IMPORTED_SIGNAL_PREFIX = "[legacy-import-signal]";
const IMPORTED_WECHAT_ADDED_SUMMARY = `${IMPORTED_SIGNAL_PREFIX} 老系统映射：已加微信`;
const IMPORTED_HUNG_UP_REMARK = `${IMPORTED_SIGNAL_PREFIX} 老系统映射：挂断（待回访）`;
const IMPORTED_REFUSED_WECHAT_REMARK = `${IMPORTED_SIGNAL_PREFIX} 老系统映射：拒绝加微信`;
const IMPORTED_INVALID_NUMBER_REMARK = `${IMPORTED_SIGNAL_PREFIX} 老系统映射：空号/无效号码`;

const knownTypeMeta = {
  成交: {
    code: "LEGACY_TYPE_CLOSED_WON",
    description: "Legacy customer type imported from the old CRM workbook.",
  },
  未成交: {
    code: "LEGACY_TYPE_NOT_CONVERTED",
    description: "Legacy customer type imported from the old CRM workbook.",
  },
};

const knownCategoryMeta = {
  "跟进客户（未接通/拒接）": {
    code: "LEGACY_CATEGORY_FOLLOW_UP_PENDING",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.NEW,
  },
  "D类已加微信": {
    code: "LEGACY_CATEGORY_WECHAT_ADDED",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.NEW,
  },
  新进客户: {
    code: "LEGACY_CATEGORY_NEW_INTAKE",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.NEW,
  },
  拒绝添加: {
    code: "LEGACY_CATEGORY_WECHAT_REJECTED",
    status: CustomerStatus.DORMANT,
    level: CustomerLevel.NEW,
  },
  "无效客户（空号/停机）": {
    code: "LEGACY_CATEGORY_INVALID_NUMBER",
    status: CustomerStatus.LOST,
    level: CustomerLevel.NEW,
  },
  "C类客户（复购客户）": {
    code: "LEGACY_CATEGORY_REPEAT_PURCHASE_C",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.REGULAR,
  },
  "B类（复购1W以上）": {
    code: "LEGACY_CATEGORY_REPEAT_PURCHASE_B",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.VIP,
  },
  "A类（复购5W客户）": {
    code: "LEGACY_CATEGORY_REPEAT_PURCHASE_A",
    status: CustomerStatus.ACTIVE,
    level: CustomerLevel.VIP,
  },
};

function normalizeLegacySignalText(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "");
}

function parseOptionalDateTime(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildBusinessTagLookupCandidates(value) {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return [];
  }

  const normalized = normalizeLegacySignalText(trimmed);
  const candidates = new Set([trimmed]);

  if (normalized.includes("a类") || normalized === "a") {
    candidates.add("A");
    candidates.add("A类");
  }
  if (normalized.includes("b类") || normalized === "b") {
    candidates.add("B");
    candidates.add("B类");
  }
  if (normalized.includes("c类") || normalized === "c") {
    candidates.add("C");
    candidates.add("C类");
  }
  if (normalized.includes("d类") || normalized === "d") {
    candidates.add("D");
    candidates.add("D类");
  }

  return [...candidates];
}

function resolveLegacyImportedSignal(candidate) {
  const sourceTexts = [
    candidate.customerCategory,
    candidate.returnVisitResult,
    candidate.legacyRemark,
  ];
  const normalizedTexts = sourceTexts
    .map((value) => normalizeLegacySignalText(value))
    .filter(Boolean);

  if (!normalizedTexts.length) {
    return null;
  }

  const occurredAt =
    parseOptionalDateTime(candidate.legacyImportTime) ??
    parseOptionalDateTime(candidate.buildTime) ??
    new Date();
  const matches = (patterns) =>
    normalizedTexts.some((value) => patterns.some((pattern) => value.includes(pattern)));

  if (matches(["无效客户", "空号", "停机", "无效号码"])) {
    return {
      kind: "CALL_RESULT",
      occurredAt,
      marker: IMPORTED_INVALID_NUMBER_REMARK,
      result: CallResult.INVALID_NUMBER,
      resultCode: "INVALID_NUMBER",
      remark: IMPORTED_INVALID_NUMBER_REMARK,
      nextFollowUpAt: null,
    };
  }

  if (matches(["拒绝添加"])) {
    return {
      kind: "CALL_RESULT",
      occurredAt,
      marker: IMPORTED_REFUSED_WECHAT_REMARK,
      result: CallResult.REFUSED_WECHAT,
      resultCode: "REFUSED_WECHAT",
      remark: IMPORTED_REFUSED_WECHAT_REMARK,
      nextFollowUpAt: null,
    };
  }

  if (matches(["跟进客户", "未接通", "未接", "拒接"])) {
    return {
      kind: "CALL_RESULT",
      occurredAt,
      marker: IMPORTED_HUNG_UP_REMARK,
      result: CallResult.HUNG_UP,
      resultCode: "HUNG_UP",
      remark: IMPORTED_HUNG_UP_REMARK,
      nextFollowUpAt: occurredAt,
    };
  }

  if (matches(["已加微信", "a类", "b类", "c类", "d类"])) {
    return {
      kind: "WECHAT_ADDED",
      occurredAt,
      marker: IMPORTED_WECHAT_ADDED_SUMMARY,
      summary: IMPORTED_WECHAT_ADDED_SUMMARY,
    };
  }

  return null;
}

function parseArgs(argv) {
  const args = {
    mode: "",
    configPath: "",
    limit: 0,
    reportFile: "",
  };

  for (const token of argv.slice(2)) {
    if (token === "--dry-run") args.mode = MODE_DRY_RUN;
    else if (token === "--apply") args.mode = MODE_APPLY;
    else if (token.startsWith("--config=")) args.configPath = token.slice(9).trim();
    else if (token.startsWith("--limit=")) {
      const parsed = Number(token.slice(8));
      args.limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    } else if (token.startsWith("--report-file=")) {
      args.reportFile = token.slice(14).trim();
    }
  }

  if (!args.mode) {
    throw new Error("You must pass either --dry-run or --apply.");
  }

  if (!args.configPath) {
    throw new Error("You must pass --config=/absolute/or/relative/path.json.");
  }

  return args;
}

async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  const value = JSON.parse(raw.replace(/^\uFEFF/, ""));

  const config = {
    filePath: typeof value.filePath === "string" ? value.filePath.trim() : "",
    sheetName:
      typeof value.sheetName === "string" && value.sheetName.trim()
        ? value.sheetName.trim()
        : DEFAULT_SHEET_NAME,
    headerRowIndex:
      Number.isInteger(value.headerRowIndex) && value.headerRowIndex > 0
        ? value.headerRowIndex
        : DEFAULT_HEADER_ROW_INDEX,
    actorUsername:
      typeof value.actorUsername === "string" ? value.actorUsername.trim() : "",
    ownerCodeMap:
      value.ownerCodeMap && typeof value.ownerCodeMap === "object" && !Array.isArray(value.ownerCodeMap)
        ? Object.fromEntries(
            Object.entries(value.ownerCodeMap).map(([key, mappedValue]) => [
              key.trim(),
              typeof mappedValue === "string" ? mappedValue.trim() : "",
            ]),
          )
        : {},
    assignNewCustomersToMappedOwner:
      value.assignNewCustomersToMappedOwner !== false,
    assignExistingUnownedToMappedOwner:
      value.assignExistingUnownedToMappedOwner === true,
    mergeExistingStrategy:
      value.mergeExistingStrategy === "none" ? "none" : "fill-empty",
    ownerAssignmentExcludedCategories: Array.isArray(value.ownerAssignmentExcludedCategories)
      ? value.ownerAssignmentExcludedCategories
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [...DEFAULT_OWNER_ASSIGNMENT_EXCLUDED_CATEGORIES],
    legacyRemarkPrefix:
      typeof value.legacyRemarkPrefix === "string" && value.legacyRemarkPrefix.trim()
        ? value.legacyRemarkPrefix.trim()
        : "[legacy-import]",
    configPath: absolutePath,
  };

  if (!config.filePath) {
    throw new Error("config.filePath is required.");
  }

  if (!config.actorUsername) {
    throw new Error("config.actorUsername is required.");
  }

  return config;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value) {
  const next = normalizeText(value);
  return next ? next : null;
}

function normalizePhone(rawValue) {
  const digits = String(rawValue ?? "").replace(/\D/g, "");

  if (digits.length === 11) {
    return digits;
  }

  if (digits.length === 13 && digits.startsWith("86")) {
    return digits.slice(2);
  }

  return "";
}

function parseCurrency(value) {
  const normalized = normalizeText(String(value ?? "")).replace(/,/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").replace(/,/g, "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addDays(baseAt, days) {
  const next = new Date(baseAt);
  next.setDate(next.getDate() + days);
  return next;
}

function hashLabel(label) {
  return createHash("sha1").update(label).digest("hex").slice(0, 10).toUpperCase();
}

function makeFallbackTagCode(prefix, label) {
  return `${prefix}_${hashLabel(label)}`;
}

function resolveTagMeta(kind, label) {
  const normalized = normalizeText(label);
  if (!normalized) {
    return null;
  }

  if (kind === "type") {
    const known = knownTypeMeta[normalized];
    if (known) {
      return {
        code: known.code,
        name: normalized,
        description: known.description,
      };
    }

    return {
      code: makeFallbackTagCode("LEGACY_TYPE", normalized),
      name: normalized,
      description: "Legacy customer type imported from the old CRM workbook.",
    };
  }

  const known = knownCategoryMeta[normalized];
  if (known) {
    return {
      code: known.code,
      name: normalized,
      description: "Legacy customer category imported from the old CRM workbook.",
    };
  }

  return {
    code: makeFallbackTagCode("LEGACY_CATEGORY", normalized),
    name: normalized,
    description: "Legacy customer category imported from the old CRM workbook.",
  };
}

function resolveNewCustomerStatus(candidate) {
  const known = knownCategoryMeta[candidate.customerCategory];
  if (known) {
    return known.status;
  }

  return CustomerStatus.ACTIVE;
}

function resolveNewCustomerLevel(candidate) {
  const known = knownCategoryMeta[candidate.customerCategory];
  if (known) {
    return known.level;
  }

  if (candidate.purchaseCount > 0 || candidate.totalSpent > 0 || candidate.customerType === "成交") {
    return CustomerLevel.REGULAR;
  }

  return CustomerLevel.NEW;
}

function buildLegacyRemark(candidate, prefix) {
  const summaryLine = [
    `${prefix} oldCustomerId=${candidate.originalCustomerId || "-"}`,
    `type=${candidate.customerType || "-"}`,
    `category=${candidate.customerCategory || "-"}`,
    `totalSpent=${candidate.totalSpent.toFixed(2)}`,
    `purchaseCount=${candidate.purchaseCount}`,
    `createdAt=${candidate.buildTime || "-"}`,
  ].join(" ; ");

  const detailLines = [
    candidate.importedProduct ? `导入产品: ${candidate.importedProduct}` : "",
    candidate.returnVisitResult ? `回访结果: ${candidate.returnVisitResult}` : "",
    candidate.legacyRemark ? `老系统备注: ${candidate.legacyRemark}` : "",
  ].filter(Boolean);

  return [summaryLine, ...detailLines].join("\n");
}

function appendLegacyRemark(existingRemark, nextRemark, marker) {
  const current = normalizeText(existingRemark);
  if (!current) {
    return nextRemark;
  }

  if (current.includes(marker)) {
    return current;
  }

  return `${current}\n${nextRemark}`;
}

function readWorkbookRows(filePath, sheetName, headerRowIndex) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: false,
  });

  const worksheetName = sheetName || workbook.SheetNames[0];
  if (!worksheetName || !workbook.Sheets[worksheetName]) {
    throw new Error(`Worksheet "${sheetName}" does not exist in ${filePath}.`);
  }

  const worksheet = workbook.Sheets[worksheetName];
  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });

  const headerRow = matrix[headerRowIndex - 1] ?? [];
  const headers = headerRow.map((value) => String(value ?? "").trim());

  if (!headers.length || !headers.some(Boolean)) {
    throw new Error(`Header row ${headerRowIndex} is empty in worksheet "${worksheetName}".`);
  }

  return matrix.slice(headerRowIndex).map((row, index) => ({
    rowNumber: headerRowIndex + index + 1,
    rawRow: Object.fromEntries(
      headers.map((header, cellIndex) => [header, String(row[cellIndex] ?? "").trim()]),
    ),
  }));
}

function parseLegacyCandidate(entry) {
  const row = entry.rawRow;
  const detailedAddress = normalizeText(row["详细地址"]);
  const province = normalizeNullableText(row["省份"]);
  const city = normalizeNullableText(row["城市"]);
  const district = normalizeNullableText(row["区县"]);
  const fallbackAddress = [province, city, district].filter(Boolean).join(" ");
  const address = normalizeNullableText(detailedAddress || fallbackAddress);
  const name = normalizeText(row["客户姓名"]);
  const phone = normalizePhone(row["手机号"]);

  return {
    rowNumber: entry.rowNumber,
    originalCustomerId: normalizeText(row["原客户ID"]),
    name: name || phone || normalizeText(row["原客户ID"]),
    rawName: name,
    rawPhone: normalizeText(row["手机号"]),
    phone,
    address,
    province,
    city,
    district,
    customerType: normalizeText(row["客户类型"]),
    customerCategory: normalizeText(row["客户分类"]),
    totalSpent: parseCurrency(row["累计消费金额"]),
    purchaseCount: parseInteger(row["购买次数"]),
    buildTime: normalizeText(row["建档时间"]),
    legacyImportTime: normalizeText(row["导入时间"]),
    returnVisitResult: normalizeText(row["回访结果"]),
    importedProduct: normalizeText(row["导入产品"]),
    legacyRemark: normalizeText(row["备注"]),
    originalOwnerCode: normalizeText(row["原归属工号"]),
    originalOwnerName: normalizeText(row["原归属员工"]),
    originalOwnerTeam: normalizeText(row["原归属部门"]),
    followUpOwnerCode: normalizeText(row["跟进工号"]),
    followUpOwnerName: normalizeText(row["跟进员工"]),
    followUpOwnerTeam: normalizeText(row["跟进部门"]),
    lastOperatorCode: normalizeText(row["最后操作工号"]),
    lastOperatorName: normalizeText(row["最后操作员工"]),
    lastOperatorTeam: normalizeText(row["最后操作部门"]),
    suggestedOwnerCode: normalizeText(row["建议导入归属工号"]),
    suggestedOwnerName: normalizeText(row["建议导入归属员工"]),
    suggestedOwnerTeam: normalizeText(row["建议导入归属部门"]),
    originalPhoneCipher: normalizeText(row["原手机号密文"]),
    rawRow: row,
  };
}

function buildLegacySnapshot(candidate) {
  return {
    originalCustomerId: candidate.originalCustomerId || null,
    customerName: candidate.rawName || null,
    customerType: candidate.customerType || null,
    customerCategory: candidate.customerCategory || null,
    totalSpent: candidate.totalSpent,
    purchaseCount: candidate.purchaseCount,
    buildTime: candidate.buildTime || null,
    legacyImportTime: candidate.legacyImportTime || null,
    returnVisitResult: candidate.returnVisitResult || null,
    importedProduct: candidate.importedProduct || null,
    legacyRemark: candidate.legacyRemark || null,
    originalOwner: {
      code: candidate.originalOwnerCode || null,
      name: candidate.originalOwnerName || null,
      team: candidate.originalOwnerTeam || null,
    },
    followUpOwner: {
      code: candidate.followUpOwnerCode || null,
      name: candidate.followUpOwnerName || null,
      team: candidate.followUpOwnerTeam || null,
    },
    lastOperator: {
      code: candidate.lastOperatorCode || null,
      name: candidate.lastOperatorName || null,
      team: candidate.lastOperatorTeam || null,
    },
    suggestedOwner: {
      code: candidate.suggestedOwnerCode || null,
      name: candidate.suggestedOwnerName || null,
      team: candidate.suggestedOwnerTeam || null,
    },
    originalPhoneCipher: candidate.originalPhoneCipher || null,
    rawPhone: candidate.rawPhone || null,
    rowNumber: candidate.rowNumber,
  };
}

function createReport(args, config) {
  return {
    meta: {
      scriptName: "import-legacy-customers",
      scriptVersion: "v1",
      mode: args.mode,
      configPath: config.configPath,
      filePath: path.resolve(config.filePath),
      sheetName: config.sheetName,
      headerRowIndex: config.headerRowIndex,
      startedAt: new Date().toISOString(),
      endedAt: null,
      limit: args.limit || null,
    },
    summary: {
      scannedRows: 0,
      eligibleRows: 0,
      createdCustomers: 0,
      createdPrivateCustomers: 0,
      createdPublicCustomers: 0,
      matchedExistingCustomers: 0,
      updatedExistingCustomers: 0,
      assignedExistingUnownedCustomers: 0,
      duplicateRowsSkipped: 0,
      failedRows: 0,
      ownerCodesResolved: 0,
      ownerCodesUnresolved: 0,
      tagsUpserted: 0,
    },
    warnings: [],
    failures: [],
    duplicateRows: [],
    unresolvedOwnerCodes: {},
  };
}

async function resolveActor(config) {
  const actor = await prisma.user.findUnique({
    where: { username: config.actorUsername },
    select: {
      id: true,
      username: true,
      name: true,
      teamId: true,
      userStatus: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  if (!actor) {
    throw new Error(`Actor user "${config.actorUsername}" does not exist.`);
  }

  if (actor.userStatus !== UserStatus.ACTIVE) {
    throw new Error(`Actor user "${config.actorUsername}" is not active.`);
  }

  if (actor.role.code !== RoleCode.ADMIN && actor.role.code !== RoleCode.SUPERVISOR) {
    throw new Error("Actor user must be ADMIN or SUPERVISOR.");
  }

  return actor;
}

async function resolveOwnerUsers(config, report) {
  const ownerCodeEntries = Object.entries(config.ownerCodeMap).filter(
    ([code, username]) => code && username,
  );

  if (!ownerCodeEntries.length) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: {
      username: {
        in: ownerCodeEntries.map(([, username]) => username),
      },
    },
    select: {
      id: true,
      username: true,
      name: true,
      teamId: true,
      userStatus: true,
      role: {
        select: {
          code: true,
        },
      },
    },
  });

  const byUsername = new Map(users.map((user) => [user.username, user]));
  const resolved = new Map();

  for (const [ownerCode, username] of ownerCodeEntries) {
    const user = byUsername.get(username);
    if (!user) {
      report.warnings.push(`Owner code ${ownerCode} maps to missing username "${username}".`);
      continue;
    }

    if (user.userStatus !== UserStatus.ACTIVE) {
      report.warnings.push(`Owner code ${ownerCode} maps to inactive username "${username}".`);
      continue;
    }

    if (user.role.code !== RoleCode.SALES) {
      report.warnings.push(`Owner code ${ownerCode} maps to "${username}", which is not SALES.`);
      continue;
    }

    resolved.set(ownerCode, user);
  }

  return resolved;
}

function collectUniqueTagLabels(candidates) {
  const typeLabels = new Set();
  const categoryLabels = new Set();

  for (const candidate of candidates) {
    if (candidate.customerType) {
      typeLabels.add(candidate.customerType);
    }
    if (candidate.customerCategory) {
      categoryLabels.add(candidate.customerCategory);
    }
  }

  return {
    typeLabels: [...typeLabels],
    categoryLabels: [...categoryLabels],
  };
}

async function upsertLegacyTag(tx, input) {
  const tag = await tx.tag.upsert({
    where: { code: input.code },
    update: {
      groupId: input.groupId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      isActive: true,
    },
    create: {
      code: input.code,
      groupId: input.groupId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  return tag;
}

async function ensureLegacyTags(candidates) {
  const collected = collectUniqueTagLabels(candidates);

  return prisma.$transaction(async (tx) => {
    const group = await tx.tagGroup.upsert({
      where: { code: LEGACY_TAG_GROUP_CODE },
      update: {
        name: LEGACY_TAG_GROUP_NAME,
        isActive: true,
      },
      create: {
        code: LEGACY_TAG_GROUP_CODE,
        name: LEGACY_TAG_GROUP_NAME,
        description: "Legacy customer type/category tags imported from the old CRM workbook.",
        sortOrder: 90,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const typeCategory = await tx.tagCategory.upsert({
      where: { code: LEGACY_TAG_CATEGORY_TYPE_CODE },
      update: {
        groupId: group.id,
        name: LEGACY_TAG_CATEGORY_TYPE_NAME,
        isActive: true,
      },
      create: {
        code: LEGACY_TAG_CATEGORY_TYPE_CODE,
        groupId: group.id,
        name: LEGACY_TAG_CATEGORY_TYPE_NAME,
        description: "Legacy customer type tags imported from the old CRM workbook.",
        sortOrder: 90,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const classCategory = await tx.tagCategory.upsert({
      where: { code: LEGACY_TAG_CATEGORY_CLASS_CODE },
      update: {
        groupId: group.id,
        name: LEGACY_TAG_CATEGORY_CLASS_NAME,
        isActive: true,
      },
      create: {
        code: LEGACY_TAG_CATEGORY_CLASS_CODE,
        groupId: group.id,
        name: LEGACY_TAG_CATEGORY_CLASS_NAME,
        description: "Legacy customer category tags imported from the old CRM workbook.",
        sortOrder: 100,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const typeTags = new Map();
    for (const [index, label] of collected.typeLabels.entries()) {
      const meta = resolveTagMeta("type", label);
      if (!meta) continue;
      const tag = await upsertLegacyTag(tx, {
        groupId: group.id,
        categoryId: typeCategory.id,
        code: meta.code,
        name: meta.name,
        description: meta.description,
        sortOrder: 100 + index,
      });
      typeTags.set(label, tag);
    }

    const categoryTags = new Map();
    for (const [index, label] of collected.categoryLabels.entries()) {
      const meta = resolveTagMeta("category", label);
      if (!meta) continue;
      const tag = await upsertLegacyTag(tx, {
        groupId: group.id,
        categoryId: classCategory.id,
        code: meta.code,
        name: meta.name,
        description: meta.description,
        sortOrder: 200 + index,
      });
      categoryTags.set(label, tag);
    }

    return {
      typeTags,
      categoryTags,
      totalTags: typeTags.size + categoryTags.size,
    };
  });
}

async function resolveBusinessCategoryTags(candidates) {
  const categoryLabels = [
    ...new Set(candidates.map((candidate) => candidate.customerCategory).filter(Boolean)),
  ];
  const lookupValues = [
    ...new Set(categoryLabels.flatMap((label) => buildBusinessTagLookupCandidates(label))),
  ];

  if (!lookupValues.length) {
    return new Map();
  }

  const activeTags = await prisma.tag.findMany({
    where: {
      isActive: true,
      OR: [
        {
          code: {
            in: lookupValues.map((value) => value.toUpperCase()),
          },
        },
        {
          name: {
            in: lookupValues,
          },
        },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
    },
  });

  const tagByCode = new Map(activeTags.map((item) => [item.code.toUpperCase(), item]));
  const tagByName = new Map(activeTags.map((item) => [item.name, item]));
  const resolved = new Map();

  for (const label of categoryLabels) {
    const businessTag =
      buildBusinessTagLookupCandidates(label)
        .map((candidate) => tagByCode.get(candidate.toUpperCase()) ?? tagByName.get(candidate))
        .find(Boolean) ?? null;

    if (businessTag) {
      resolved.set(label, businessTag);
    }
  }

  return resolved;
}

function buildCandidateTagIds(candidate, tagMaps, businessCategoryTags) {
  const tagIds = [];
  const tagCodes = [];

  const typeTag = tagMaps.typeTags.get(candidate.customerType);
  if (typeTag) {
    tagIds.push(typeTag.id);
    tagCodes.push(typeTag.code);
  }

  const categoryTag = tagMaps.categoryTags.get(candidate.customerCategory);
  if (categoryTag) {
    tagIds.push(categoryTag.id);
    tagCodes.push(categoryTag.code);
  }

  const businessTag = businessCategoryTags.get(candidate.customerCategory);
  if (businessTag && !tagIds.includes(businessTag.id)) {
    tagIds.push(businessTag.id);
    tagCodes.push(businessTag.code);
  }

  return {
    tagIds,
    tagCodes,
  };
}

function shouldAssignCandidate(candidate, ownerUser, config) {
  return (
    Boolean(ownerUser) &&
    !config.ownerAssignmentExcludedCategories.includes(candidate.customerCategory)
  );
}

function shouldSkipDuplicate(candidate, seenPhones, report) {
  if (!candidate.phone) {
    return false;
  }

  if (!seenPhones.has(candidate.phone)) {
    seenPhones.add(candidate.phone);
    return false;
  }

  report.summary.duplicateRowsSkipped += 1;
  report.duplicateRows.push({
    rowNumber: candidate.rowNumber,
    phone: candidate.phone,
    originalCustomerId: candidate.originalCustomerId || null,
  });
  return true;
}

async function upsertCustomerTagsTx(tx, input) {
  const assignedTagCodes = [];

  for (const tagId of input.tagIds) {
    const existing = await tx.customerTag.findUnique({
      where: {
        customerId_tagId: {
          customerId: input.customerId,
          tagId,
        },
      },
      select: {
        id: true,
        tag: {
          select: {
            code: true,
          },
        },
      },
    });

    if (existing) {
      assignedTagCodes.push(existing.tag.code);
      continue;
    }

    const created = await tx.customerTag.create({
      data: {
        customerId: input.customerId,
        tagId,
        assignedById: input.actorId,
      },
      select: {
        tag: {
          select: {
            code: true,
          },
        },
      },
    });

    assignedTagCodes.push(created.tag.code);
  }

  return assignedTagCodes;
}

function buildOwnershipBeforeData(customer) {
  return {
    ownerId: customer.ownerId,
    ownershipMode: customer.ownershipMode,
    lastOwnerId: customer.lastOwnerId,
    publicPoolEnteredAt: customer.publicPoolEnteredAt,
    publicPoolReason: customer.publicPoolReason,
    claimLockedUntil: customer.claimLockedUntil,
    publicPoolTeamId: customer.publicPoolTeamId,
  };
}

async function createOwnershipEventAndLogTx(tx, input) {
  const event = await tx.customerOwnershipEvent.create({
    data: {
      customerId: input.customerId,
      fromOwnerId: input.before.ownerId,
      toOwnerId: input.after.ownerId,
      fromOwnershipMode: input.before.ownershipMode,
      toOwnershipMode: input.after.ownershipMode,
      reason: input.reason,
      actorId: input.actorId,
      teamId: input.after.publicPoolTeamId ?? null,
      note: input.note ?? null,
      effectiveFollowUpAt: input.after.lastEffectiveFollowUpAt ?? null,
      claimLockedUntil: input.after.claimLockedUntil ?? null,
    },
    select: {
      id: true,
    },
  });

  await tx.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.CUSTOMER,
      action: input.action,
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customerId,
      description: input.description,
      beforeData: input.logBeforeData ?? null,
      afterData: {
        ...(input.logAfterData ?? {}),
        customerOwnershipEventId: event.id,
        reason: input.reason,
      },
    },
  });

  return event;
}

async function ensureLegacyCustomerSignalTx(tx, input) {
  if (!input.signal) {
    return null;
  }

  if (input.signal.kind === "WECHAT_ADDED") {
    const existingWechatTouch = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        addedStatus: WechatAddStatus.ADDED,
      },
      select: { id: true },
    });

    if (existingWechatTouch) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      };
    }

    const existingCallTouch = await tx.callRecord.findFirst({
      where: {
        customerId: input.customerId,
        OR: [
          { result: CallResult.WECHAT_ADDED },
          { resultCode: "WECHAT_ADDED" },
        ],
      },
      select: { id: true },
    });

    if (existingCallTouch) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      };
    }

    const existingImportedRecord = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        summary: input.signal.marker,
      },
      select: { id: true },
    });

    if (existingImportedRecord) {
      return {
        kind: input.signal.kind,
        status: "already_imported",
      };
    }

    const created = await tx.wechatRecord.create({
      data: {
        customerId: input.customerId,
        salesId: input.salesId,
        addedStatus: WechatAddStatus.ADDED,
        addedAt: input.signal.occurredAt,
        summary: input.signal.summary,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: input.actorId,
        module: OperationModule.WECHAT,
        action: "wechat_record.created_from_legacy_import",
        targetType: OperationTargetType.CUSTOMER,
        targetId: input.customerId,
        description: `Legacy import created wechat signal for ${input.customerName} (${input.customerPhone}).`,
        afterData: {
          customerId: input.customerId,
          salesId: input.salesId,
          wechatRecordId: created.id,
          addedStatus: WechatAddStatus.ADDED,
          addedAt: input.signal.occurredAt,
          batchId: input.batchId,
          rowNumber: input.rowNumber,
          marker: input.signal.marker,
          legacyImport: true,
        },
      },
    });

    return {
      kind: input.signal.kind,
      status: "created",
      wechatRecordId: created.id,
    };
  }

  const existingImportedRecord = await tx.callRecord.findFirst({
    where: {
      customerId: input.customerId,
      remark: input.signal.marker,
    },
    select: { id: true },
  });

  if (existingImportedRecord) {
    return {
      kind: input.signal.kind,
      status: "already_imported",
    };
  }

  if (input.signal.resultCode === "REFUSED_WECHAT") {
    const existingRejectedWechat = await tx.wechatRecord.findFirst({
      where: {
        customerId: input.customerId,
        addedStatus: WechatAddStatus.REJECTED,
      },
      select: { id: true },
    });

    if (existingRejectedWechat) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      };
    }
  }

  if (input.signal.resultCode === "INVALID_NUMBER") {
    const existingInvalidCall = await tx.callRecord.findFirst({
      where: {
        customerId: input.customerId,
        OR: [
          { result: CallResult.INVALID_NUMBER },
          { resultCode: "INVALID_NUMBER" },
        ],
      },
      select: { id: true },
    });

    if (existingInvalidCall) {
      return {
        kind: input.signal.kind,
        status: "reused_existing",
      };
    }
  }

  const created = await tx.callRecord.create({
    data: {
      customerId: input.customerId,
      salesId: input.salesId,
      callTime: input.signal.occurredAt,
      durationSeconds: 0,
      result: input.signal.result,
      resultCode: input.signal.resultCode,
      remark: input.signal.remark,
      nextFollowUpAt: input.signal.nextFollowUpAt,
    },
    select: {
      id: true,
    },
  });

  await tx.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.CALL,
      action: "call_record.created_from_legacy_import",
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customerId,
      description: `Legacy import created call signal for ${input.customerName} (${input.customerPhone}).`,
      afterData: {
        customerId: input.customerId,
        salesId: input.salesId,
        callRecordId: created.id,
        callTime: input.signal.occurredAt,
        result: input.signal.result,
        resultCode: input.signal.resultCode,
        nextFollowUpAt: input.signal.nextFollowUpAt,
        batchId: input.batchId,
        rowNumber: input.rowNumber,
        marker: input.signal.marker,
        legacyImport: true,
      },
    },
  });

  return {
    kind: input.signal.kind,
    status: "created",
    callRecordId: created.id,
    resultCode: input.signal.resultCode,
  };
}

async function processCandidateApply({
  actor,
  candidate,
  ownerUser,
  config,
  tagMaps,
  businessCategoryTags,
  report,
}) {
  const snapshot = buildLegacySnapshot(candidate);
  const newCustomerStatus = resolveNewCustomerStatus(candidate);
  const newCustomerLevel = resolveNewCustomerLevel(candidate);
  const remark = buildLegacyRemark(candidate, config.legacyRemarkPrefix);
  const marker = `${config.legacyRemarkPrefix} oldCustomerId=${candidate.originalCustomerId || "-"}`;
  const shouldAssignOwner = shouldAssignCandidate(candidate, ownerUser, config);
  const importedSignal = resolveLegacyImportedSignal(candidate);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findUnique({
      where: { phone: candidate.phone },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        province: true,
        city: true,
        district: true,
        status: true,
        level: true,
        ownerId: true,
        ownershipMode: true,
        lastOwnerId: true,
        publicPoolEnteredAt: true,
        publicPoolReason: true,
        claimLockedUntil: true,
        publicPoolTeamId: true,
        lastEffectiveFollowUpAt: true,
        remark: true,
      },
    });

    const tagInput = buildCandidateTagIds(candidate, tagMaps, businessCategoryTags);

    if (existing) {
      let updatedCustomer = existing;
      let updated = false;

      if (config.mergeExistingStrategy === "fill-empty") {
        const nextData = {};

        if ((!existing.name || existing.name === existing.phone) && candidate.name) {
          nextData.name = candidate.name;
        }
        if (!existing.address && candidate.address) {
          nextData.address = candidate.address;
        }
        if (!existing.province && candidate.province) {
          nextData.province = candidate.province;
        }
        if (!existing.city && candidate.city) {
          nextData.city = candidate.city;
        }
        if (!existing.district && candidate.district) {
          nextData.district = candidate.district;
        }

        const mergedRemark = appendLegacyRemark(existing.remark, remark, marker);
        if (mergedRemark !== existing.remark) {
          nextData.remark = mergedRemark;
        }

        if (Object.keys(nextData).length > 0) {
          updatedCustomer = await tx.customer.update({
            where: { id: existing.id },
            data: nextData,
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
              province: true,
              city: true,
              district: true,
              status: true,
              level: true,
              ownerId: true,
              ownershipMode: true,
              lastOwnerId: true,
              publicPoolEnteredAt: true,
              publicPoolReason: true,
              claimLockedUntil: true,
              publicPoolTeamId: true,
              lastEffectiveFollowUpAt: true,
              remark: true,
            },
          });
          updated = true;
        }
      }

      const assignedTagCodes = await upsertCustomerTagsTx(tx, {
        customerId: existing.id,
        tagIds: tagInput.tagIds,
        actorId: actor.id,
      });
      const signalSync = await ensureLegacyCustomerSignalTx(tx, {
        actorId: actor.id,
        batchId: config.filePath,
        rowNumber: candidate.rowNumber,
        customerId: existing.id,
        customerName: updatedCustomer.name,
        customerPhone: updatedCustomer.phone,
        salesId: updatedCustomer.ownerId ?? ownerUser?.id ?? actor.id,
        signal: importedSignal,
      });

      let ownershipAssigned = false;
      if (
        !existing.ownerId &&
        config.assignExistingUnownedToMappedOwner &&
        shouldAssignOwner
      ) {
        const before = buildOwnershipBeforeData(updatedCustomer);
        const nextClaimLockedUntil = addDays(new Date(), DEFAULT_CLAIM_PROTECTION_DAYS);

        updatedCustomer = await tx.customer.update({
          where: { id: existing.id },
          data: {
            ownerId: ownerUser.id,
            ownershipMode: CustomerOwnershipMode.PRIVATE,
            lastOwnerId: ownerUser.id,
            publicPoolEnteredAt: null,
            publicPoolReason: null,
            claimLockedUntil: nextClaimLockedUntil,
            publicPoolTeamId: ownerUser.teamId ?? actor.teamId,
          },
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            province: true,
            city: true,
            district: true,
            status: true,
            level: true,
            ownerId: true,
            ownershipMode: true,
            lastOwnerId: true,
            publicPoolEnteredAt: true,
            publicPoolReason: true,
            claimLockedUntil: true,
            publicPoolTeamId: true,
            lastEffectiveFollowUpAt: true,
            remark: true,
          },
        });

        await createOwnershipEventAndLogTx(tx, {
          actorId: actor.id,
          customerId: existing.id,
          before,
          after: updatedCustomer,
          reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
          note: `Legacy import matched existing customer at row ${candidate.rowNumber}.`,
          action: "customer.legacy_import.assigned_existing_unowned",
          description: `Assigned existing customer ${updatedCustomer.name} to ${ownerUser.name} during legacy import.`,
          logBeforeData: before,
          logAfterData: {
            ...buildOwnershipBeforeData(updatedCustomer),
            legacyImport: true,
            rowNumber: candidate.rowNumber,
            originalCustomerId: candidate.originalCustomerId || null,
            ownerCode: candidate.suggestedOwnerCode || null,
            tagCodes: assignedTagCodes,
            legacySnapshot: snapshot,
            importedSignal: signalSync,
          },
        });

        ownershipAssigned = true;
      } else {
        await tx.operationLog.create({
          data: {
            actorId: actor.id,
            module: OperationModule.CUSTOMER,
            action: "customer.legacy_import.matched_existing",
            targetType: OperationTargetType.CUSTOMER,
            targetId: existing.id,
            description: `Matched existing customer ${updatedCustomer.name} during legacy import.`,
            beforeData: {
              status: existing.status,
              level: existing.level,
              ownerId: existing.ownerId,
              ownershipMode: existing.ownershipMode,
            },
            afterData: {
              status: updatedCustomer.status,
              level: updatedCustomer.level,
              ownerId: updatedCustomer.ownerId,
              ownershipMode: updatedCustomer.ownershipMode,
              updatedFields: updated,
              rowNumber: candidate.rowNumber,
              originalCustomerId: candidate.originalCustomerId || null,
              ownerCode: candidate.suggestedOwnerCode || null,
              tagCodes: assignedTagCodes,
              legacySnapshot: snapshot,
              importedSignal: signalSync,
            },
          },
        });
      }

      report.summary.matchedExistingCustomers += 1;
      if (updated) {
        report.summary.updatedExistingCustomers += 1;
      }
      if (ownershipAssigned) {
        report.summary.assignedExistingUnownedCustomers += 1;
      }

      return;
    }

    if (shouldAssignOwner && config.assignNewCustomersToMappedOwner) {
      const nextClaimLockedUntil = addDays(new Date(), DEFAULT_CLAIM_PROTECTION_DAYS);

      const created = await tx.customer.create({
        data: {
          name: candidate.name,
          phone: candidate.phone,
          province: candidate.province,
          city: candidate.city,
          district: candidate.district,
          address: candidate.address,
          status: newCustomerStatus,
          level: newCustomerLevel,
          ownerId: ownerUser.id,
          ownershipMode: CustomerOwnershipMode.PRIVATE,
          lastOwnerId: ownerUser.id,
          claimLockedUntil: nextClaimLockedUntil,
          publicPoolTeamId: ownerUser.teamId ?? actor.teamId,
          remark,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          level: true,
          ownerId: true,
          ownershipMode: true,
          lastOwnerId: true,
          publicPoolEnteredAt: true,
          publicPoolReason: true,
          claimLockedUntil: true,
          publicPoolTeamId: true,
          lastEffectiveFollowUpAt: true,
        },
      });

      const assignedTagCodes = await upsertCustomerTagsTx(tx, {
        customerId: created.id,
        tagIds: tagInput.tagIds,
        actorId: actor.id,
      });
      const signalSync = await ensureLegacyCustomerSignalTx(tx, {
        actorId: actor.id,
        batchId: config.filePath,
        rowNumber: candidate.rowNumber,
        customerId: created.id,
        customerName: created.name,
        customerPhone: created.phone,
        salesId: created.ownerId ?? ownerUser?.id ?? actor.id,
        signal: importedSignal,
      });

      await createOwnershipEventAndLogTx(tx, {
        actorId: actor.id,
        customerId: created.id,
        before: {
          ownerId: null,
          ownershipMode: null,
          lastOwnerId: null,
          publicPoolEnteredAt: null,
          publicPoolReason: null,
          claimLockedUntil: null,
          publicPoolTeamId: null,
        },
        after: created,
        reason: CustomerOwnershipEventReason.SUPERVISOR_ASSIGN,
        note: `Legacy import created a private customer at row ${candidate.rowNumber}.`,
        action: "customer.legacy_import.created_private",
        description: `Created customer ${created.name} and assigned to ${ownerUser.name} during legacy import.`,
        logBeforeData: null,
        logAfterData: {
          ...buildOwnershipBeforeData(created),
          legacyImport: true,
          rowNumber: candidate.rowNumber,
          originalCustomerId: candidate.originalCustomerId || null,
          ownerCode: candidate.suggestedOwnerCode || null,
          tagCodes: assignedTagCodes,
          legacySnapshot: snapshot,
          status: created.status,
          level: created.level,
          importedSignal: signalSync,
        },
      });

      report.summary.createdCustomers += 1;
      report.summary.createdPrivateCustomers += 1;
      return;
    }

    const created = await tx.customer.create({
      data: {
        name: candidate.name,
        phone: candidate.phone,
        province: candidate.province,
        city: candidate.city,
        district: candidate.district,
        address: candidate.address,
        status: newCustomerStatus,
        level: newCustomerLevel,
        ownerId: null,
        ownershipMode: CustomerOwnershipMode.PUBLIC,
        lastOwnerId: null,
        publicPoolEnteredAt: new Date(),
        publicPoolReason: PublicPoolReason.UNASSIGNED_IMPORT,
        publicPoolTeamId: ownerUser?.teamId ?? actor.teamId,
        remark,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        level: true,
        ownerId: true,
        ownershipMode: true,
        lastOwnerId: true,
        publicPoolEnteredAt: true,
        publicPoolReason: true,
        claimLockedUntil: true,
        publicPoolTeamId: true,
        lastEffectiveFollowUpAt: true,
      },
    });

    const assignedTagCodes = await upsertCustomerTagsTx(tx, {
      customerId: created.id,
      tagIds: tagInput.tagIds,
      actorId: actor.id,
    });
    const signalSync = await ensureLegacyCustomerSignalTx(tx, {
      actorId: actor.id,
      batchId: config.filePath,
      rowNumber: candidate.rowNumber,
      customerId: created.id,
      customerName: created.name,
      customerPhone: created.phone,
      salesId: created.ownerId ?? ownerUser?.id ?? actor.id,
      signal: importedSignal,
    });

    await createOwnershipEventAndLogTx(tx, {
      actorId: actor.id,
      customerId: created.id,
      before: {
        ownerId: null,
        ownershipMode: null,
        lastOwnerId: null,
        publicPoolEnteredAt: null,
        publicPoolReason: null,
        claimLockedUntil: null,
        publicPoolTeamId: null,
      },
      after: created,
      reason: CustomerOwnershipEventReason.UNASSIGNED_IMPORT,
      note: `Legacy import created a public-pool customer at row ${candidate.rowNumber}.`,
      action: "customer.legacy_import.created_public",
      description: `Created customer ${created.name} in the public pool during legacy import.`,
      logBeforeData: null,
      logAfterData: {
        ...buildOwnershipBeforeData(created),
        legacyImport: true,
        rowNumber: candidate.rowNumber,
        originalCustomerId: candidate.originalCustomerId || null,
        ownerCode: candidate.suggestedOwnerCode || null,
        tagCodes: assignedTagCodes,
        legacySnapshot: snapshot,
        status: created.status,
        level: created.level,
        importedSignal: signalSync,
      },
    });

    report.summary.createdCustomers += 1;
    report.summary.createdPublicCustomers += 1;
  });
}

function registerUnresolvedOwnerCode(report, ownerCode, rowNumber) {
  if (!ownerCode) {
    return;
  }

  if (!report.unresolvedOwnerCodes[ownerCode]) {
    report.unresolvedOwnerCodes[ownerCode] = {
      count: 0,
      rowNumbers: [],
    };
  }

  report.unresolvedOwnerCodes[ownerCode].count += 1;
  if (report.unresolvedOwnerCodes[ownerCode].rowNumbers.length < 20) {
    report.unresolvedOwnerCodes[ownerCode].rowNumbers.push(rowNumber);
  }
}

async function writeReport(report, reportFile) {
  const absolutePath = path.resolve(reportFile);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(report, null, 2), "utf8");
  return absolutePath;
}

function defaultReportFilePath() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.resolve("reports", "legacy-customer-import", `report-${stamp}.json`);
}

async function main() {
  const args = parseArgs(process.argv);
  const config = await loadConfig(args.configPath);
  const report = createReport(args, config);

  const actor = await resolveActor(config);
  const ownerUsers = await resolveOwnerUsers(config, report);

  const rawRows = readWorkbookRows(config.filePath, config.sheetName, config.headerRowIndex);
  report.summary.scannedRows = rawRows.length;

  const parsedCandidates = rawRows.map(parseLegacyCandidate);
  const seenPhones = new Set();
  const eligibleCandidates = [];

  for (const candidate of parsedCandidates) {
    if (args.limit && eligibleCandidates.length >= args.limit) {
      break;
    }

    if (!candidate.phone) {
      report.summary.failedRows += 1;
      report.failures.push({
        rowNumber: candidate.rowNumber,
        originalCustomerId: candidate.originalCustomerId || null,
        reason: "INVALID_OR_MISSING_PHONE",
        rawPhone: candidate.rawPhone || null,
      });
      continue;
    }

    if (shouldSkipDuplicate(candidate, seenPhones, report)) {
      continue;
    }

    const ownerUser = candidate.suggestedOwnerCode
      ? ownerUsers.get(candidate.suggestedOwnerCode) ?? null
      : null;

    if (candidate.suggestedOwnerCode) {
      if (ownerUser) {
        report.summary.ownerCodesResolved += 1;
      } else {
        report.summary.ownerCodesUnresolved += 1;
        registerUnresolvedOwnerCode(report, candidate.suggestedOwnerCode, candidate.rowNumber);
      }
    }

    eligibleCandidates.push({
      candidate,
      ownerUser,
    });
  }

  report.summary.eligibleRows = eligibleCandidates.length;

  const tagMaps = await ensureLegacyTags(eligibleCandidates.map((item) => item.candidate));
  const businessCategoryTags = await resolveBusinessCategoryTags(
    eligibleCandidates.map((item) => item.candidate),
  );
  report.summary.tagsUpserted = tagMaps.totalTags;

  if (args.mode === MODE_DRY_RUN) {
    for (const item of eligibleCandidates) {
      const existing = await prisma.customer.findUnique({
        where: { phone: item.candidate.phone },
        select: {
          id: true,
          ownerId: true,
        },
      });

      if (existing) {
        report.summary.matchedExistingCustomers += 1;
        if (
          !existing.ownerId &&
          config.assignExistingUnownedToMappedOwner &&
          shouldAssignCandidate(item.candidate, item.ownerUser, config)
        ) {
          report.summary.assignedExistingUnownedCustomers += 1;
        }
        continue;
      }

      report.summary.createdCustomers += 1;
      if (
        config.assignNewCustomersToMappedOwner &&
        shouldAssignCandidate(item.candidate, item.ownerUser, config)
      ) {
        report.summary.createdPrivateCustomers += 1;
      } else {
        report.summary.createdPublicCustomers += 1;
      }
    }
  } else {
    for (const item of eligibleCandidates) {
      try {
        await processCandidateApply({
          actor,
          candidate: item.candidate,
          ownerUser: item.ownerUser,
          config,
          tagMaps,
          businessCategoryTags,
          report,
        });
      } catch (error) {
        report.summary.failedRows += 1;
        report.failures.push({
          rowNumber: item.candidate.rowNumber,
          originalCustomerId: item.candidate.originalCustomerId || null,
          phone: item.candidate.phone,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  report.meta.endedAt = new Date().toISOString();
  const reportFile = args.reportFile || defaultReportFilePath();
  const absoluteReportPath = await writeReport(report, reportFile);

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report written to ${absoluteReportPath}`);
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
