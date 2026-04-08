import type { StatusBadgeVariant } from "@/components/shared/status-badge";

export const extraPermissionCodes = [
  "LIVE_SESSION_MANAGE",
  "PRODUCT_MANAGE",
] as const;

export type ExtraPermissionCode = (typeof extraPermissionCodes)[number];

const extraPermissionMeta: Record<
  ExtraPermissionCode,
  {
    label: string;
    description: string;
    variant: StatusBadgeVariant;
  }
> = {
  LIVE_SESSION_MANAGE: {
    label: "直播场次维护",
    description: "可访问并维护直播场次模块，包括创建和更新直播场次基础信息。",
    variant: "info",
  },
  PRODUCT_MANAGE: {
    label: "商品与供货商维护",
    description: "可访问商品中心，并维护商品、SKU 与供货商主数据。",
    variant: "warning",
  },
};

export const extraPermissionOptions = extraPermissionCodes.map((code) => ({
  code,
  label: extraPermissionMeta[code].label,
  description: extraPermissionMeta[code].description,
})) satisfies ReadonlyArray<{
  code: ExtraPermissionCode;
  label: string;
  description: string;
}>;

export function hasExtraPermission(
  permissionCodes: readonly ExtraPermissionCode[] | null | undefined,
  permissionCode: ExtraPermissionCode,
) {
  return permissionCodes?.includes(permissionCode) ?? false;
}

export function normalizeExtraPermissionCodes(
  permissionCodes: readonly string[] | null | undefined,
): ExtraPermissionCode[] {
  return extraPermissionCodes.filter((code) => permissionCodes?.includes(code));
}

export function getExtraPermissionLabel(permissionCode: ExtraPermissionCode) {
  return extraPermissionMeta[permissionCode].label;
}

export function getExtraPermissionDescription(permissionCode: ExtraPermissionCode) {
  return extraPermissionMeta[permissionCode].description;
}

export function getExtraPermissionVariant(
  permissionCode: ExtraPermissionCode,
): StatusBadgeVariant {
  return extraPermissionMeta[permissionCode].variant;
}
