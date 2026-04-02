import type {
  AttendanceStatus,
  InvitationMethod,
  InvitationStatus,
  LiveSessionStatus,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

export const liveSessionStatusMeta: Record<
  LiveSessionStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  DRAFT: { label: "草稿", variant: "neutral" },
  SCHEDULED: { label: "已排期", variant: "info" },
  LIVE: { label: "直播中", variant: "warning" },
  ENDED: { label: "已结束", variant: "success" },
  CANCELED: { label: "已取消", variant: "danger" },
};

export const invitationMethodOptions: Array<{
  value: InvitationMethod;
  label: string;
}> = [
  { value: "CALL", label: "电话" },
  { value: "WECHAT", label: "微信" },
  { value: "MANUAL", label: "手工登记" },
  { value: "OTHER", label: "其他" },
];

export const booleanChoiceOptions = [
  { value: "true", label: "是" },
  { value: "false", label: "否" },
] as const;

export function getLiveSessionStatusLabel(status: LiveSessionStatus) {
  return liveSessionStatusMeta[status].label;
}

export function getLiveSessionStatusVariant(status: LiveSessionStatus) {
  return liveSessionStatusMeta[status].variant;
}

export function getInvitationMethodLabel(method: InvitationMethod) {
  return invitationMethodOptions.find((item) => item.value === method)?.label ?? method;
}

export function getInvitationStatusLabel(status: InvitationStatus) {
  switch (status) {
    case "PENDING":
      return "未邀约";
    case "INVITED":
      return "已邀约";
    case "ACCEPTED":
      return "已接受";
    case "REJECTED":
      return "已拒绝";
    default:
      return status;
  }
}

export function getAttendanceStatusLabel(status: AttendanceStatus) {
  switch (status) {
    case "NOT_ATTENDED":
      return "未到场";
    case "ATTENDED":
      return "已到场";
    case "LEFT_EARLY":
      return "中途离场";
    default:
      return status;
  }
}
