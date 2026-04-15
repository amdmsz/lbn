import type { RoleCode } from "@prisma/client";
import {
  hasExtraPermission,
  type ExtraPermissionCode,
} from "@/lib/auth/permissions";

const masterDataSettingPaths = [
  "/settings",
  "/settings/users",
  "/settings/teams",
  "/settings/tag-groups",
  "/settings/tag-categories",
  "/settings/tags",
  "/settings/dictionaries",
  "/settings/call-results",
] as const;

export const roleLabels: Record<RoleCode, string> = {
  ADMIN: "管理员",
  SUPERVISOR: "主管",
  SALES: "销售",
  OPS: "运营",
  SHIPPER: "发货员",
};

export function getDefaultRouteForRole(role: RoleCode) {
  switch (role) {
    case "SALES":
      return "/customers";
    case "SHIPPER":
      return "/fulfillment?tab=shipping";
    case "ADMIN":
    case "SUPERVISOR":
    case "OPS":
    default:
      return "/dashboard";
  }
}

export function canManageMasterData(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canManageTeams(role: RoleCode) {
  return role === "ADMIN";
}

export function canAccessUsersSetting(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessTeamsSetting(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessSettingsModule(role: RoleCode) {
  return canManageMasterData(role);
}

export function canAccessLeadImportModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canExecuteLeadImportBatchRollback(role: RoleCode) {
  return canAccessLeadImportModule(role);
}

export function canExecuteLeadImportBatchHardDelete(role: RoleCode) {
  return role === "ADMIN";
}

export function canAccessPath(
  role: RoleCode,
  pathname: string,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  if (pathname === "/" || pathname === "/login") {
    return true;
  }

  if (pathname === "/change-password") {
    return true;
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return true;
  }

  if (pathname === "/leads" || pathname.startsWith("/leads/")) {
    return canAccessLeadModule(role);
  }

  if (pathname === "/lead-imports" || pathname.startsWith("/lead-imports/")) {
    return canAccessLeadImportModule(role);
  }

  if (
    pathname === "/lead-import-templates" ||
    pathname.startsWith("/lead-import-templates/")
  ) {
    return canAccessLeadImportModule(role);
  }

  if (pathname === "/customers" || pathname.startsWith("/customers/")) {
    return canAccessCustomerModule(role);
  }

  if (pathname === "/suppliers" || pathname.startsWith("/suppliers/")) {
    return canAccessSupplierModule(role, permissionCodes);
  }

  if (pathname === "/products" || pathname.startsWith("/products/")) {
    return canAccessProductModule(role, permissionCodes);
  }

  if (pathname === "/recycle-bin" || pathname.startsWith("/recycle-bin/")) {
    return canAccessRecycleBinModule(role, permissionCodes);
  }

  if (pathname === "/fulfillment" || pathname.startsWith("/fulfillment/")) {
    return canAccessOrderFulfillmentCenter(role);
  }

  if (pathname === "/live-sessions" || pathname.startsWith("/live-sessions/")) {
    return canAccessLiveSessionModule(role, permissionCodes);
  }

  if (pathname === "/orders" || pathname.startsWith("/orders/")) {
    return canAccessOrderModule(role);
  }

  if (pathname === "/gifts" || pathname.startsWith("/gifts/")) {
    return canAccessGiftModule(role);
  }

  if (pathname === "/shipping" || pathname.startsWith("/shipping/")) {
    return canAccessShippingModule(role);
  }

  if (pathname === "/payment-records" || pathname.startsWith("/payment-records/")) {
    return canAccessPaymentRecordModule(role);
  }

  if (pathname === "/collection-tasks" || pathname.startsWith("/collection-tasks/")) {
    return canAccessCollectionTaskModule(role);
  }

  if (pathname === "/finance" || pathname.startsWith("/finance/")) {
    return canAccessFinanceModule(role);
  }

  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    return canAccessReportModule(role);
  }

  if (pathname.startsWith("/settings")) {
    if (role === "ADMIN") {
      return true;
    }

    if (!canManageMasterData(role)) {
      return false;
    }

    return masterDataSettingPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }

  return false;
}

export function canAccessAllData(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function isOwnDataOnly(role: RoleCode) {
  return role === "SALES";
}

export function canAccessLeadModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessCustomerModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES";
}

export function canAccessCustomerPublicPool(role: RoleCode) {
  return canAccessCustomerModule(role);
}

export function canRequestImportedCustomerDeletion(role: RoleCode) {
  return role === "SALES";
}

export function canReviewImportedCustomerDeletion(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canForceDeleteImportedCustomer(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canClaimPublicPoolCustomer(role: RoleCode) {
  return role === "SALES";
}

export function canManageCustomerPublicPool(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessCustomerPublicPoolSettings(role: RoleCode) {
  return canManageCustomerPublicPool(role);
}

export function canAccessCustomerPublicPoolReports(role: RoleCode) {
  return canManageCustomerPublicPool(role);
}

export function canAccessLiveSessionModule(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "SALES" ||
    role === "OPS" ||
    role === "SHIPPER" ||
    hasExtraPermission(permissionCodes, "LIVE_SESSION_MANAGE")
  );
}

export function canAccessReportModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessOrderModule(role: RoleCode) {
  return canAccessSalesOrderModule(role);
}

export function canAccessOrderFulfillmentCenter(role: RoleCode) {
  return canAccessSalesOrderModule(role) || canAccessShippingModule(role);
}

export function canAccessSalesOrderModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES";
}

export function canCreateOrder(role: RoleCode) {
  return canCreateSalesOrder(role);
}

export function canCreateSalesOrder(role: RoleCode) {
  return canAccessSalesOrderModule(role);
}

export function canUpdateOrder(role: RoleCode) {
  return canAccessOrderModule(role);
}

export function canReviewSalesOrder(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canAccessSupplierModule(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "SHIPPER" ||
    hasExtraPermission(permissionCodes, "PRODUCT_MANAGE")
  );
}

export function canManageSuppliers(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return canAccessSupplierModule(role, permissionCodes);
}

export function canAccessProductModule(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "OPS" ||
    role === "SHIPPER" ||
    hasExtraPermission(permissionCodes, "PRODUCT_MANAGE")
  );
}

export function canCreateProducts(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return canManageProducts(role, permissionCodes);
}

export function canManageProducts(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "SHIPPER" ||
    hasExtraPermission(permissionCodes, "PRODUCT_MANAGE")
  );
}

export function canAccessGiftModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES" || role === "OPS";
}

export function canCreateGiftRecord(role: RoleCode) {
  return canAccessGiftModule(role);
}

export function canReviewGiftRecord(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "OPS";
}

export function canAccessShippingModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SHIPPER";
}

export function canCreateShippingTask(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canUpdateShippingTask(role: RoleCode) {
  return canAccessShippingModule(role);
}

export function canAccessShippingExportBatchModule(role: RoleCode) {
  return canAccessShippingModule(role);
}

export function canManageShippingReporting(role: RoleCode) {
  return role === "ADMIN" || role === "SHIPPER";
}

export function canAccessPaymentRecordModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES";
}

export function canAccessCollectionTaskModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES";
}

export function canAccessFinanceModule(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canSubmitPaymentRecord(role: RoleCode) {
  return canAccessPaymentRecordModule(role);
}

export function canConfirmPaymentRecord(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canManageCollectionTasks(role: RoleCode) {
  return canAccessCollectionTaskModule(role);
}

export function canManageLogisticsFollowUp(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR" || role === "SALES";
}

export function canManageLeadAssignments(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canCreateCallRecord(role: RoleCode) {
  return role === "ADMIN" || role === "SALES";
}

export function canCreateWechatRecord(role: RoleCode) {
  return role === "SALES";
}

export function canCreateLiveInvitation(role: RoleCode) {
  return role === "SALES";
}

export function canManageLiveSessions(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    role === "ADMIN" ||
    role === "SUPERVISOR" ||
    role === "OPS" ||
    role === "SHIPPER" ||
    hasExtraPermission(permissionCodes, "LIVE_SESSION_MANAGE")
  );
}

export function canAccessRecycleBinModule(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  return (
    canAccessSalesOrderModule(role) ||
    canAccessLeadModule(role) ||
    canManageProducts(role, permissionCodes) ||
    canManageSuppliers(role, permissionCodes) ||
    canManageLiveSessions(role, permissionCodes)
  );
}

export function canUseLeadTags(role: RoleCode) {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function canUseCustomerTags(role: RoleCode) {
  return canAccessCustomerModule(role);
}

export function getLeadScope(role: RoleCode, userId: string) {
  if (canAccessAllData(role)) {
    return {};
  }

  if (isOwnDataOnly(role)) {
    return { ownerId: userId };
  }

  return null;
}

export function getCustomerScope(role: RoleCode, userId: string) {
  if (canAccessAllData(role)) {
    return {};
  }

  if (isOwnDataOnly(role)) {
    return { ownerId: userId };
  }

  return null;
}

export function getOrderScope(role: RoleCode, userId: string) {
  if (canAccessAllData(role)) {
    return {};
  }

  if (isOwnDataOnly(role)) {
    return {
      customer: {
        ownerId: userId,
      },
    };
  }

  return null;
}

export function getGiftScope(role: RoleCode, userId: string) {
  if (canAccessAllData(role) || role === "OPS") {
    return {};
  }

  if (isOwnDataOnly(role)) {
    return {
      customer: {
        ownerId: userId,
      },
    };
  }

  return null;
}

export function getShippingTaskScope(role: RoleCode, userId: string) {
  if (canAccessAllData(role) || role === "SHIPPER") {
    return {};
  }

  if (isOwnDataOnly(role)) {
    return {
      customer: {
        ownerId: userId,
      },
    };
  }

  return null;
}
