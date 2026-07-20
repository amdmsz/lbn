const STALE_DEPLOYMENT_ERROR_MARKERS = [
  "Loading chunk",
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "Failed to find Server Action",
  "older or newer deployment",
] as const;

const REDACTED_SERVER_COMPONENT_ERROR_MARKERS = [
  "An error occurred in the Server Components render",
  "omitted in production builds",
] as const;

/**
 * Next.js 会在 production 中脱敏 Server Component / Server Action 异常。
 * 因此发布后旧页面提交过期 Action ID 时，客户端拿不到
 * `Failed to find Server Action` 原文，只能看到统一的脱敏提示。
 *
 * 对这两类错误允许执行一次完整页面刷新，以获取当前部署的 HTML / JS / RSC
 * 资源。真正的后端错误刷新后仍会再次进入 error boundary，并受页面端 cooldown
 * 保护，不会形成刷新循环。
 */
export function shouldHardReloadCustomerPageError(
  error: Pick<Error, "message">,
) {
  const message = error.message ?? "";

  if (STALE_DEPLOYMENT_ERROR_MARKERS.some((marker) => message.includes(marker))) {
    return true;
  }

  return REDACTED_SERVER_COMPONENT_ERROR_MARKERS.every((marker) =>
    message.includes(marker),
  );
}
