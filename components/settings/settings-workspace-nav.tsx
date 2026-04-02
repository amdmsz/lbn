import { RecordTabs } from "@/components/shared/record-tabs";

const settingsTabs = [
  {
    value: "overview",
    label: "设置概览",
    href: "/settings",
  },
  {
    value: "users",
    label: "账号管理",
    href: "/settings/users",
  },
  {
    value: "teams",
    label: "团队管理",
    href: "/settings/teams",
  },
  {
    value: "tag-groups",
    label: "标签组",
    href: "/settings/tag-groups",
  },
  {
    value: "tag-categories",
    label: "标签分类",
    href: "/settings/tag-categories",
  },
  {
    value: "tags",
    label: "标签",
    href: "/settings/tags",
  },
  {
    value: "dictionaries",
    label: "字典中心",
    href: "/settings/dictionaries",
  },
] as const;

export function SettingsWorkspaceNav({
  activeValue,
}: Readonly<{
  activeValue: (typeof settingsTabs)[number]["value"];
}>) {
  return (
    <RecordTabs
      items={settingsTabs.map((item) => ({ ...item }))}
      activeValue={activeValue}
    />
  );
}
