import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { UserCreateForm } from "@/components/settings/user-create-form";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatDateTimeLabel,
  getPasswordRequirementBadgeConfig,
  getRoleBadgeVariant,
  getUserStatusLabel,
  getUserStatusVariant,
  roleFilterOptions,
  userStatusOptions,
} from "@/lib/account-management/metadata";
import { getUsersPageData } from "@/lib/account-management/queries";
import {
  canAccessUsersSetting,
  getDefaultRouteForRole,
  roleLabels,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function SettingsUsersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessUsersSetting(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getUsersPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  const scopeLabel =
    data.managementScope === "company"
      ? "管理员全公司视图"
      : data.managementScope === "team"
        ? "主管仅看本团队"
        : "主管尚未归属团队";

  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue="users"
        title="账号管理"
        description="账号管理继续负责内部账号、角色、状态和密码流程。当前页面只统一设置域认知，不重做原有账号管理逻辑。"
        badges={
          <>
            <StatusBadge
              label={scopeLabel}
              variant={data.managementScope === "company" ? "info" : "warning"}
            />
            <StatusBadge
              label={`可见账号 ${data.summary.scopedTotalCount}`}
              variant="success"
            />
          </>
        }
        actions={
          <div className="crm-toolbar-cluster">
            <Link href="/settings/teams" className="crm-button crm-button-secondary">
              查看团队
            </Link>
          </div>
        }
        metrics={[
          {
            label: "可见账号",
            value: String(data.summary.scopedTotalCount),
            hint:
              data.managementScope === "company"
                ? "当前可查看全公司账号范围"
                : "当前仅查看本团队账号范围",
          },
          {
            label: "启用中",
            value: String(data.summary.activeCount),
            hint: "可登录并正常使用系统",
          },
          {
            label: "已禁用",
            value: String(data.summary.inactiveCount),
            hint: "历史业务数据保留，但不再允许登录",
          },
          {
            label: "团队数",
            value: String(data.summary.teamCount),
            hint: "当前筛选范围下可关联的团队",
          },
        ]}
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      {data.managementScope === "team_unassigned" ? (
        <ActionBanner tone="danger">
          当前主管账号尚未归属团队，因此无法查看或创建团队成员。请先由管理员在账号页为你指定团队。
        </ActionBanner>
      ) : null}

      <DataTableWrapper
        title="新增账号"
        description={
          session.user.role === "ADMIN"
            ? "管理员可创建管理员、主管、销售、运营和发货账号，并指定团队和直属主管。"
            : "主管当前只可为本团队创建销售、运营和发货账号。"
        }
      >
        <UserCreateForm
          actorRole={session.user.role}
          roleOptions={data.roleOptions}
          teamOptions={data.teamOptions}
          supervisorOptions={data.supervisorOptions}
          defaultTeamId={data.actor.teamId}
          defaultSupervisorId={session.user.role === "SUPERVISOR" ? data.actor.id : null}
          disabled={data.managementScope === "team_unassigned"}
        />
      </DataTableWrapper>

      <FiltersPanel
        title="账号筛选"
        description="按关键字、角色、团队和状态筛选；主管视角会自动锁定到本团队。"
        className="mt-5"
      >
        <form method="get" className="grid gap-3.5 xl:grid-cols-4">
          <label className="space-y-1.5">
            <span className="crm-label">关键字</span>
            <input
              name="search"
              defaultValue={data.filters.search}
              placeholder="姓名 / 账号 / 手机号"
              className="crm-input"
            />
          </label>

          <label className="space-y-1.5">
            <span className="crm-label">角色</span>
            <select name="role" defaultValue={data.filters.role} className="crm-select">
              {roleFilterOptions.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {session.user.role === "ADMIN" ? (
            <label className="space-y-1.5">
              <span className="crm-label">团队</span>
              <select name="teamId" defaultValue={data.filters.teamId} className="crm-select">
                <option value="">全部团队</option>
                {data.teamOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="teamId" value={data.filters.teamId} />
          )}

          <label className="space-y-1.5">
            <span className="crm-label">状态</span>
            <select
              name="userStatus"
              defaultValue={data.filters.userStatus}
              className="crm-select"
            >
              {userStatusOptions.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-3 xl:col-span-4">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link href="/settings/users" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </FiltersPanel>

      <DataTableWrapper
        className="mt-5"
        title="账号列表"
        description="点击详情可查看审计记录、编辑信息、重置临时密码或启用 / 禁用账号。"
      >
        {data.items.length > 0 ? (
          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>角色</th>
                  <th>团队</th>
                  <th>直属主管</th>
                  <th>状态</th>
                  <th>上次登录</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const passwordBadge = getPasswordRequirementBadgeConfig(
                    item.mustChangePassword,
                  );

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="space-y-0.5">
                          <div className="font-medium text-black/80">{item.name}</div>
                          <div className="text-xs text-black/45">
                            @{item.username}
                            {item.phone ? ` · ${item.phone}` : ""}
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          label={roleLabels[item.role.code]}
                          variant={getRoleBadgeVariant(item.role.code)}
                        />
                      </td>
                      <td>{item.team?.name ?? "未分配团队"}</td>
                      <td>
                        {item.supervisor ? (
                          <div>
                            <div>{item.supervisor.name}</div>
                            <div className="text-xs text-black/45">
                              @{item.supervisor.username}
                            </div>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge
                            label={getUserStatusLabel(item.userStatus)}
                            variant={getUserStatusVariant(item.userStatus)}
                          />
                          <StatusBadge
                            label={passwordBadge.label}
                            variant={passwordBadge.variant}
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-sm text-black/60">
                        {formatDateTimeLabel(item.lastLoginAt)}
                      </td>
                      <td>
                        <Link
                          href={`/settings/users/${item.id}`}
                          scroll={false}
                          className="crm-text-link"
                        >
                          {item.canManage ? "查看 / 管理" : "查看详情"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="暂无符合条件的账号"
            description="当前筛选条件下没有账号记录，可以调整筛选条件或直接创建新账号。"
          />
        )}
      </DataTableWrapper>
    </div>
  );
}
