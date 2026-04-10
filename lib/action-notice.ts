import { isRedirectError } from "next/dist/client/components/redirect-error.js";

type SearchParamsValue = string | string[] | undefined;
type ParsedRedirectTarget = {
  pathname: string;
  searchParams: URLSearchParams;
  hash: string;
};

const INTERNAL_REDIRECT_BASE = "https://crm.local";
const INTERNAL_REDIRECT_ORIGIN = new URL(INTERNAL_REDIRECT_BASE).origin;

export type ActionNotice =
  | {
      tone: "success" | "danger";
      message: string;
    }
  | null;

export function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function parseActionNotice(
  searchParams: Record<string, SearchParamsValue> | undefined,
): ActionNotice {
  const status =
    getParamValue(searchParams?.noticeStatus) || getParamValue(searchParams?.status);
  const message =
    getParamValue(searchParams?.noticeMessage) || getParamValue(searchParams?.message);

  if (
    !message ||
    message.startsWith("NEXT_REDIRECT") ||
    (status !== "success" && status !== "error")
  ) {
    return null;
  }

  return {
    tone: status === "success" ? "success" : "danger",
    message,
  };
}

function parseRedirectTarget(input: string): ParsedRedirectTarget | null {
  const trimmed = input.trim();

  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(trimmed, INTERNAL_REDIRECT_BASE);

    if (url.origin !== INTERNAL_REDIRECT_ORIGIN) {
      return null;
    }

    return {
      pathname: url.pathname || "/",
      searchParams: new URLSearchParams(url.search),
      hash: url.hash,
    };
  } catch {
    return null;
  }
}

function formatRedirectTarget(target: ParsedRedirectTarget) {
  const queryString = target.searchParams.toString();
  return `${target.pathname}${queryString ? `?${queryString}` : ""}${target.hash}`;
}

export function sanitizeRedirectTarget(input: string, fallbackPath: string) {
  const parsedTarget =
    parseRedirectTarget(input) ??
    parseRedirectTarget(fallbackPath) ??
    parseRedirectTarget("/")!;

  return formatRedirectTarget(parsedTarget);
}

export function getRedirectPathname(redirectTo: string) {
  const parsedTarget = parseRedirectTarget(redirectTo) ?? parseRedirectTarget("/")!;
  return parsedTarget.pathname;
}

export function appendRedirectSearchParams(
  redirectTo: string,
  extraParams: Record<string, string | undefined>,
) {
  const parsedTarget = parseRedirectTarget(redirectTo) ?? parseRedirectTarget("/")!;

  for (const [key, value] of Object.entries(extraParams)) {
    if (value) {
      parsedTarget.searchParams.set(key, value);
    }
  }

  return formatRedirectTarget(parsedTarget);
}

export function buildRedirectTarget(
  redirectTo: string,
  status: "success" | "error",
  message: string,
) {
  return appendRedirectSearchParams(redirectTo, {
    noticeStatus: status,
    noticeMessage: message,
  });
}

export function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function rethrowRedirectError(error: unknown) {
  if (isRedirectError(error)) {
    throw error;
  }
}
