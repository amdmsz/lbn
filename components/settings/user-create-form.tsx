"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RoleCode } from "@prisma/client";
import { useRouter } from "next/navigation";
import {
  createManagedUserAction,
  type AccountActionState,
} from "@/lib/account-management/actions";
import { roleLabels } from "@/lib/auth/access";
import { ActionBanner } from "@/components/shared/action-banner";

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

function getDefaultRole(actorRole: RoleCode, roleOptions: RoleOption[]) {
  if (actorRole === "ADMIN") {
    return roleOptions.find((item) => item.code === "SALES")?.code ?? roleOptions[0]?.code ?? "SALES";
  }

  return roleOptions[0]?.code ?? "SALES";
}

function requiresTeam(roleCode: RoleCode) {
  return roleCode !== "ADMIN";
}

function requiresSupervisor(roleCode: RoleCode) {
  return roleCode === "SALES" || roleCode === "OPS" || roleCode === "SHIPPER";
}

export function UserCreateForm({
  actorRole,
  roleOptions,
  teamOptions,
  supervisorOptions,
  defaultTeamId,
  defaultSupervisorId,
  disabled = false,
}: Readonly<{
  actorRole: RoleCode;
  roleOptions: RoleOption[];
  teamOptions: TeamOption[];
  supervisorOptions: SupervisorOption[];
  defaultTeamId?: string | null;
  defaultSupervisorId?: string | null;
  disabled?: boolean;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<AccountActionState>(initialActionState);
  const [pending, startTransition] = useTransition();
  const [selectedRole, setSelectedRole] = useState<RoleCode>(
    getDefaultRole(actorRole, roleOptions),
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    actorRole === "SUPERVISOR" ? defaultTeamId ?? "" : defaultTeamId ?? "",
  );

  const filteredSupervisors =
    actorRole === "ADMIN"
      ? supervisorOptions.filter((item) =>
          selectedTeamId ? item.teamId === selectedTeamId : true,
        )
      : supervisorOptions;
  const defaultSupervisor =
    filteredSupervisors.find((item) => item.id === defaultSupervisorId) ?? null;

  useEffect(() => {
    if (!requiresSupervisor(selectedRole)) {
      return;
    }

    if (
      filteredSupervisors.length === 1 &&
      actorRole === "SUPERVISOR"
    ) {
      const supervisorInput = formRef.current?.elements.namedItem("supervisorId");
      if (supervisorInput instanceof HTMLSelectElement) {
        supervisorInput.value = filteredSupervisors[0]?.id ?? "";
      }
    }
  }, [actorRole, filteredSupervisors, selectedRole]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await createManagedUserAction(initialActionState, formData);
      setState(nextState);

      if (nextState.status === "success") {
        formRef.current?.reset();
        setSelectedRole(getDefaultRole(actorRole, roleOptions));
        setSelectedTeamId(actorRole === "SUPERVISOR" ? defaultTeamId ?? "" : "");
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3.5 xl:grid-cols-2">
        <label className="space-y-1.5">
          <span className="crm-label">姓名</span>
          <input
            name="name"
            className="crm-input"
            placeholder="例如：张三"
            required
            disabled={pending || disabled}
          />
        </label>

        <label className="space-y-1.5">
          <span className="crm-label">账号</span>
          <input
            name="username"
            className="crm-input"
            placeholder="例如：zhangsan"
            required
            disabled={pending || disabled}
          />
        </label>

        <label className="space-y-1.5">
          <span className="crm-label">手机号</span>
          <input
            name="phone"
            className="crm-input"
            placeholder="可选，用于内部通讯"
            disabled={pending || disabled}
          />
        </label>

        <label className="space-y-1.5">
          <span className="crm-label">角色</span>
          <select
            name="roleCode"
            className="crm-select"
            value={selectedRole}
            disabled={pending || disabled}
            onChange={(event) => setSelectedRole(event.target.value as RoleCode)}
          >
            {roleOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {roleLabels[item.code]}
              </option>
            ))}
          </select>
        </label>

        {actorRole === "ADMIN" ? (
          <label className="space-y-1.5">
            <span className="crm-label">团队</span>
            <select
              name="teamId"
              className="crm-select"
              value={selectedTeamId}
              disabled={pending || disabled}
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
          <input type="hidden" name="teamId" value={defaultTeamId ?? ""} />
        )}

        {requiresSupervisor(selectedRole) ? (
          actorRole === "ADMIN" ? (
            <label className="space-y-1.5">
              <span className="crm-label">直属主管</span>
              <select
                name="supervisorId"
                className="crm-select"
                required
                disabled={pending || disabled || !selectedTeamId}
                defaultValue=""
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
            <>
              <input name="supervisorId" type="hidden" value={defaultSupervisorId ?? ""} />
              <div className="space-y-1.5">
                <span className="crm-label">直属主管</span>
                <div className="crm-input flex items-center text-sm text-black/65">
                  {defaultSupervisor
                    ? `${defaultSupervisor.name} (@${defaultSupervisor.username})`
                    : "当前账号尚未配置团队主管"}
                </div>
              </div>
            </>
          )
        ) : (
          <input type="hidden" name="supervisorId" value="" />
        )}
      </div>

      {state.message ? (
        <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
          <div className="space-y-2">
            <p>{state.message}</p>
            {state.temporaryPassword ? (
              <p className="text-sm">
                临时密码：<code>{state.temporaryPassword}</code>
                {" "}请仅通过安全渠道发送给新账号，并提示其首次登录后立即改密。
              </p>
            ) : null}
          </div>
        </ActionBanner>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-6 text-black/55">
          系统会自动生成临时密码，并要求新账号首次登录后修改密码。
        </p>
        <button
          type="submit"
          disabled={pending || disabled}
          className="crm-button crm-button-primary"
        >
          {pending ? "创建中..." : "创建账号"}
        </button>
      </div>
    </form>
  );
}
