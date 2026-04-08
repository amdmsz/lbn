"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND_NAME_CN } from "@/lib/branding";

function resolveLoginTarget(resultUrl: string | null | undefined, fallbackPath: string) {
  if (!resultUrl) {
    return fallbackPath;
  }

  if (typeof window === "undefined") {
    return resultUrl;
  }

  try {
    const resolvedUrl = new URL(resultUrl, window.location.origin);
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}` || fallbackPath;
  } catch {
    return resultUrl.startsWith("/") ? resultUrl : fallbackPath;
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
      callbackUrl,
    });

    setPending(false);

    if (!result || result.error) {
      setError("账号或密码错误，或当前环境尚未完成管理员初始化。");
      return;
    }

    router.push(resolveLoginTarget(result.url, callbackUrl));
    router.refresh();
  }

  return (
    <div className="crm-card w-full max-w-md p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-accent)]">
          {BRAND_NAME_CN}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">账号登录</h1>
        <p className="mt-3 text-sm leading-7 text-black/60">
          使用已初始化的内部账号登录。首次登录如被要求改密，请按提示先完成密码更新。
        </p>
      </div>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
        {passwordChanged ? (
          <p className="rounded-2xl border border-[rgba(58,120,91,0.2)] bg-[rgba(58,120,91,0.08)] px-4 py-3 text-sm text-[var(--color-success)]">
            密码已更新，请使用新密码重新登录。
          </p>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-medium text-black/80">账号</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--color-accent)]"
            placeholder="请输入账号"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-black/80">密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 outline-none transition focus:border-[var(--color-accent)]"
            placeholder="请输入密码"
          />
        </label>

        {error ? (
          <p className="rounded-2xl border border-[rgba(141,59,51,0.2)] bg-[rgba(141,59,51,0.08)] px-4 py-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
