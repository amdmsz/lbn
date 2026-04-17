import type { BatchActionBlockedReasonSummary } from "@/lib/batch-actions/base-contract";

export type CustomerRecycleBlockerGroupKey =
  | "customer_lifecycle"
  | "ownership_lifecycle"
  | "sales_engagement"
  | "transaction_chain"
  | "fulfillment_chain"
  | "import_audit"
  | "object_state"
  | "other";

export type CustomerRecycleBlockerLike = {
  code?: string;
  group?: string;
  name: string;
  description: string;
  suggestedAction?: string;
};

export type CustomerRecycleBlockedReasonSummary = BatchActionBlockedReasonSummary & {
  group: CustomerRecycleBlockerGroupKey;
  groupLabel: string;
  groupDescription: string;
  description: string;
  suggestedAction: string;
};

export type CustomerRecycleBlockerGroup = {
  key: CustomerRecycleBlockerGroupKey;
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

const customerRecycleBlockerGroupMeta = {
  customer_lifecycle: {
    title: "客户生命周期",
    description:
      "Customer recycle 只承接误建轻客户，不替代 DORMANT / LOST / BLACKLISTED。",
    suggestedAction: "改走 DORMANT / LOST / BLACKLISTED。",
  },
  ownership_lifecycle: {
    title: "公海与归属链",
    description:
      "客户一旦进入 public-pool / claim / release / ownership 保护链，就不应再按误建轻客户回收。",
    suggestedAction: "改走 public-pool / claim / release / recycle。",
  },
  sales_engagement: {
    title: "销售跟进链",
    description:
      "已经形成通话、微信、直播邀约或其他有效销售跟进痕迹时，应保留客户继续治理。",
    suggestedAction: "保留客户并继续跟进，必要时评估 public-pool。",
  },
  transaction_chain: {
    title: "交易与资金链",
    description:
      "客户一旦进入订单、支付、催收等交易链，必须保留交易真相与资金审计上下文。",
    suggestedAction: "保留客户并在订单 / 支付链治理。",
  },
  fulfillment_chain: {
    title: "履约与物流链",
    description:
      "客户一旦进入发货、物流、COD 等履约链，就不再适合按误建客户删除。",
    suggestedAction: "保留客户并在履约 / 物流链治理。",
  },
  import_audit: {
    title: "归并与导入审计",
    description:
      "涉及 merge、import、标签或其他审计链时，应优先保留上下文，而不是直接删除。",
    suggestedAction: "改走 merge / import 审计治理。",
  },
  object_state: {
    title: "对象状态",
    description: "先确认原始客户仍存在且仍在当前客户范围，再决定是否继续治理。",
    suggestedAction: "先确认客户仍在当前可见范围。",
  },
  other: {
    title: "其他阻断",
    description: "保留服务端返回的原始阻断项，不在前端额外重写业务规则。",
    suggestedAction: "结合当前阻断项继续治理。",
  },
} satisfies Record<
  CustomerRecycleBlockerGroupKey,
  {
    title: string;
    description: string;
    suggestedAction: string;
  }
>;

function normalizeCustomerRecycleBlockerGroup(
  group?: string,
): CustomerRecycleBlockerGroupKey {
  if (
    group === "customer_lifecycle" ||
    group === "ownership_lifecycle" ||
    group === "sales_engagement" ||
    group === "transaction_chain" ||
    group === "fulfillment_chain" ||
    group === "import_audit" ||
    group === "object_state"
  ) {
    return group;
  }

  return "other";
}

export function getCustomerRecycleBlockerGroupMeta(group?: string) {
  const key = normalizeCustomerRecycleBlockerGroup(group);
  const meta = customerRecycleBlockerGroupMeta[key];

  return {
    key,
    ...meta,
  };
}

export function explainCustomerRecycleBlocker(
  blocker: CustomerRecycleBlockerLike,
): CustomerRecycleBlockedReasonSummary {
  const groupMeta = getCustomerRecycleBlockerGroupMeta(blocker.group);

  return {
    code: blocker.code ?? `${groupMeta.key}:${blocker.name}`,
    label: blocker.name,
    count: 1,
    group: groupMeta.key,
    groupLabel: groupMeta.title,
    groupDescription: groupMeta.description,
    description: blocker.description,
    suggestedAction: blocker.suggestedAction?.trim() || groupMeta.suggestedAction,
  };
}

export function buildCustomerRecycleBlockerGroups(
  blockers: CustomerRecycleBlockerLike[],
): CustomerRecycleBlockerGroup[] {
  const groups = new Map<CustomerRecycleBlockerGroupKey, CustomerRecycleBlockerGroup>();

  for (const blocker of blockers) {
    const explained = explainCustomerRecycleBlocker(blocker);
    const current =
      groups.get(explained.group) ??
      ({
        key: explained.group,
        title: explained.groupLabel,
        description: explained.groupDescription,
        suggestedAction: explained.suggestedAction,
        items: [],
      } satisfies CustomerRecycleBlockerGroup);

    current.items.push({
      name: explained.label,
      description: explained.description,
      suggestedAction: explained.suggestedAction,
    });

    groups.set(explained.group, current);
  }

  return [...groups.values()];
}

export function buildCustomerRecycleBlockedReasonGroups(
  summaries: CustomerRecycleBlockedReasonSummary[],
): CustomerRecycleBlockerGroup[] {
  const groups = new Map<CustomerRecycleBlockerGroupKey, CustomerRecycleBlockerGroup>();

  for (const summary of summaries) {
    const current =
      groups.get(summary.group) ??
      ({
        key: summary.group,
        title: summary.groupLabel,
        description: summary.groupDescription,
        suggestedAction: summary.suggestedAction,
        items: [],
      } satisfies CustomerRecycleBlockerGroup);

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

export function explainCustomerRecycleErrorReason(
  input: {
    code: string;
    message: string;
  },
): CustomerRecycleBlockedReasonSummary {
  if (input.code === "customer_scope_missing") {
    const groupMeta = getCustomerRecycleBlockerGroupMeta("object_state");

    return {
      code: input.code,
      label: "客户范围变化",
      count: 1,
      group: groupMeta.key,
      groupLabel: groupMeta.title,
      groupDescription: groupMeta.description,
      description: input.message,
      suggestedAction: groupMeta.suggestedAction,
    };
  }

  const groupMeta = getCustomerRecycleBlockerGroupMeta("other");

  return {
    code: input.code,
    label: "回收判断失败",
    count: 1,
    group: groupMeta.key,
    groupLabel: groupMeta.title,
    groupDescription: groupMeta.description,
    description: input.message,
    suggestedAction: groupMeta.suggestedAction,
  };
}
