import type { LiveSessionStatus } from "@prisma/client";

export type LiveSessionRecycleReasonCode =
  | "mistaken_creation"
  | "test_data"
  | "duplicate"
  | "no_longer_needed"
  | "other";

export const LIVE_SESSION_RECYCLE_REASON_OPTIONS: Array<{
  value: LiveSessionRecycleReasonCode;
  label: string;
}> = [
  { value: "mistaken_creation", label: "\u8bef\u5efa\u573a\u6b21" },
  { value: "test_data", label: "\u6d4b\u8bd5\u6570\u636e" },
  { value: "duplicate", label: "\u91cd\u590d\u521b\u5efa" },
  { value: "no_longer_needed", label: "\u4e0d\u518d\u4f7f\u7528" },
  { value: "other", label: "\u5176\u4ed6\u539f\u56e0" },
];

export type LiveSessionRecycleFallbackAction = "cancel" | "archive" | "none";

export type LiveSessionRecycleBlockerItem = {
  name: string;
  count: number;
  blocksMoveToRecycleBin: boolean;
  blocksPermanentDelete: boolean;
  description: string;
};

export type LiveSessionRecycleGuard = {
  canMoveToRecycleBin: boolean;
  fallbackAction: LiveSessionRecycleFallbackAction;
  fallbackActionLabel: string;
  blockerSummary: string;
  blockers: LiveSessionRecycleBlockerItem[];
  futureRestoreBlockers: string[];
};

export type LiveSessionPrimaryLifecycleAction = {
  intent: Exclude<LiveSessionRecycleFallbackAction, "none">;
  label: string;
};

function buildFallbackMeta(
  status: LiveSessionStatus,
): Pick<LiveSessionRecycleGuard, "fallbackAction" | "fallbackActionLabel"> {
  if (status === "DRAFT" || status === "SCHEDULED") {
    return {
      fallbackAction: "cancel",
      fallbackActionLabel: "\u6539\u4e3a\u53d6\u6d88\u573a\u6b21",
    };
  }

  if (status === "LIVE") {
    return {
      fallbackAction: "archive",
      fallbackActionLabel: "\u6539\u4e3a\u5f52\u6863\u573a\u6b21",
    };
  }

  if (status === "CANCELED") {
    return {
      fallbackAction: "none",
      fallbackActionLabel: "\u5f53\u524d\u573a\u6b21\u5df2\u53d6\u6d88",
    };
  }

  return {
    fallbackAction: "none",
    fallbackActionLabel: "\u5f53\u524d\u573a\u6b21\u5df2\u4f5c\u4e3a\u5386\u53f2\u4fdd\u7559",
  };
}

export function getLiveSessionPrimaryLifecycleAction(
  status: LiveSessionStatus,
): LiveSessionPrimaryLifecycleAction | null {
  if (status === "DRAFT" || status === "SCHEDULED") {
    return {
      intent: "cancel",
      label: "\u53d6\u6d88\u573a\u6b21",
    };
  }

  if (status === "LIVE") {
    return {
      intent: "archive",
      label: "\u5f52\u6863\u573a\u6b21",
    };
  }

  return null;
}

export function buildLiveSessionRecycleGuard(input: {
  status: LiveSessionStatus;
  invitationCount: number;
  giftRecordCount: number;
  engagementResultCount: number;
}) {
  const blockers: LiveSessionRecycleBlockerItem[] = [
    {
      name: "\u9080\u7ea6\u8bb0\u5f55",
      count: input.invitationCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `\u5df2\u6709 ${input.invitationCount} \u6761\u9080\u7ea6\u8bb0\u5f55\uff0c\u8bf4\u660e\u8be5\u573a\u6b21\u5df2\u8fdb\u5165\u5ba2\u6237\u8fd0\u8425\u94fe`,
    },
    {
      name: "\u793c\u54c1\u8bb0\u5f55",
      count: input.giftRecordCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `\u5df2\u6709 ${input.giftRecordCount} \u6761\u793c\u54c1\u8bb0\u5f55\uff0c\u5e94\u7ee7\u7eed\u4f5c\u4e3a\u5386\u53f2\u573a\u6b21\u4fdd\u7559`,
    },
    {
      name: "\u89c2\u770b\u6216\u5230\u573a\u7ed3\u679c",
      count: input.engagementResultCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `\u5df2\u4ea7\u751f ${input.engagementResultCount} \u6761\u5230\u573a\u3001\u89c2\u770b\u6216\u8fbe\u6807\u7ed3\u679c`,
    },
    {
      name: "\u6b63\u5f0f\u8fd0\u8425\u5386\u53f2",
      count: input.status === "LIVE" || input.status === "ENDED" ? 1 : 0,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description:
        input.status === "LIVE"
          ? "\u8be5\u573a\u6b21\u5df2\u8fdb\u5165\u76f4\u64ad\u6267\u884c\u72b6\u6001\uff0c\u66f4\u9002\u5408\u5f52\u6863\u4fdd\u7559"
          : "\u8be5\u573a\u6b21\u5df2\u4f5c\u4e3a\u5386\u53f2\u573a\u6b21\u4fdd\u7559",
    },
  ];

  const activeBlockers = blockers.filter((item) => item.count > 0);
  const fallbackMeta = buildFallbackMeta(input.status);

  return {
    canMoveToRecycleBin: activeBlockers.length === 0,
    fallbackAction: fallbackMeta.fallbackAction,
    fallbackActionLabel: fallbackMeta.fallbackActionLabel,
    blockerSummary:
      activeBlockers.length === 0
        ? "\u5f53\u524d\u672a\u53d1\u73b0\u9080\u7ea6\u3001\u793c\u54c1\u6216\u8fd0\u8425\u7ed3\u679c\u5f15\u7528\uff0c\u6ee1\u8db3\u8bef\u5efa\u573a\u6b21\u8fdb\u5165\u56de\u6536\u7ad9\u7684\u57fa\u7840\u6761\u4ef6\u3002"
        : activeBlockers.map((item) => item.description).join("\uff1b"),
    blockers: activeBlockers,
    futureRestoreBlockers: [],
  } satisfies LiveSessionRecycleGuard;
}
