export const settingsOverviewItem = {
  value: "overview",
  label: "设置概览",
  href: "/settings",
  description: "设置中心承接页",
} as const;

export const settingsWorkspaceSections = [
  {
    key: "organization",
    title: "组织与账号",
    items: [
      {
        value: "users",
        label: "账号管理",
        href: "/settings/users",
        description: "内部账号、角色与状态",
      },
      {
        value: "teams",
        label: "团队管理",
        href: "/settings/teams",
        description: "团队结构与负责人归属",
      },
    ],
  },
  {
    key: "tags",
    title: "标签体系",
    items: [
      {
        value: "tag-groups",
        label: "标签组",
        href: "/settings/tag-groups",
        description: "标签体系一级分组",
      },
      {
        value: "tag-categories",
        label: "标签分类",
        href: "/settings/tag-categories",
        description: "标签二级归类",
      },
      {
        value: "tags",
        label: "标签",
        href: "/settings/tags",
        description: "客户与线索实际使用标签",
      },
    ],
  },
  {
    key: "dictionaries",
    title: "字典配置",
    items: [
      {
        value: "dictionaries",
        label: "字典与类目",
        href: "/settings/dictionaries",
        description: "通用类目、类型和值域",
      },
    ],
  },
  {
    key: "calls",
    title: "通话与跟进",
    items: [
      {
        value: "call-results",
        label: "通话结果",
        href: "/settings/call-results",
        description: "系统结果与自定义结果配置",
      },
    ],
  },
] as const;

export type SettingsWorkspaceValue =
  | typeof settingsOverviewItem.value
  | (typeof settingsWorkspaceSections)[number]["items"][number]["value"];
