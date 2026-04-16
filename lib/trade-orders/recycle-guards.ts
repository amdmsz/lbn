import type { RecycleMoveGuard, RecycleReasonInputCode } from "@/lib/recycle-bin/types";

export type TradeOrderRecycleGuard = RecycleMoveGuard;
export type TradeOrderRecycleReasonCode = RecycleReasonInputCode;

export const TRADE_ORDER_RECYCLE_REASON_OPTIONS: Array<{
  value: TradeOrderRecycleReasonCode;
  label: string;
}> = [
  { value: "mistaken_creation", label: "误建草稿订单" },
  { value: "test_data", label: "测试数据" },
  { value: "duplicate", label: "重复创建" },
  { value: "no_longer_needed", label: "不再需要" },
  { value: "other", label: "其他原因" },
];
