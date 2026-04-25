import type { Prisma, RoleCode } from "@prisma/client";
import { canAccessLeadImportModule } from "@/lib/auth/access";

export type LeadImportAccessViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

const inaccessibleLeadImportBatchWhere = {
  id: "__inaccessible_lead_import_batch__",
} satisfies Prisma.LeadImportBatchWhereInput;

export function assertLeadImportAccess(role: RoleCode) {
  if (!canAccessLeadImportModule(role)) {
    throw new Error("当前角色无权访问导入中心。");
  }
}

export function buildLeadImportBatchVisibilityWhere(
  viewer: LeadImportAccessViewer,
): Prisma.LeadImportBatchWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    if (!viewer.teamId) {
      return inaccessibleLeadImportBatchWhere;
    }

    return {
      createdBy: {
        teamId: viewer.teamId,
      },
    };
  }

  return inaccessibleLeadImportBatchWhere;
}
