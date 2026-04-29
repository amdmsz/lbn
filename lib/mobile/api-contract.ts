export const mobileCustomerLevels = ["A", "B", "C", "D", "E"] as const;

export type MobileCustomerLevel = (typeof mobileCustomerLevels)[number];

export type MobileCallSignal = {
  callTime: Date;
  result?: string | null;
  resultCode?: string | null;
};

export type MobilePagination = {
  page: number;
  limit: number;
  skip: number;
};

const DEFAULT_MOBILE_PAGE_LIMIT = 20;
const MAX_MOBILE_PAGE_LIMIT = 50;

const nonConnectedCallResultCodes = ["NOT_CONNECTED", "INVALID_NUMBER", "HUNG_UP"] as const;

export function maskMobilePhone(phone: string | null | undefined) {
  const raw = phone?.trim() ?? "";

  if (!raw) {
    return "";
  }

  const digits = normalizePhoneDigits(raw.replace(/\D/g, ""));

  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }

  if (raw.length <= 2) {
    return "*".repeat(raw.length);
  }

  return `${raw.slice(0, 1)}****${raw.slice(-1)}`;
}

function normalizePhoneDigits(digits: string) {
  if (digits.length === 13 && digits.startsWith("86")) {
    return digits.slice(2);
  }

  if (digits.length === 14 && digits.startsWith("086")) {
    return digits.slice(3);
  }

  return digits;
}

export function resolveMobileCustomerLevel(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/类$/, "") ?? "";

  return mobileCustomerLevels.includes(normalized as MobileCustomerLevel)
    ? (normalized as MobileCustomerLevel)
    : null;
}

export function resolveMobileCustomerLevels(value: string | null | undefined) {
  const levels = new Set<MobileCustomerLevel>();

  for (const item of value?.split(/[,，]/) ?? []) {
    const level = resolveMobileCustomerLevel(item);

    if (level) {
      levels.add(level);
    }
  }

  return Array.from(levels);
}

function resolveCallSignalCode(record: MobileCallSignal | null | undefined) {
  return record?.resultCode?.trim() || record?.result || null;
}

export function getLatestMobileCallSignal(records: readonly MobileCallSignal[]) {
  return records.reduce<MobileCallSignal | null>((latest, record) => {
    if (!resolveCallSignalCode(record)) {
      return latest;
    }

    if (!latest || record.callTime.getTime() > latest.callTime.getTime()) {
      return record;
    }

    return latest;
  }, null);
}

export function deriveMobileCustomerLevelFromSignals(input: {
  approvedTradeOrderCount: number;
  hasLiveInvitation: boolean;
  hasSuccessfulWechatSignal: boolean;
  latestCall: MobileCallSignal | null;
}): MobileCustomerLevel {
  if (input.approvedTradeOrderCount >= 2) {
    return "A";
  }

  const latestCallSignalCode = resolveCallSignalCode(input.latestCall);

  if (latestCallSignalCode === "REFUSED_WECHAT") {
    return "E";
  }

  if (input.hasLiveInvitation) {
    return "C";
  }

  if (input.hasSuccessfulWechatSignal) {
    return "B";
  }

  if (
    latestCallSignalCode &&
    nonConnectedCallResultCodes.includes(
      latestCallSignalCode as (typeof nonConnectedCallResultCodes)[number],
    )
  ) {
    return "D";
  }

  return "D";
}

export function parseMobilePagination(searchParams: URLSearchParams): MobilePagination {
  const page = parsePositiveInteger(searchParams.get("page"), 1);
  const limit = parsePositiveInteger(
    searchParams.get("limit"),
    DEFAULT_MOBILE_PAGE_LIMIT,
    MAX_MOBILE_PAGE_LIMIT,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maxValue = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maxValue);
}

export function getLocalDayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const next = new Date(start);
  next.setDate(next.getDate() + 1);

  return { start, next };
}

export function getLocalMonthRange(now = new Date()) {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const next = new Date(start);
  next.setMonth(next.getMonth() + 1);

  return { start, next };
}

export function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function toDecimalString(value: { toString(): string } | null | undefined) {
  return value?.toString() ?? "0";
}
