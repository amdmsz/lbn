import { UserStatus, type RoleCode } from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import { roleLabels } from "@/lib/auth/access";

type SearchParamsValue = string | string[] | undefined;

export const usersPageSize = 20;

export const accountManagementLinks = [
  {
    href: "/settings/users",
    title: "账号管理",
    description: "维护内部账号、临时密码、直属主管和启停状态。",
  },
  {
    href: "/settings/teams",
    title: "团队管理",
    description: "维护团队、团队主管和团队成员归属。",
  },
] as const;

export type AccountManagementNotice =
  | {
      tone: "success" | "danger";
      message: string;
    }
  | null;

export const userStatusOptions = [
  { value: "", label: "全部状态" },
  { value: UserStatus.ACTIVE, label: "启用中" },
  { value: UserStatus.INACTIVE, label: "已禁用" },
] as const;

export const roleFilterOptions = [
  { value: "", label: "全部角色" },
  { value: "ADMIN", label: roleLabels.ADMIN },
  { value: "SUPERVISOR", label: roleLabels.SUPERVISOR },
  { value: "SALES", label: roleLabels.SALES },
  { value: "OPS", label: roleLabels.OPS },
  { value: "SHIPPER", label: roleLabels.SHIPPER },
] as const satisfies ReadonlyArray<{ value: "" | RoleCode; label: string }>;

export function getRoleBadgeVariant(role: RoleCode): StatusBadgeVariant {
  switch (role) {
    case "ADMIN":
      return "warning";
    case "SUPERVISOR":
      return "info";
    case "SALES":
      return "success";
    case "OPS":
      return "neutral";
    case "SHIPPER":
      return "neutral";
    default:
      return "neutral";
  }
}

export function getUserStatusLabel(status: UserStatus) {
  return status === UserStatus.ACTIVE ? "启用中" : "已禁用";
}

export function getUserStatusVariant(status: UserStatus): StatusBadgeVariant {
  return status === UserStatus.ACTIVE ? "success" : "neutral";
}

export function getPasswordRequirementBadgeConfig(mustChangePassword: boolean): {
  label: string;
  variant: StatusBadgeVariant;
} {
  return mustChangePassword
    ? {
        label: "待首次改密",
        variant: "warning",
      }
    : {
        label: "密码状态正常",
        variant: "success",
      };
}

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function parseAccountManagementNotice(
  searchParams: Record<string, SearchParamsValue> | undefined,
): AccountManagementNotice {
  const status =
    getParamValue(searchParams?.noticeStatus) || getParamValue(searchParams?.status);
  const message =
    getParamValue(searchParams?.noticeMessage) || getParamValue(searchParams?.message);

  if (!message || (status !== "success" && status !== "error")) {
    return null;
  }

  return {
    tone: status === "success" ? "success" : "danger",
    message,
  };
}

export function formatDateTimeLabel(value: Date | null | undefined) {
  if (!value) {
    return "暂无记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
