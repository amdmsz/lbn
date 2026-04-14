import type { RecycleMoveGuard, RecycleReasonInputCode } from "@/lib/recycle-bin/types";

export type LeadRecycleGuard = RecycleMoveGuard;
export type LeadRecycleReasonCode = RecycleReasonInputCode;

export const LEAD_RECYCLE_REASON_OPTIONS: Array<{
  value: LeadRecycleReasonCode;
  label: string;
}> = [
  { value: "mistaken_creation", label: "误建线索" },
  { value: "test_data", label: "测试数据" },
  { value: "duplicate", label: "重复线索" },
  { value: "no_longer_needed", label: "不再继续承接" },
  { value: "other", label: "其他原因" },
];
