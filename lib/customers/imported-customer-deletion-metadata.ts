import type {
  ImportedCustomerDeletionRequestStatus,
  ImportedCustomerDeletionSourceMode,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

type ImportedCustomerDeletionRequestStatusMeta = {
  label: string;
  variant: StatusBadgeVariant;
};

type ImportedCustomerDeletionRowStateMeta = {
  label: string;
  variant: StatusBadgeVariant;
};

export const importedCustomerDeletionRequestStatusMeta: Record<
  ImportedCustomerDeletionRequestStatus,
  ImportedCustomerDeletionRequestStatusMeta
> = {
  PENDING_SUPERVISOR: {
    label: "待主管审批",
    variant: "warning",
  },
  REJECTED: {
    label: "已驳回",
    variant: "danger",
  },
  EXECUTED: {
    label: "已执行",
    variant: "success",
  },
};

export const importedCustomerDeletionSourceModeLabels: Record<
  ImportedCustomerDeletionSourceMode,
  string
> = {
  LEAD: "线索导入",
  CUSTOMER_CONTINUATION: "客户续接",
};

export const importedCustomerDeletionRowStateMeta = {
  ELIGIBLE: {
    label: "可删除",
    variant: "success",
  },
  PENDING: {
    label: "待删审批",
    variant: "warning",
  },
  DELETED: {
    label: "已删除",
    variant: "success",
  },
  BLOCKED: {
    label: "不可删除",
    variant: "danger",
  },
} as const satisfies Record<string, ImportedCustomerDeletionRowStateMeta>;

export type ImportedCustomerDeletionRowState =
  keyof typeof importedCustomerDeletionRowStateMeta;

export function getImportedCustomerDeletionRequestStatusLabel(
  status: ImportedCustomerDeletionRequestStatus,
) {
  return importedCustomerDeletionRequestStatusMeta[status].label;
}

export function getImportedCustomerDeletionRequestStatusVariant(
  status: ImportedCustomerDeletionRequestStatus,
) {
  return importedCustomerDeletionRequestStatusMeta[status].variant;
}

export function getImportedCustomerDeletionSourceModeLabel(
  sourceMode: ImportedCustomerDeletionSourceMode,
) {
  return importedCustomerDeletionSourceModeLabels[sourceMode];
}

export function getImportedCustomerDeletionRowStateLabel(
  state: ImportedCustomerDeletionRowState,
) {
  return importedCustomerDeletionRowStateMeta[state].label;
}

export function getImportedCustomerDeletionRowStateVariant(
  state: ImportedCustomerDeletionRowState,
) {
  return importedCustomerDeletionRowStateMeta[state].variant;
}
