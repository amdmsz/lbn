"use client";

import { useMemo, useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  changeOwnPasswordAction,
  type AccountActionState,
} from "@/lib/account-management/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import {
  PASSWORD_POLICY,
  countPasswordClasses,
  validatePasswordStrength,
} from "@/lib/auth/password-policy";

const initialActionState: AccountActionState = {
  status: "idle",
  message: "",
  temporaryPassword: null,
};

type ClientErrors = {
  nextPassword?: string;
  confirmPassword?: string;
};

function validateForm(values: {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
}): ClientErrors {
  const errors: ClientErrors = {};

  const strengthError = validatePasswordStrength(values.nextPassword);
  if (strengthError) {
    errors.nextPassword = strengthError;
  } else if (values.currentPassword === values.nextPassword) {
    errors.nextPassword = "新密码不能与当前密码相同";
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "请再次输入新密码";
  } else if (values.nextPassword !== values.confirmPassword) {
    errors.confirmPassword = "两次输入的新密码不一致";
  }

  return errors;
}

export function ChangePasswordForm() {
  const [state, setState] = useState<AccountActionState>(initialActionState);
  const [pending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});

  const strengthHint = useMemo(() => {
    if (!nextPassword) {
      return null;
    }

    const classCount = countPasswordClasses(nextPassword);
    const lengthOk = nextPassword.length >= PASSWORD_POLICY.minLength;
    const classesOk = classCount >= PASSWORD_POLICY.requiredClassCount;

    return {
      lengthOk,
      classesOk,
      classCount,
    };
  }, [nextPassword]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const values = { currentPassword, nextPassword, confirmPassword };
    const errors = validateForm(values);
    setClientErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

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
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">当前密码</span>
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          className="crm-input"
          placeholder="请输入当前使用的临时密码或旧密码"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          disabled={pending}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">新密码</span>
        <input
          type="password"
          name="nextPassword"
          autoComplete="new-password"
          className="crm-input"
          placeholder={PASSWORD_POLICY.message}
          value={nextPassword}
          onChange={(event) => {
            setNextPassword(event.target.value);
            if (clientErrors.nextPassword) {
              setClientErrors((prev) => ({ ...prev, nextPassword: undefined }));
            }
          }}
          required
          disabled={pending}
          aria-invalid={Boolean(clientErrors.nextPassword)}
          aria-describedby="next-password-policy"
        />
        <p
          id="next-password-policy"
          className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"
        >
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-foreground/60" aria-hidden />
          <span>{PASSWORD_POLICY.message}</span>
        </p>
        {strengthHint ? (
          <p className="text-xs leading-5 text-muted-foreground">
            <span
              className={
                strengthHint.lengthOk ? "text-foreground/70" : "text-destructive"
              }
            >
              长度 {nextPassword.length}/{PASSWORD_POLICY.minLength}
            </span>
            <span className="mx-2 text-foreground/30">·</span>
            <span
              className={
                strengthHint.classesOk ? "text-foreground/70" : "text-destructive"
              }
            >
              字符类型 {strengthHint.classCount}/{PASSWORD_POLICY.requiredClassCount}
            </span>
          </p>
        ) : null}
        {clientErrors.nextPassword ? (
          <p className="text-xs leading-5 text-destructive">
            {clientErrors.nextPassword}
          </p>
        ) : null}
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">确认新密码</span>
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          className="crm-input"
          placeholder="再次输入新密码"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            if (clientErrors.confirmPassword) {
              setClientErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }
          }}
          required
          disabled={pending}
          aria-invalid={Boolean(clientErrors.confirmPassword)}
        />
        {clientErrors.confirmPassword ? (
          <p className="text-xs leading-5 text-destructive">
            {clientErrors.confirmPassword}
          </p>
        ) : null}
      </label>

      {state.message ? (
        <ActionBanner tone={state.status === "success" ? "success" : "danger"}>
          {state.message}
        </ActionBanner>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "保存中..." : "更新密码并重新登录"}
      </button>
    </form>
  );
}
