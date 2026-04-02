import type { WechatAddStatus } from "@prisma/client";

export const wechatAddedStatusMeta: Record<WechatAddStatus, { label: string }> = {
  PENDING: { label: "加微待通过" },
  ADDED: { label: "已加微" },
  REJECTED: { label: "加微失败" },
  BLOCKED: { label: "已拉黑" },
};

export const wechatAddedStatusOptions = [
  { value: "PENDING", label: "加微待通过" },
  { value: "ADDED", label: "已加微" },
  { value: "REJECTED", label: "加微失败" },
  { value: "BLOCKED", label: "已拉黑" },
] as const;

export function getWechatAddedStatusLabel(status: WechatAddStatus) {
  return wechatAddedStatusMeta[status].label;
}

export function parseWechatTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatWechatTags(value: unknown) {
  if (!Array.isArray(value)) {
    return "无标签";
  }

  const items = value.filter((item) => typeof item === "string" && item.trim());

  if (items.length === 0) {
    return "无标签";
  }

  return items.join(" / ");
}
