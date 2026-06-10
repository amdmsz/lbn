import type { CallResultOption } from "@/lib/calls/metadata";

/**
 * 销售跟进弹窗 "本次结果" 的一排大按钮.
 *
 * 每个按钮 = 一次点击同时完成 "分类 + 通话结果", 直接映射到 lib/calls/metadata.ts
 * 里**现有**的 CallResult code (不新建枚举). 选中即提交该 result, 不再要单独下拉.
 *
 * 映射依据 (effectLevel / wechatSyncAction 在 metadata.ts 已自动驱动分类):
 * - 未接通      -> NOT_CONNECTED   (WEAK,     wechat NONE)
 * - 已加微信    -> WECHAT_ADDED    (STRONG,   wechat ADDED)
 * - 拒加        -> REFUSED_WECHAT  (NEGATIVE, wechat REFUSED)
 * - 接通·再跟   -> NEED_CALLBACK   (MEDIUM,   接通后继续跟, 保留 claim 保护)
 * - 空号        -> INVALID_NUMBER  (NEGATIVE, 派生 grade=F, 保存后自动离开待拨打队列)
 *
 * tone 仅用于选中态的柔和色块, 与上面 effectLevel 语义保持一致.
 */
export type FollowUpQuickResultTone = "neutral" | "success" | "danger";

export type FollowUpQuickResultDefinition = {
  /** 现有 CallResult code, 提交时写入 form 的 result 字段. */
  code: string;
  label: string;
  /** 选填副标题, 给销售一句话语义. */
  hint?: string;
  tone: FollowUpQuickResultTone;
};

export const FOLLOW_UP_QUICK_RESULTS: readonly FollowUpQuickResultDefinition[] = [
  { code: "NOT_CONNECTED", label: "未接通", tone: "neutral" },
  { code: "WECHAT_ADDED", label: "已加微信", tone: "success" },
  { code: "REFUSED_WECHAT", label: "拒加", tone: "danger" },
  { code: "NEED_CALLBACK", label: "接通·再跟", tone: "neutral" },
  { code: "INVALID_NUMBER", label: "空号", tone: "danger" },
] as const;

/**
 * 只保留服务端真实启用 (resultOptions 含该 code) 的快捷结果, 防止某个 system
 * result 被禁用时按钮点了提交报错. 按钮文案沿用上面的定稿短标签 (未接通 / 已加微信 /
 * 拒加 / 接通·再跟 / 空号), code 不变.
 */
export function buildFollowUpQuickResults(
  resultOptions: CallResultOption[],
): FollowUpQuickResultDefinition[] {
  const enabledCodes = new Set(resultOptions.map((option) => option.value));

  return FOLLOW_UP_QUICK_RESULTS.filter((item) => enabledCodes.has(item.code));
}

/** 提交的 result code 是否是 5 个快捷结果之一 (历史/分类展示可复用). */
export function isFollowUpQuickResultCode(code: string) {
  return FOLLOW_UP_QUICK_RESULTS.some((item) => item.code === code);
}
