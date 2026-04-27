export const settingsOverviewItem = {
  value: "overview",
  label: "设置概览",
  href: "/settings",
  description: "管理员配置入口",
  access: "master",
} as const;

export const settingsWorkspaceSections = [
  {
    key: "site",
    title: "站点与安全",
    items: [
      {
        value: "site",
        label: "网站信息",
        href: "/settings/site",
        description: "站点名称、企业资料与登录展示",
        access: "admin",
      },
      {
        value: "security",
        label: "登录安全",
        href: "/settings/security",
        description: "密码、会话和安全策略",
        access: "admin",
      },
    ],
  },
  {
    key: "organization",
    title: "账号权限",
    items: [
      {
        value: "users",
        label: "账号管理",
        href: "/settings/users",
        description: "内部账号、角色与状态",
        access: "master",
      },
      {
        value: "teams",
        label: "团队管理",
        href: "/settings/teams",
        description: "团队结构与负责人归属",
        access: "master",
      },
    ],
  },
  {
    key: "business",
    title: "业务规则",
    items: [
      {
        value: "tag-groups",
        label: "标签组",
        href: "/settings/tag-groups",
        description: "标签体系一级分组",
        access: "master",
      },
      {
        value: "tag-categories",
        label: "标签分类",
        href: "/settings/tag-categories",
        description: "标签二级归类",
        access: "master",
      },
      {
        value: "tags",
        label: "标签",
        href: "/settings/tags",
        description: "客户与线索实际使用标签",
        access: "master",
      },
      {
        value: "dictionaries",
        label: "字典与类目",
        href: "/settings/dictionaries",
        description: "通用类目、类型和值域",
        access: "master",
      },
      {
        value: "call-results",
        label: "通话结果",
        href: "/settings/call-results",
        description: "系统结果与自定义结果配置",
        access: "master",
      },
    ],
  },
  {
    key: "recording",
    title: "外呼录音",
    items: [
      {
        value: "outbound-call",
        label: "外呼 CTI",
        href: "/settings/outbound-call",
        description: "CTI 网关、坐席绑定与回调策略",
        access: "admin",
      },
      {
        value: "recording-storage",
        label: "录音存储",
        href: "/settings/recording-storage",
        description: "本地挂载、分片上传与保留周期",
        access: "admin",
      },
    ],
  },
  {
    key: "ai",
    title: "AI 配置",
    items: [
      {
        value: "call-ai",
        label: "录音 AI",
        href: "/settings/call-ai",
        description: "ASR、分析模型与说话人分离",
        access: "admin",
      },
    ],
  },
  {
    key: "audit",
    title: "审计运行",
    items: [
      {
        value: "audit",
        label: "审计与运行时",
        href: "/settings/audit",
        description: "配置变更、队列与 worker 状态",
        access: "admin",
      },
    ],
  },
] as const;

export type SettingsWorkspaceValue =
  | typeof settingsOverviewItem.value
  | (typeof settingsWorkspaceSections)[number]["items"][number]["value"];

export type SettingsViewerRole =
  | "ADMIN"
  | "SUPERVISOR"
  | "SALES"
  | "OPS"
  | "SHIPPER";

export type SettingsWorkspaceItem =
  (typeof settingsWorkspaceSections)[number]["items"][number];

export type SettingsWorkspaceSection = {
  key: (typeof settingsWorkspaceSections)[number]["key"];
  title: string;
  items: SettingsWorkspaceItem[];
};

export function canViewSettingsWorkspaceItem(
  role: SettingsViewerRole | undefined,
  item: SettingsWorkspaceItem,
) {
  return item.access !== "admin" || role === "ADMIN";
}

export function getVisibleSettingsWorkspaceSections(
  role: SettingsViewerRole | undefined,
) {
  return settingsWorkspaceSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        canViewSettingsWorkspaceItem(role, item),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
