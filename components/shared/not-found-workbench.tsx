"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Compass,
  FileQuestion,
  Home,
  LockKeyhole,
  RefreshCcw,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NotFoundWorkbenchProps = {
  withinDashboard?: boolean;
};

const actionClassName =
  "inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 text-[12px] font-medium text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,color,background-color] duration-200 hover:border-[rgba(111,141,255,0.2)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

function getReadableReason(pathname: string) {
  if (/^\/(customers|leads|orders|products|lead-imports|settings\/users)\/[^/]+/.test(pathname)) {
    return {
      title: "记录不存在或当前账号不可见",
      description:
        "这个详情页通常依赖一条具体记录。出现 404 可能是记录已删除、已移入回收站、ID 已失效，或当前角色没有该记录的服务端可见权限。",
      icon: <LockKeyhole className="h-5 w-5" />,
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "设置入口不存在或权限不足",
      description:
        "设置页按角色开放。主管只能进入允许的主数据配置；管理员之外的账号访问系统级入口时，可能会被拦截或看到 404。",
      icon: <ShieldAlert className="h-5 w-5" />,
    };
  }

  if (pathname.startsWith("/api")) {
    return {
      title: "接口资源没有找到",
      description:
        "这是 API 地址，不是业务页面。可能是附件、头像、商品图片、导出文件或批次进度资源不存在。",
      icon: <FileQuestion className="h-5 w-5" />,
    };
  }

  return {
    title: "页面路径没有匹配到当前 CRM 入口",
    description:
      "可能是旧链接、拼写错误、已下线的兼容路径，或浏览器里保留了历史地址。请从左侧菜单或下方快捷入口重新进入。",
    icon: <Compass className="h-5 w-5" />,
  };
}

function ReasonCard({
  icon,
  title,
  children,
}: Readonly<{
  icon: ReactNode;
  title: string;
  children: ReactNode;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-xs)]">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-shell-surface)] text-[var(--foreground)]">
        {icon}
      </div>
      <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
      <div className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        {children}
      </div>
    </div>
  );
}

export function NotFoundWorkbench({ withinDashboard = false }: Readonly<NotFoundWorkbenchProps>) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const fullPath = queryString ? `${pathname}?${queryString}` : pathname;
  const reason = getReadableReason(pathname);

  return (
    <main
      className={cn(
        "mx-auto w-full max-w-6xl px-4 py-6 md:px-6",
        withinDashboard ? "" : "flex min-h-screen items-center",
      )}
    >
      <div className="w-full space-y-3">
        <section className="relative overflow-hidden rounded-[1.25rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-5 shadow-[var(--color-shell-shadow-md)] md:p-6">
          <div className="pointer-events-none absolute right-6 top-6 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(111,141,255,0.18),transparent_68%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(111,141,255,0.14)] bg-[var(--color-shell-surface-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                <SearchX className="h-3.5 w-3.5" />
                404 · Page Not Found
              </div>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-3xl">
                这个页面暂时无法打开
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--color-sidebar-muted)]">
                系统没有直接丢给你空白页，而是把可能原因列出来，方便判断是链接问题、数据不存在，还是权限范围导致不可见。
              </p>
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2 text-[12px] text-[var(--color-sidebar-muted)]">
                当前地址：<span className="font-mono text-[var(--foreground)]">{fullPath}</span>
              </div>
            </div>
            <div className="grid min-w-[14rem] grid-cols-2 gap-2 rounded-[1.1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-3 shadow-[var(--color-shell-shadow-xs)]">
              <div className="rounded-[0.9rem] bg-[var(--color-shell-surface)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                  Status
                </div>
                <div className="mt-1 text-2xl font-semibold text-[var(--foreground)]">404</div>
              </div>
              <div className="rounded-[0.9rem] bg-[var(--color-shell-surface)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                  Scope
                </div>
                <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  CRM Route
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[1.15rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4 shadow-[var(--color-shell-shadow-sm)]">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
                {reason.icon}
              </span>
              <div>
                <div className="text-sm font-semibold text-[var(--foreground)]">{reason.title}</div>
                <p className="mt-2 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                  {reason.description}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/dashboard" className={actionClassName}>
                <Home className="h-4 w-4" />
                回到看板
              </Link>
              <Link href="/customers" className={actionClassName}>
                客户中心
              </Link>
              <button type="button" onClick={() => window.history.back()} className={actionClassName}>
                <ArrowLeft className="h-4 w-4" />
                返回上一页
              </button>
              <button type="button" onClick={() => window.location.reload()} className={actionClassName}>
                <RefreshCcw className="h-4 w-4" />
                重新加载
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <ReasonCard icon={<FileQuestion className="h-5 w-5" />} title="记录已不存在">
              详情页对应的客户、线索、订单、商品或导入批次可能已经删除、回收或 ID 失效。
            </ReasonCard>
            <ReasonCard icon={<ShieldAlert className="h-5 w-5" />} title="权限范围不可见">
              服务端 RBAC 会按角色、团队和归属过滤数据；不可见记录不会暴露详情。
            </ReasonCard>
            <ReasonCard icon={<Compass className="h-5 w-5" />} title="旧链接或错误路径">
              如果是收藏夹或聊天记录里的旧地址，请从 CRM 左侧菜单重新进入最新入口。
            </ReasonCard>
          </div>
        </section>
      </div>
    </main>
  );
}
