import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    if (session.user.mustChangePassword) {
      redirect("/change-password");
    }

    redirect(getDefaultRouteForRole(session.user.role));
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-5xl rounded-[2rem] border border-[rgba(32,24,19,0.08)] bg-[rgba(251,248,242,0.72)] p-4 shadow-[0_20px_60px_rgba(55,39,21,0.1)] backdrop-blur md:grid md:grid-cols-[1.1fr_0.9fr] md:gap-8 md:p-8">
        <section className="hidden rounded-[1.5rem] bg-[linear-gradient(180deg,#261c16_0%,#3a281d_100%)] p-8 text-[var(--color-sidebar-foreground)] md:flex md:flex-col md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-sidebar-muted)]">
              酒水私域 CRM
            </p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight">
              先把登录、角色和路由权限跑通，再承接后续业务模块。
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-[var(--color-sidebar-muted)]">
              当前阶段提供本地演示账号登录、基础会话、角色菜单过滤和路由访问控制，方便验证 CRM 的权限骨架。
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-[var(--color-sidebar-muted)]">
            支持角色：
            <br />
            管理员（admin）/ 主管（supervisor）/ 销售（sales）/ 运营（ops）/ 发货（shipper）
          </div>
        </section>

        <section className="flex items-center justify-center p-2 md:p-6">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
