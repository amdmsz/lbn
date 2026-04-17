export type TradeOrderRecycleBlockerGroupKey =
  | "order_state"
  | "review_split"
  | "payment_collection"
  | "fulfillment_execution"
  | "export_audit"
  | "logistics_cod"
  | "object_state"
  | "other";

export type TradeOrderRecycleBlockerLike = {
  code?: string;
  group?: string;
  name: string;
  description: string;
  suggestedAction?: string;
  count?: number;
};

export type TradeOrderRecycleBlockedReasonSummary = {
  code: string;
  label: string;
  count: number;
  group: TradeOrderRecycleBlockerGroupKey;
  groupLabel: string;
  groupDescription: string;
  description: string;
  suggestedAction: string;
};

export type TradeOrderRecycleBlockerGroup = {
  key: TradeOrderRecycleBlockerGroupKey;
  title: string;
  description: string;
  suggestedAction: string;
  items: Array<{
    name: string;
    description: string;
    suggestedAction: string;
    count?: number;
  }>;
};

const tradeOrderRecycleBlockerGroupMeta = {
  order_state: {
    title: "订单状态",
    description:
      "只有纯草稿误建 TradeOrder 才适合进入 recycle。非草稿、已取消或已经离开草稿态的订单，应改走取消 / 作废治理链。",
    suggestedAction: "改走取消 / 作废",
  },
  review_split: {
    title: "审核 / 拆单",
    description:
      "一旦订单已经进入审核、驳回回写或拆出 supplier 子单，就不再属于可按误建草稿删除的范围。",
    suggestedAction: "改走取消 / 作废，并保留订单治理链",
  },
  payment_collection: {
    title: "支付 / 收款",
    description:
      "订单一旦进入支付计划、收款记录或催收任务链路，就必须保留交易与资金真相，不应再按误建删除。",
    suggestedAction: "保留订单并在支付 / 收款链治理",
  },
  fulfillment_execution: {
    title: "履约执行",
    description:
      "订单一旦进入发货任务或履约执行链，就应继续在履约治理中处理，而不是按误建回收。",
    suggestedAction: "保留订单并在履约执行链治理",
  },
  export_audit: {
    title: "导出审计",
    description:
      "进入导出批次或执行审计上下文后，需要保留导出与审计语义，不能再把订单当成误建草稿处理。",
    suggestedAction: "保留订单并在导出审计链治理",
  },
  logistics_cod: {
    title: "物流 / COD",
    description:
      "订单一旦进入物流跟进或 COD 回款链，就必须保留履约与回款真相，不应再做误建回收。",
    suggestedAction: "保留订单并在物流 / COD 链治理",
  },
  object_state: {
    title: "对象状态",
    description: "先确认原始 TradeOrder 仍存在，再决定是否继续 restore、finalize 或其它治理动作。",
    suggestedAction: "先确认订单仍存在，再决定是否继续治理",
  },
  other: {
    title: "其他兜底",
    description: "保留服务端返回的原始阻断项，不在解释层重写额外业务规则。",
    suggestedAction: "结合当前阻断项继续治理",
  },
} satisfies Record<
  TradeOrderRecycleBlockerGroupKey,
  {
    title: string;
    description: string;
    suggestedAction: string;
  }
>;

function normalizeTradeOrderRecycleBlockerGroup(
  group?: string,
): TradeOrderRecycleBlockerGroupKey {
  if (
    group === "order_state" ||
    group === "review_split" ||
    group === "payment_collection" ||
    group === "fulfillment_execution" ||
    group === "export_audit" ||
    group === "logistics_cod" ||
    group === "object_state"
  ) {
    return group;
  }

  return "other";
}

function resolveTradeOrderRecycleBlockerGroupByName(
  name: string,
): TradeOrderRecycleBlockerGroupKey {
  if (name === "对象缺失") {
    return "object_state";
  }

  if (
    name === "订单已离开草稿态" ||
    name === "已取消订单" ||
    name === "非草稿订单"
  ) {
    return "order_state";
  }

  if (name === "已生成供应商子单") {
    return "review_split";
  }

  if (
    name === "已存在支付计划" ||
    name === "已存在支付记录" ||
    name === "已存在催收任务"
  ) {
    return "payment_collection";
  }

  if (name === "已存在发货任务") {
    return "fulfillment_execution";
  }

  if (name === "已存在导出批次行") {
    return "export_audit";
  }

  if (name === "已存在物流跟进" || name === "已存在 COD 回款记录") {
    return "logistics_cod";
  }

  return "other";
}

function resolveTradeOrderRecycleBlockerGroup(
  blocker: Pick<TradeOrderRecycleBlockerLike, "group" | "name">,
): TradeOrderRecycleBlockerGroupKey {
  const normalizedGroup = normalizeTradeOrderRecycleBlockerGroup(blocker.group);

  if (normalizedGroup !== "other") {
    return normalizedGroup;
  }

  return resolveTradeOrderRecycleBlockerGroupByName(blocker.name);
}

export function getTradeOrderRecycleBlockerGroupMeta(
  blocker: Pick<TradeOrderRecycleBlockerLike, "group" | "name">,
) {
  const key = resolveTradeOrderRecycleBlockerGroup(blocker);
  const meta = tradeOrderRecycleBlockerGroupMeta[key];

  return {
    key,
    ...meta,
  };
}

export function explainTradeOrderRecycleBlocker(
  blocker: TradeOrderRecycleBlockerLike,
): TradeOrderRecycleBlockedReasonSummary {
  const groupMeta = getTradeOrderRecycleBlockerGroupMeta(blocker);

  return {
    code: blocker.code ?? `${groupMeta.key}:${blocker.name}`,
    label: blocker.name,
    count: typeof blocker.count === "number" ? blocker.count : 1,
    group: groupMeta.key,
    groupLabel: groupMeta.title,
    groupDescription: groupMeta.description,
    description: blocker.description,
    suggestedAction: blocker.suggestedAction?.trim() || groupMeta.suggestedAction,
  };
}

export function buildTradeOrderRecycleBlockerGroups(
  blockers: TradeOrderRecycleBlockerLike[],
): TradeOrderRecycleBlockerGroup[] {
  const groups = new Map<TradeOrderRecycleBlockerGroupKey, TradeOrderRecycleBlockerGroup>();

  for (const blocker of blockers) {
    const explained = explainTradeOrderRecycleBlocker(blocker);
    const current =
      groups.get(explained.group) ??
      ({
        key: explained.group,
        title: explained.groupLabel,
        description: explained.groupDescription,
        suggestedAction: explained.suggestedAction,
        items: [],
      } satisfies TradeOrderRecycleBlockerGroup);

    current.items.push({
      name: explained.label,
      description: explained.description,
      suggestedAction: explained.suggestedAction,
      count: typeof blocker.count === "number" ? blocker.count : undefined,
    });

    groups.set(explained.group, current);
  }

  return [...groups.values()];
}

export function buildTradeOrderRecycleBlockedReasonGroups(
  summaries: TradeOrderRecycleBlockedReasonSummary[],
): TradeOrderRecycleBlockerGroup[] {
  const groups = new Map<TradeOrderRecycleBlockerGroupKey, TradeOrderRecycleBlockerGroup>();

  for (const summary of summaries) {
    const current =
      groups.get(summary.group) ??
      ({
        key: summary.group,
        title: summary.groupLabel,
        description: summary.groupDescription,
        suggestedAction: summary.suggestedAction,
        items: [],
      } satisfies TradeOrderRecycleBlockerGroup);

    current.items.push({
      name: summary.label,
      description: summary.description,
      suggestedAction: summary.suggestedAction,
      count: summary.count,
    });

    groups.set(summary.group, current);
  }

  return [...groups.values()];
}
