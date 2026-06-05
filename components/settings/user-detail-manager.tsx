"use client";

import { useMemo, useState, useTransition } from "react";
import type { RoleCode, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  deleteManagedUserAction,
  resetManagedUserPasswordAction,
  toggleManagedUserStatusAction,
  updateManagedUserAction,
  updateManagedUserPermissionsAction,
  type AccountActionState,
} from "@/lib/account-management/actions";
import { getExtraPermissionBadgeConfig } from "@/lib/account-management/metadata";
import type { ManagedUserDeletionImpact } from "@/lib/account-management/deletion-impact";
import { roleLabels } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";

const initialActionState: AccountActionState = {
  status: "idle",
  message: "",
  temporaryPassword: null,
};

type RoleOption = {
  code: RoleCode;
  name: string;
};

type TeamOption = {
  id: string;
  code: string;
  name: string;
};

type SupervisorOption = {
  id: string;
  name: string;
  username: string;
  teamId: string | null;
  team: {
    id: string;
    name: string;
  } | null;
};

type PermissionOption = {
  code: ExtraPermissionCode;
  label: string;
  description: string;
};

function requiresTeam(roleCode: RoleCode) {
  return roleCode !== "ADMIN";
}

function requiresSupervisor(roleCode: RoleCode) {
  return roleCode === "SALES" || roleCode === "OPS" || roleCode === "SHIPPER";
}

export function UserDetailManager({
  actorRole,
  canManage,
  canManagePermissions,
  canDelete,
  deletionImpact,
  user,
  roleOptions,
  teamOptions,
  supervisorOptions,
  permissionOptions,
  grantedPermissionCodes,
}: Readonly<{
  actorRole: RoleCode;
  canManage: boolean;
  canManagePermissions: boolean;
  canDelete: boolean;
  deletionImpact: ManagedUserDeletionImpact | null;
  user: {
    id: string;
    username: string;
    name: string;
    phone: string | null;
    teamId: string | null;
    userStatus: UserStatus;
    role: {
      code: RoleCode;
      name: string;
    };
    supervisor: {
      id: string;
      name: string;
      username: string;
    } | null;
  };
  roleOptions: RoleOption[];
  teamOptions: TeamOption[];
  supervisorOptions: SupervisorOption[];
  permissionOptions: PermissionOption[];
  grantedPermissionCodes: ExtraPermissionCode[];
}>) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleCode>(user.role.code);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(user.teamId ?? "");
  const [updateState, setUpdateState] = useState<AccountActionState>(initialActionState);
  const [permissionState, setPermissionState] = useState<AccountActionState>(initialActionState);
  const [resetState, setResetState] = useState<AccountActionState>(initialActionState);
  const [toggleState, setToggleState] = useState<AccountActionState>(initialActionState);
  const [deleteState, setDeleteState] = useState<AccountActionState>(initialActionState);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [pending, startTransition] = useTransition();
  const deleteConfirmationMatches =
    deleteConfirmation.trim().toLowerCase() === user.username;

  const filteredSupervisors = useMemo(
    () =>
      actorRole === "ADMIN"
        ? supervisorOptions.filter(
            (item) =>
              item.id !== user.id &&
              (selectedTeamId ? item.teamId === selectedTeamId : true),
          )
        : supervisorOptions.filter((item) => item.id !== user.id),
    [actorRole, selectedTeamId, supervisorOptions, user.id],
  );

  function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await updateManagedUserAction(initialActionState, formData);
      setUpdateState(nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  function handleResetPassword() {
    const formData = new FormData();
    formData.set("userId", user.id);

    startTransition(async () => {
      const nextState = await resetManagedUserPasswordAction(initialActionState, formData);
      setResetState(nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  function handleToggleStatus() {
    const formData = new FormData();
    formData.set("userId", user.id);

    startTransition(async () => {
      const nextState = await toggleManagedUserStatusAction(initialActionState, formData);
      setToggleState(nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await deleteManagedUserAction(initialActionState, formData);
      setDeleteState(nextState);

      if (nextState.status === "success") {
        router.replace(nextState.redirectTo ?? "/settings/users");
      }
    });
  }

  function handlePermissionUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await updateManagedUserPermissionsAction(
        initialActionState,
        formData,
      );
      setPermissionState(nextState);

      if (nextState.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {!canManage ? (
        <ActionBanner tone="danger">
          当前角色仅可查看这个账号的详情，不能直接编辑、重置密码或启停。
        </ActionBanner>
      ) : null}

      <form onSubmit={handleUpdate} className="space-y-4">
        <input type="hidden" name="id" value={user.id} />

        <div className="grid gap-3.5 xl:grid-cols-2">
          <label className="space-y-1.5">
            <span className="crm-label">姓名</span>
            <input
              name="name"
              defaultValue={user.name}
              className="crm-input"
              required
              disabled={pending || !canManage}
            />
          </label>

          <label className="space-y-1.5">
            <span className="crm-label">账号</span>
            <input
              name="username"
              defaultValue={user.username}
              className="crm-input"
              required
              disabled={pending || !canManage}
            />
          </label>

          <label className="space-y-1.5">
            <span className="crm-label">手机号</span>
            <input
              name="phone"
              defaultValue={user.phone ?? ""}
              className="crm-input"
              disabled={pending || !canManage}
            />
          </label>

          {actorRole === "ADMIN" ? (
            <label className="space-y-1.5">
              <span className="crm-label">角色</span>
              <select
                name="roleCode"
                className="crm-select"
                value={selectedRole}
                disabled={pending || !canManage}
                onChange={(event) => setSelectedRole(event.target.value as RoleCode)}
              >
                {roleOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {roleLabels[item.code]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="roleCode" value={user.role.code} />
          )}

          {actorRole === "ADMIN" ? (
            <label className="space-y-1.5">
              <span className="crm-label">团队</span>
              <select
                name="teamId"
                className="crm-select"
                value={selectedTeamId}
                disabled={pending || !canManage}
                onChange={(event) => setSelectedTeamId(event.target.value)}
                required={requiresTeam(selectedRole)}
              >
                <option value="">
                  {requiresTeam(selectedRole) ? "请选择团队" : "不分配团队"}
                </option>
                {teamOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="teamId" value={user.teamId ?? ""} />
          )}

          {requiresSupervisor(selectedRole) ? (
            actorRole === "ADMIN" ? (
              <label className="space-y-1.5">
                <span className="crm-label">直属主管</span>
                <select
                  name="supervisorId"
                  className="crm-select"
                  defaultValue={user.supervisor?.id ?? ""}
                  required
                  disabled={pending || !canManage || !selectedTeamId}
                >
                  <option value="">
                    {selectedTeamId ? "请选择直属主管" : "请先选择团队"}
                  </option>
                  {filteredSupervisors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (@{item.username})
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="supervisorId" value={user.supervisor?.id ?? ""} />
            )
          ) : (
            <input type="hidden" name="supervisorId" value="" />
          )}
        </div>

        {updateState.message ? (
          <ActionBanner tone={updateState.status === "success" ? "success" : "danger"}>
            {updateState.message}
          </ActionBanner>
        ) : null}

        {canManage ? (
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="crm-button crm-button-primary">
              {pending ? "保存中..." : "保存账号信息"}
            </button>
          </div>
        ) : null}
      </form>

      <div className="crm-card-muted p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">额外权限</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              这些权限用于给具体账号追加跨岗位模块能力，不改变该角色默认的数据边界。
              权限变更后，目标账号需要重新登录一次才会在路由守卫和侧边栏里完全生效。
            </p>
          </div>

          {grantedPermissionCodes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {grantedPermissionCodes.map((permissionCode) => {
                const badge = getExtraPermissionBadgeConfig(permissionCode);
                return (
                  <StatusBadge
                    key={permissionCode}
                    label={badge.label}
                    variant={badge.variant}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">当前未授予额外权限。</div>
          )}

          {canManagePermissions ? (
            <form onSubmit={handlePermissionUpdate} className="space-y-4">
              <input type="hidden" name="userId" value={user.id} />

              <div className="space-y-3">
                {permissionOptions.map((item) => (
                  <label
                    key={item.code}
                    className="flex items-start gap-3 rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      name="permissionCodes"
                      value={item.code}
                      defaultChecked={grantedPermissionCodes.includes(item.code)}
                      disabled={pending}
                      className="mt-1 h-4 w-4 rounded border-border"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                    </div>
                  </label>
                ))}
              </div>

              {permissionState.message ? (
                <ActionBanner
                  tone={permissionState.status === "success" ? "success" : "danger"}
                >
                  {permissionState.message}
                </ActionBanner>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="crm-button crm-button-secondary"
                >
                  {pending ? "保存中..." : "保存额外权限"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="crm-card-muted p-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">重置临时密码</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  重置后会生成新的临时密码，并要求该账号下次登录时先修改密码。
                </p>
              </div>

              {resetState.message ? (
                <ActionBanner tone={resetState.status === "success" ? "success" : "danger"}>
                  <div className="space-y-2">
                    <p>{resetState.message}</p>
                    {resetState.temporaryPassword ? (
                      <p className="text-sm">
                        临时密码：<code>{resetState.temporaryPassword}</code>
                      </p>
                    ) : null}
                  </div>
                </ActionBanner>
              ) : null}

              <button
                type="button"
                disabled={pending}
                onClick={handleResetPassword}
                className="crm-button crm-button-secondary"
              >
                {pending ? "处理中..." : "重置密码"}
              </button>
            </div>
          </div>

          <div className="crm-card-muted p-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {user.userStatus === "ACTIVE" ? "禁用账号" : "启用账号"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  禁用后不删除历史业务数据，只禁止该账号继续登录和操作系统。
                </p>
              </div>

              {toggleState.message ? (
                <ActionBanner tone={toggleState.status === "success" ? "success" : "danger"}>
                  {toggleState.message}
                </ActionBanner>
              ) : null}

              <button
                type="button"
                disabled={pending}
                onClick={handleToggleStatus}
                className="crm-button crm-button-secondary"
              >
                {pending
                  ? "处理中..."
                  : user.userStatus === "ACTIVE"
                    ? "禁用账号"
                    : "启用账号"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {canDelete && deletionImpact ? (
        <div className="crm-card-muted p-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">永久删除账号</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  删除前会先把该账号名下客户回收到团队待分配池，并清理该账号的个人权限、坐席绑定、移动设备和个人视图。
                  通话、支付、导入等历史记录也会一并删除。这个动作不可恢复。
                </p>
              </div>
              <StatusBadge label="永久删除" variant="warning" />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  客户待分配
                </p>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {deletionImpact.transferableCustomerCount} 个客户会进入团队待分配池
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  可清理配置
                </p>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {deletionImpact.cleanupConfigCount} 项个人配置会被清理
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                  历史记录
                </p>
                <p className="mt-1.5 text-sm font-medium text-foreground">
                  {deletionImpact.historyItems.length > 0
                    ? `${deletionImpact.historyItems.length} 类历史记录会一并删除`
                    : "当前没有需要一并删除的历史记录"}
                </p>
              </div>
            </div>

            {deletionImpact.cleanupItems.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-sm font-medium text-foreground">将清理的个人配置</p>
                <div className="flex flex-wrap gap-1.5">
                  {deletionImpact.cleanupItems.map((item) => (
                    <StatusBadge
                      key={item.code}
                      label={`${item.label} ${item.count} 项`}
                      variant="neutral"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <ActionBanner tone="danger">
              <div className="space-y-2">
                <p>{deletionImpact.historySummary}</p>
                <p>提交后会先回收客户，再永久删除账号和关联历史记录。</p>
              </div>
            </ActionBanner>

            {deletionImpact.historyItems.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-sm font-medium text-foreground">将删除的历史记录</p>
                <div className="flex flex-wrap gap-1.5">
                  {deletionImpact.historyItems.map((item) => (
                    <StatusBadge
                      key={item.code}
                      label={`${item.label} ${item.count} 条`}
                      variant="neutral"
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {deleteState.message ? (
              <ActionBanner tone={deleteState.status === "success" ? "success" : "danger"}>
                {deleteState.message}
              </ActionBanner>
            ) : null}

            <form onSubmit={handleDelete} className="space-y-4">
              <input type="hidden" name="userId" value={user.id} />

              <label className="space-y-1.5">
                <span className="crm-label">输入账号名确认</span>
                <input
                  name="confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  className="crm-input"
                  placeholder={user.username}
                  autoComplete="off"
                  disabled={pending}
                  required
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-muted-foreground">
                  输入完整账号名后才能提交。提交后会先回收客户，再永久删除账号与关联历史记录。
                </p>
                <button
                  type="submit"
                  disabled={pending || !deleteConfirmationMatches}
                  className="crm-button crm-button-secondary text-[var(--color-danger)] hover:border-[var(--tone-danger-soft-border-strong)] hover:bg-[var(--tone-danger-soft-bg)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {pending ? "删除中..." : "永久删除账号"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
