export const CUSTOMER_CONTINUATION_IMPORTED_SIGNAL_PREFIX = "[customer-import-signal]";
export const CUSTOMER_CONTINUATION_IMPORTED_WECHAT_ADDED_SUMMARY =
  `${CUSTOMER_CONTINUATION_IMPORTED_SIGNAL_PREFIX} 老系统映射：已加微信`;
export const CUSTOMER_CONTINUATION_IMPORTED_HUNG_UP_REMARK =
  `${CUSTOMER_CONTINUATION_IMPORTED_SIGNAL_PREFIX} 老系统映射：挂断（待回访）`;
export const CUSTOMER_CONTINUATION_IMPORTED_REFUSED_WECHAT_REMARK =
  `${CUSTOMER_CONTINUATION_IMPORTED_SIGNAL_PREFIX} 老系统映射：拒绝添加`;
export const CUSTOMER_CONTINUATION_IMPORTED_INVALID_NUMBER_REMARK =
  `${CUSTOMER_CONTINUATION_IMPORTED_SIGNAL_PREFIX} 老系统映射：空号/无效号码`;

export type CustomerContinuationSignalSummaryInput = {
  latestFollowUpResult?: string | null;
  latestIntent?: string | null;
  note?: string | null;
};

export type CustomerContinuationCategoryCode = "A" | "B" | "C" | "D";
export type CustomerContinuationCallResultCode =
  | "HUNG_UP"
  | "REFUSED_WECHAT"
  | "INVALID_NUMBER";
export type CustomerContinuationResolvedSignal =
  | {
      kind: "WECHAT_ADDED";
      marker: string;
      summary: string;
    }
  | {
      kind: "CALL_RESULT";
      marker: string;
      resultCode: CustomerContinuationCallResultCode;
      remark: string;
      nextFollowUpRequired: boolean;
    };
export type CustomerContinuationOutcomeBadge = {
  key:
    | "WECHAT_ADDED"
    | "PENDING_INVITATION"
    | "HUNG_UP"
    | "PENDING_CALLBACK"
    | "REFUSED_WECHAT"
    | "INVALID_NUMBER";
  label: string;
  variant: "neutral" | "info" | "success" | "warning" | "danger";
};

function getSignalSourceTexts(input: {
  tags: string[];
  summary: CustomerContinuationSignalSummaryInput;
}) {
  return [
    ...input.tags,
    input.summary.latestFollowUpResult ?? "",
    input.summary.latestIntent ?? "",
    input.summary.note ?? "",
  ];
}

export function normalizeLegacyCustomerImportText(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, "") ?? "";
}

export function splitCustomerContinuationValues(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(/[,\n，；;|]/).map((item) => item.trim()).filter(Boolean))];
}

export function buildImportedTagLookupCandidates(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = normalizeLegacyCustomerImportText(trimmed);
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

export function collectCustomerContinuationCategories(input: {
  tags: string[];
  summary: CustomerContinuationSignalSummaryInput;
}) {
  const normalizedTexts = getSignalSourceTexts(input)
    .map((value) => normalizeLegacyCustomerImportText(value))
    .filter(Boolean);

  const categories: CustomerContinuationCategoryCode[] = [];

  if (normalizedTexts.some((value) => value.includes("a类") || value === "a")) {
    categories.push("A");
  }
  if (normalizedTexts.some((value) => value.includes("b类") || value === "b")) {
    categories.push("B");
  }
  if (normalizedTexts.some((value) => value.includes("c类") || value === "c")) {
    categories.push("C");
  }
  if (normalizedTexts.some((value) => value.includes("d类") || value === "d")) {
    categories.push("D");
  }

  return categories;
}

export function isCustomerContinuationSignalOnlyTagValue(value: string) {
  const normalized = normalizeLegacyCustomerImportText(value);

  return [
    "已加微信",
    "跟进客户",
    "未接通",
    "未接",
    "拒接",
    "拒绝添加",
    "无效客户",
    "空号",
    "停机",
    "无效号码",
  ].some((pattern) => normalized.includes(pattern));
}

export function buildCustomerContinuationTagLookupSet(values: Iterable<string>) {
  return new Set(
    [...values]
      .map((value) => normalizeLegacyCustomerImportText(value))
      .filter(Boolean),
  );
}

export function hasMatchingImportedTag(
  value: string,
  lookupValues: ReadonlySet<string>,
) {
  return buildImportedTagLookupCandidates(value).some((candidate) =>
    lookupValues.has(normalizeLegacyCustomerImportText(candidate)),
  );
}

export function resolveCustomerContinuationSignal(input: {
  tags: string[];
  summary: CustomerContinuationSignalSummaryInput;
}) {
  const normalizedTexts = getSignalSourceTexts(input)
    .map((value) => normalizeLegacyCustomerImportText(value))
    .filter(Boolean);

  if (normalizedTexts.length === 0) {
    return null;
  }

  const matches = (patterns: string[]) =>
    normalizedTexts.some((value) => patterns.some((pattern) => value.includes(pattern)));

  if (matches(["无效客户", "空号", "停机", "无效号码"])) {
    return {
      kind: "CALL_RESULT",
      marker: CUSTOMER_CONTINUATION_IMPORTED_INVALID_NUMBER_REMARK,
      resultCode: "INVALID_NUMBER",
      remark: CUSTOMER_CONTINUATION_IMPORTED_INVALID_NUMBER_REMARK,
      nextFollowUpRequired: false,
    } satisfies CustomerContinuationResolvedSignal;
  }

  if (matches(["拒绝添加"])) {
    return {
      kind: "CALL_RESULT",
      marker: CUSTOMER_CONTINUATION_IMPORTED_REFUSED_WECHAT_REMARK,
      resultCode: "REFUSED_WECHAT",
      remark: CUSTOMER_CONTINUATION_IMPORTED_REFUSED_WECHAT_REMARK,
      nextFollowUpRequired: false,
    } satisfies CustomerContinuationResolvedSignal;
  }

  if (matches(["跟进客户", "未接通", "未接", "拒接"])) {
    return {
      kind: "CALL_RESULT",
      marker: CUSTOMER_CONTINUATION_IMPORTED_HUNG_UP_REMARK,
      resultCode: "HUNG_UP",
      remark: CUSTOMER_CONTINUATION_IMPORTED_HUNG_UP_REMARK,
      nextFollowUpRequired: true,
    } satisfies CustomerContinuationResolvedSignal;
  }

  if (matches(["已加微信", "a类", "b类", "c类", "d类"])) {
    return {
      kind: "WECHAT_ADDED",
      marker: CUSTOMER_CONTINUATION_IMPORTED_WECHAT_ADDED_SUMMARY,
      summary: CUSTOMER_CONTINUATION_IMPORTED_WECHAT_ADDED_SUMMARY,
    } satisfies CustomerContinuationResolvedSignal;
  }

  return null;
}

export function getCustomerContinuationOutcomeBadges(input: {
  tags: string[];
  summary: CustomerContinuationSignalSummaryInput;
}) {
  const categories = collectCustomerContinuationCategories(input);
  const signal = resolveCustomerContinuationSignal(input);
  const badges: CustomerContinuationOutcomeBadge[] = [];

  if (signal?.kind === "WECHAT_ADDED") {
    badges.push({
      key: "WECHAT_ADDED",
      label: "已加微信",
      variant: "success",
    });

    if (categories.includes("D")) {
      badges.push({
        key: "PENDING_INVITATION",
        label: "待邀约",
        variant: "info",
      });
    }

    return badges;
  }

  if (signal?.kind === "CALL_RESULT" && signal.resultCode === "HUNG_UP") {
    badges.push({
      key: "HUNG_UP",
      label: "挂断",
      variant: "warning",
    });
    badges.push({
      key: "PENDING_CALLBACK",
      label: "待回访",
      variant: "info",
    });
    return badges;
  }

  if (signal?.kind === "CALL_RESULT" && signal.resultCode === "REFUSED_WECHAT") {
    badges.push({
      key: "REFUSED_WECHAT",
      label: "拒绝添加",
      variant: "danger",
    });
    return badges;
  }

  if (signal?.kind === "CALL_RESULT" && signal.resultCode === "INVALID_NUMBER") {
    badges.push({
      key: "INVALID_NUMBER",
      label: "无效号码",
      variant: "danger",
    });
    return badges;
  }

  return badges;
}
