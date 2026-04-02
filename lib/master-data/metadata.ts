import type { Tag } from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

type SearchParamsValue = string | string[] | undefined;

export const masterDataLinks = [
  {
    href: "/settings/tag-groups",
    title: "标签组",
    description: "维护标签分组，用于承载一类业务标签。",
  },
  {
    href: "/settings/tag-categories",
    title: "标签分类",
    description: "维护标签分类，作为标签组下的二级归类。",
  },
  {
    href: "/settings/tags",
    title: "标签",
    description: "维护客户 / 线索直接使用的业务标签。",
  },
  {
    href: "/settings/dictionaries",
    title: "字典中心",
    description: "维护通用分类、字典类型和字典项。",
  },
] as const;

export type MasterDataNotice =
  | {
      tone: "success" | "danger";
      message: string;
    }
  | null;

export function getStatusBadgeConfig(isActive: boolean): {
  label: string;
  variant: StatusBadgeVariant;
} {
  return isActive
    ? { label: "启用中", variant: "success" }
    : { label: "已停用", variant: "neutral" };
}

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function parseMasterDataNotice(
  searchParams: Record<string, SearchParamsValue> | undefined,
): MasterDataNotice {
  const status =
    getParamValue(searchParams?.noticeStatus) || getParamValue(searchParams?.status);
  const message =
    getParamValue(searchParams?.noticeMessage) || getParamValue(searchParams?.message);

  if (!message || (status !== "success" && status !== "error")) {
    return null;
  }

  return {
    tone: status === "success" ? "success" : "danger",
    message,
  };
}

export function buildTagOptionLabel(
  tag: Pick<Tag, "name" | "code"> & {
    group?: { name: string } | null;
    category?: { name: string } | null;
  },
) {
  const segments = [tag.name];

  if (tag.group?.name) {
    segments.push(tag.group.name);
  }

  if (tag.category?.name) {
    segments.push(tag.category.name);
  }

  return `${segments.join(" / ")} (${tag.code})`;
}

export function isValidHexColor(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
