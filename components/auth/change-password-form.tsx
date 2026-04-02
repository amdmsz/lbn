"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import {
  changeOwnPasswordAction,
  type AccountActionState,
} from "@/lib/account-management/actions";
import { ActionBanner } from "@/components/shared/action-banner";

const initialActionState: AccountActionState = {
  status: "idle",
  message: "",
  temporaryPassword: null,
};

export function ChangePasswordForm() {
  const [state, setState] = useState<AccountActionState>(initialActionState);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const nextState = await changeOwnPasswordAction(initialActionState, formData);
      setState(nextState);

      if (nextState.status === "success") {
        await signOut({ callbackUrl: "/login?passwordChanged=1" });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-black/80">当前密码</span>
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          className="crm-input"
          placeholder="请输入当前使用的临时密码或旧密码"
          required
          disabled={pending}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-black/80">新密码</span>
        <input
          type="password"
          name="nextPassword"
          autoComplete="new-password"
          className="crm-input"
          placeholder="至少 8 位"
          required
          disabled={pending}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-black/80">确认新密码</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          className="crm-input"
          placeholder="再次输入新密码"
          required
          disabled={pending}
        />
      </label>

      {state.message ? (
        <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </ActionBanner>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "保存中..." : "更新密码并重新登录"}
      </button>
    </form>
  );
}
