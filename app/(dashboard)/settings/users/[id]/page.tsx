import { notFound, redirect } from "next/navigation";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { UserDetailManager } from "@/components/settings/user-detail-manager";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatDateTimeLabel,
  getExtraPermissionBadgeConfig,
  getPasswordRequirementBadgeConfig,
  getRoleBadgeVariant,
  getUserStatusLabel,
  getUserStatusVariant,
} from "@/lib/account-management/metadata";
import { getUserDetailData } from "@/lib/account-management/queries";
import {
  canAccessUsersSetting,
  getDefaultRouteForRole,
  roleLabels,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function SettingsUserDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessUsersSetting(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedParams = await params;
  const data = await getUserDetailData(
    { id: session.user.id, role: session.user.role },
    resolvedParams.id,
  );

  if (!data) notFound();

  const passwordBadge = getPasswordRequirementBadgeConfig(data.user.mustChangePassword);

  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue="users"
        title={data.user.name}
        description="查看账号的团队归属、直属主管、启停状态和审计记录，并在允许范围内完成信息维护、临时密码重置与启停。"
        backHref="/settings/users"
        backLabel="返回账号列表"
        trail={["设置中心", "账号管理", data.user.name]}
        badges={
          <>
            <StatusBadge label={roleLabels[data.user.role.code]} variant={getRoleBadgeVariant(data.user.role.code)} />
            <StatusBadge label={getUserStatusLabel(data.user.userStatus)} variant={getUserStatusVariant(data.user.userStatus)} />
            <StatusBadge label={passwordBadge.label} variant={passwordBadge.variant} />
          </>
        }
      />

      <SectionCard title="账号概况" description="这里展示当前账号的团队、直属主管、启停记录和最近登录信息。">
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="账号" value={`@${data.user.username}`} />
          <DetailItem label="手机号" value={data.user.phone ?? "未填写"} />
          <DetailItem label="角色" value={roleLabels[data.user.role.code]} />
          <DetailItem label="团队" value={data.user.team?.name ?? "未分配团队"} />
          <DetailItem
            label="直属主管"
            value={
              data.user.supervisor
                ? `${data.user.supervisor.name} (@${data.user.supervisor.username})`
                : "未指定"
            }
          />
          <DetailItem
            label="当前团队负责人"
            value={
              data.user.supervisedTeam
                ? `${data.user.supervisedTeam.name} 的负责人`
                : "当前账号未担任团队负责人"
            }
          />
          <DetailItem
            label="额外权限"
            value={
              data.grantedPermissionCodes.length > 0
                ? data.grantedPermissionCodes
                    .map((code) => getExtraPermissionBadgeConfig(code).label)
                    .join(" / ")
                : "未授予额外权限"
            }
          />
          <DetailItem label="创建时间" value={formatDateTimeLabel(data.user.createdAt)} />
          <DetailItem label="邀请创建时间" value={formatDateTimeLabel(data.user.invitedAt)} />
          <DetailItem
            label="邀请人"
            value={
              data.user.invitedBy
                ? `${data.user.invitedBy.name} (@${data.user.invitedBy.username})`
                : "暂无记录"
            }
          />
          <DetailItem label="最近登录" value={formatDateTimeLabel(data.user.lastLoginAt)} />
          <DetailItem label="禁用时间" value={formatDateTimeLabel(data.user.disabledAt)} />
          <DetailItem
            label="禁用操作人"
            value={
              data.user.disabledBy
                ? `${data.user.disabledBy.name} (@${data.user.disabledBy.username})`
                : "暂无记录"
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        className="mt-5"
        title={data.canManage ? "编辑与安全操作" : "只读详情"}
        description={
          data.canManage
            ? "保存时会根据变更内容分别写入基础信息、角色、团队或直属主管的 OperationLog。"
            : "当前账号不在你的可管理范围内，因此这里只展示只读信息。"
        }
      >
        <UserDetailManager
          actorRole={session.user.role}
          canManage={data.canManage}
          canManagePermissions={data.canManagePermissions}
          user={{
            id: data.user.id,
            username: data.user.username,
            name: data.user.name,
            phone: data.user.phone,
            teamId: data.user.teamId,
            userStatus: data.user.userStatus,
            role: data.user.role,
            supervisor: data.user.supervisor,
          }}
          roleOptions={data.roleOptions}
          teamOptions={data.teamOptions}
          supervisorOptions={data.supervisorOptions}
          permissionOptions={data.permissionOptions}
          grantedPermissionCodes={data.grantedPermissionCodes}
        />
      </SectionCard>

      <SectionCard
        className="mt-5"
        title="最近审计记录"
        description="新建账号、编辑账号、角色调整、团队调整、直属主管调整、重置密码和启停操作都会写入 OperationLog。"
      >
        {data.operationLogs.length > 0 ? (
          <div className="space-y-3">
            {data.operationLogs.map((item) => (
              <div key={item.id} className="crm-card-muted p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-medium text-black/80">
                      {item.description ?? item.action}
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      {item.actor ? `${item.actor.name} (@${item.actor.username})` : "系统"}
                      {" · "}
                      {formatDateTimeLabel(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge label={item.module} variant="neutral" />
                    <StatusBadge label={item.action} variant="info" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无账号审计记录"
            description="该账号尚未产生关键管理动作，后续创建、编辑、重置密码和启停时会自动记录。"
          />
        )}
      </SectionCard>
    </div>
  );
}
