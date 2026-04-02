"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const demoUsers = [
  "admin",
  "supervisor",
  "sales",
  "ops",
  "shipper",
  "supervisor2",
  "sales2",
] as const;
const demoUserLabels: Record<(typeof demoUsers)[number], string> = {
  admin: "管理员",
  supervisor: "主管",
  sales: "销售",
  ops: "运营",
  shipper: "发货",
  supervisor2: "主管（北区）",
  sales2: "销售（北区）",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("demo123456");
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
      setError("账号或密码错误，或数据库尚未执行 seed。");
      return;
    }

    router.push(result.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <div className="crm-card w-full max-w-md p-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-accent)]">
          酒水私域 CRM
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">本地登录</h1>
        <p className="mt-3 text-sm leading-7 text-black/60">
          当前环境使用本地演示账号登录，便于验证角色、菜单与权限流转。
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

      <div className="mt-8 rounded-2xl border border-black/8 bg-[var(--color-panel-strong)] p-4">
        <p className="text-sm font-medium text-black/80">演示账号</p>
        <p className="mt-2 text-sm text-black/60">
          默认密码统一为 <code>demo123456</code>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {demoUsers.map((user) => (
            <button
              key={user}
              type="button"
              onClick={() => {
                setUsername(user);
                setPassword("demo123456");
              }}
              className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs text-black/70 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {demoUserLabels[user]}（{user}）
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
