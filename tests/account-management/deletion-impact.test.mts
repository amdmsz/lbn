import assert from "node:assert/strict";
import test from "node:test";
import accessModule from "../../lib/account-management/access.ts";
import deletionImpactModule from "../../lib/account-management/deletion-impact.ts";

const { canDeleteManagedUser } = accessModule;
const { buildManagedUserDeletionImpact } = deletionImpactModule;

test("buildManagedUserDeletionImpact 会把历史强引用汇总成待删除历史", () => {
  const impact = buildManagedUserDeletionImpact({
    ownedCustomerCount: 3,
    permissionGrantCount: 2,
    outboundCallSeatBindingCount: 1,
    mobileDeviceCount: 1,
    productSavedViewCount: 0,
    callRecordCount: 2,
    callRecordingCount: 0,
    outboundCallSessionCount: 0,
    callQualityReviewCount: 0,
    followUpTaskCount: 0,
    wechatRecordCount: 0,
    liveInvitationCount: 0,
    leadAssignmentToCount: 0,
    leadAssignmentByCount: 0,
    paymentRecordSubmittedCount: 1,
    collectionTaskCount: 0,
    logisticsFollowUpTaskCount: 0,
    leadImportBatchCount: 0,
    recycleBinEntryDeletedCount: 0,
    leadImportBatchRollbackCount: 0,
    importedCustomerDeletionRequestCount: 0,
  });

  assert.equal(impact.transferableCustomerCount, 3);
  assert.equal(impact.cleanupConfigCount, 4);
  assert.equal(impact.canHardDelete, true);
  assert.equal(impact.historyItems.length, 2);
  assert.match(impact.historySummary, /通话记录 2 条/);
  assert.match(impact.historySummary, /收款提交 1 条/);
});

test("buildManagedUserDeletionImpact 在没有历史记录时仍可硬删", () => {
  const impact = buildManagedUserDeletionImpact({
    ownedCustomerCount: 0,
    permissionGrantCount: 0,
    outboundCallSeatBindingCount: 0,
    mobileDeviceCount: 0,
    productSavedViewCount: 0,
    callRecordCount: 0,
    callRecordingCount: 0,
    outboundCallSessionCount: 0,
    callQualityReviewCount: 0,
    followUpTaskCount: 0,
    wechatRecordCount: 0,
    liveInvitationCount: 0,
    leadAssignmentToCount: 0,
    leadAssignmentByCount: 0,
    paymentRecordSubmittedCount: 0,
    collectionTaskCount: 0,
    logisticsFollowUpTaskCount: 0,
    leadImportBatchCount: 0,
    recycleBinEntryDeletedCount: 0,
    leadImportBatchRollbackCount: 0,
    importedCustomerDeletionRequestCount: 0,
  });

  assert.equal(impact.transferableCustomerCount, 0);
  assert.equal(impact.cleanupConfigCount, 0);
  assert.equal(impact.canHardDelete, true);
  assert.equal(impact.historyItems.length, 0);
  assert.match(impact.historySummary, /当前没有需要一并删除的历史记录/);
});

test("canDeleteManagedUser 只放行同团队主管可管理的目标账号", () => {
  const admin = {
    id: "admin",
    name: "Admin",
    username: "admin",
    role: "ADMIN" as const,
    teamId: null,
  };
  const supervisor = {
    id: "sup",
    name: "Supervisor",
    username: "sup",
    role: "SUPERVISOR" as const,
    teamId: "team-1",
  };
  const adminTarget = {
    id: "admin",
    name: "Admin",
    username: "admin",
    roleCode: "ADMIN" as const,
    teamId: null,
  };
  const supervisorTarget = {
    id: "sup",
    name: "Supervisor",
    username: "sup",
    roleCode: "SUPERVISOR" as const,
    teamId: "team-1",
  };
  const sameTeamSales = {
    id: "sales-1",
    name: "Sales",
    username: "sales-1",
    roleCode: "SALES" as const,
    teamId: "team-1",
  };
  const otherTeamSales = {
    id: "sales-2",
    name: "Sales",
    username: "sales-2",
    roleCode: "SALES" as const,
    teamId: "team-2",
  };
  const sameTeamAdmin = {
    id: "admin-2",
    name: "Admin",
    username: "admin-2",
    roleCode: "ADMIN" as const,
    teamId: "team-1",
  };

  assert.equal(canDeleteManagedUser(admin, sameTeamSales), true);
  assert.equal(canDeleteManagedUser(admin, adminTarget), false);
  assert.equal(canDeleteManagedUser(supervisor, sameTeamSales), true);
  assert.equal(canDeleteManagedUser(supervisor, otherTeamSales), false);
  assert.equal(canDeleteManagedUser(supervisor, sameTeamAdmin), false);
  assert.equal(canDeleteManagedUser(supervisor, supervisorTarget), false);
});
