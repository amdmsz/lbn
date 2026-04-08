"use client";

import { useMemo, useState, useTransition } from "react";
import type { RoleCode, UserStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  resetManagedUserPasswordAction,
  toggleManagedUserStatusAction,
  updateManagedUserAction,
  updateManagedUserPermissionsAction,
  type AccountActionState,
} from "@/lib/account-management/actions";
import { getExtraPermissionBadgeConfig } from "@/lib/account-management/metadata";
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
  const [pending, startTransition] = useTransition();

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
            <p className="text-sm font-medium text-black/80">额外权限</p>
            <p className="mt-2 text-sm leading-6 text-black/58">
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
            <div className="text-sm text-black/55">当前未授予额外权限。</div>
          )}

          {canManagePermissions ? (
            <form onSubmit={handlePermissionUpdate} className="space-y-4">
              <input type="hidden" name="userId" value={user.id} />

              <div className="space-y-3">
                {permissionOptions.map((item) => (
                  <label
                    key={item.code}
                    className="flex items-start gap-3 rounded-2xl border border-black/8 bg-white/80 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      name="permissionCodes"
                      value={item.code}
                      defaultChecked={grantedPermissionCodes.includes(item.code)}
                      disabled={pending}
                      className="mt-1 h-4 w-4 rounded border-black/15"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-black/80">{item.label}</p>
                      <p className="text-sm leading-6 text-black/55">{item.description}</p>
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
                <p className="text-sm font-medium text-black/80">重置临时密码</p>
                <p className="mt-2 text-sm leading-6 text-black/58">
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
                <p className="text-sm font-medium text-black/80">
                  {user.userStatus === "ACTIVE" ? "禁用账号" : "启用账号"}
                </p>
                <p className="mt-2 text-sm leading-6 text-black/58">
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
    </div>
  );
}
