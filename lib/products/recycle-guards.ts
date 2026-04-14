export type MasterDataRecycleReasonCode =
  | "mistaken_creation"
  | "test_data"
  | "duplicate"
  | "no_longer_needed"
  | "other";

export const MASTER_DATA_RECYCLE_REASON_OPTIONS: Array<{
  value: MasterDataRecycleReasonCode;
  label: string;
}> = [
  { value: "mistaken_creation", label: "\u8bef\u5efa\u5bf9\u8c61" },
  { value: "test_data", label: "\u6d4b\u8bd5\u6570\u636e" },
  { value: "duplicate", label: "\u91cd\u590d\u521b\u5efa" },
  { value: "no_longer_needed", label: "\u4e0d\u518d\u4f7f\u7528" },
  { value: "other", label: "\u5176\u4ed6\u539f\u56e0" },
];

export type RecycleBlockerItem = {
  name: string;
  count: number;
  blocksMoveToRecycleBin: boolean;
  blocksPermanentDelete: boolean;
  description: string;
};

export type MasterDataRecycleGuard = {
  canMoveToRecycleBin: boolean;
  fallbackActionLabel: string;
  blockerSummary: string;
  blockers: RecycleBlockerItem[];
  futureRestoreBlockers: string[];
};

function buildGuard(
  blockers: RecycleBlockerItem[],
  fallbackActionLabel: string,
  emptySummary: string,
) {
  const activeBlockers = blockers.filter((item) => item.count > 0);

  return {
    canMoveToRecycleBin: activeBlockers.length === 0,
    fallbackActionLabel,
    blockerSummary:
      activeBlockers.length === 0
        ? emptySummary
        : activeBlockers.map((item) => item.description).join("\uff1b"),
    blockers: activeBlockers,
    futureRestoreBlockers: [] as string[],
  } satisfies MasterDataRecycleGuard;
}

export function buildProductRecycleGuard(input: {
  skuCount: number;
  salesOrderItemCount: number;
}): MasterDataRecycleGuard {
  return buildGuard(
    [
      {
        name: "\u5546\u54c1\u6302\u8f7d\u4e2d\u7684 SKU",
        count: input.skuCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u4ecd\u6709 ${input.skuCount} \u4e2a SKU \u6302\u8f7d\u5728\u8be5\u5546\u54c1\u4e0b`,
      },
      {
        name: "\u9500\u552e\u660e\u7ec6\u5f15\u7528",
        count: input.salesOrderItemCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u5df2\u88ab\u9500\u552e\u660e\u7ec6\u5f15\u7528 ${input.salesOrderItemCount} \u6b21\uff0c\u8bf4\u660e\u8be5\u5546\u54c1\u5df2\u8fdb\u5165\u4ea4\u6613\u94fe`,
      },
    ],
    "\u6539\u4e3a\u505c\u7528\u5546\u54c1",
    "\u5f53\u524d\u672a\u53d1\u73b0 SKU \u6216\u9500\u552e\u5f15\u7528\uff0c\u6ee1\u8db3\u5546\u54c1\u79fb\u5165\u56de\u6536\u7ad9\u7684\u57fa\u7840\u6761\u4ef6\u3002",
  );
}

export function buildProductSkuRecycleGuard(input: {
  salesOrderItemCount: number;
}): MasterDataRecycleGuard {
  return buildGuard(
    [
      {
        name: "\u9500\u552e\u660e\u7ec6\u5f15\u7528",
        count: input.salesOrderItemCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u5df2\u88ab\u9500\u552e\u660e\u7ec6\u5f15\u7528 ${input.salesOrderItemCount} \u6b21\uff0c\u8bf4\u660e\u8be5 SKU \u5df2\u8fdb\u5165\u6b63\u5f0f\u4f7f\u7528`,
      },
    ],
    "\u6539\u4e3a\u505c\u7528 SKU",
    "\u5f53\u524d\u672a\u53d1\u73b0\u9500\u552e\u660e\u7ec6\u5f15\u7528\uff0c\u6ee1\u8db3\u8bef\u5efa SKU \u79fb\u5165\u56de\u6536\u7ad9\u7684\u57fa\u7840\u6761\u4ef6\u3002",
  );
}

export function buildSupplierRecycleGuard(input: {
  productCount: number;
  salesOrderCount: number;
  shippingTaskCount: number;
  exportBatchCount: number;
}): MasterDataRecycleGuard {
  return buildGuard(
    [
      {
        name: "\u5546\u54c1\u6302\u8f7d",
        count: input.productCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u4ecd\u6709 ${input.productCount} \u4e2a\u5546\u54c1\u6302\u8f7d\u5728\u8be5\u4f9b\u5e94\u5546\u4e0b`,
      },
      {
        name: "\u9500\u552e\u5b50\u5355\u5f15\u7528",
        count: input.salesOrderCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u5df2\u88ab\u9500\u552e\u5b50\u5355\u5f15\u7528 ${input.salesOrderCount} \u6b21\uff0c\u8bf4\u660e\u8be5\u4f9b\u5e94\u5546\u5df2\u8fdb\u5165\u4f9b\u8d27\u94fe`,
      },
      {
        name: "\u5c65\u7ea6\u4efb\u52a1\u5f15\u7528",
        count: input.shippingTaskCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u5df2\u88ab\u5c65\u7ea6\u4efb\u52a1\u5f15\u7528 ${input.shippingTaskCount} \u6b21`,
      },
      {
        name: "\u5bfc\u51fa\u6279\u6b21\u5f15\u7528",
        count: input.exportBatchCount,
        blocksMoveToRecycleBin: true,
        blocksPermanentDelete: true,
        description: `\u5df2\u88ab\u5bfc\u51fa\u6279\u6b21\u5f15\u7528 ${input.exportBatchCount} \u6b21`,
      },
    ],
    "\u6539\u4e3a\u505c\u7528\u4f9b\u5e94\u5546",
    "\u5f53\u524d\u672a\u53d1\u73b0\u5546\u54c1\u3001\u9500\u552e\u6216\u5c65\u7ea6\u5f15\u7528\uff0c\u6ee1\u8db3\u8bef\u5efa\u4f9b\u5e94\u5546\u79fb\u5165\u56de\u6536\u7ad9\u7684\u57fa\u7840\u6761\u4ef6\u3002",
  );
}
