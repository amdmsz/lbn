import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { auth } from "@/lib/auth/session";
import { BRAND_NAME_CN } from "@/lib/branding";

export default async function ChangePasswordPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl rounded-[2rem] border border-[rgba(32,24,19,0.08)] bg-[rgba(251,248,242,0.78)] p-4 shadow-[0_20px_60px_rgba(55,39,21,0.1)] backdrop-blur md:grid md:grid-cols-[1fr_0.95fr] md:gap-8 md:p-8">
        <section className="hidden rounded-[1.5rem] bg-[linear-gradient(180deg,#261c16_0%,#3a281d_100%)] p-8 text-[var(--color-sidebar-foreground)] md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-sidebar-muted)]">
              {BRAND_NAME_CN}
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              {session.user.mustChangePassword ? "首次登录先修改密码。" : "修改你的登录密码。"}
            </h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-[var(--color-sidebar-muted)]">
              {session.user.mustChangePassword
                ? "当前账号使用的是临时密码。只有完成改密并重新登录后，才能继续进入系统。"
                : "修改后会立即退出当前登录状态，请使用新密码重新登录。"}
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-[var(--color-sidebar-muted)]">
            当前账号：
            <br />
            {session.user.name ?? session.user.username}（@{session.user.username}）
          </div>
        </section>

        <section className="flex items-center justify-center p-2 md:p-6">
          <div className="crm-card w-full max-w-md p-8">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-accent)]">
                账号安全
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {session.user.mustChangePassword ? "首次登录改密" : "修改密码"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-black/60">
                使用当前密码验证身份后，设置新的登录密码。修改完成后需要重新登录。
              </p>
            </div>

            <div className="mt-8">
              <ChangePasswordForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
