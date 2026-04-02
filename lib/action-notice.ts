import { isRedirectError } from "next/dist/client/components/redirect-error";

type SearchParamsValue = string | string[] | undefined;

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

export function buildRedirectTarget(
  redirectTo: string,
  status: "success" | "error",
  message: string,
) {
  const [pathname, queryString = ""] = redirectTo.split("?");
  const params = new URLSearchParams(queryString);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `${pathname}?${params.toString()}`;
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
