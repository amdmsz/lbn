import type { RoleCode } from "@prisma/client";

export type NavigationIconName =
  | "dashboard"
  | "leads"
  | "leadImports"
  | "customers"
  | "suppliers"
  | "products"
  | "liveSessions"
  | "orders"
  | "paymentRecords"
  | "collectionTasks"
  | "gifts"
  | "shipping"
  | "shippingExportBatches"
  | "reports"
  | "settings";

export type NavigationItem = {
  title: string;
  href: string;
  description: string;
  iconName: NavigationIconName;
  activePrefixes?: string[];
  excludePrefixes?: string[];
};

export type NavigationSection = {
  title?: string;
  description?: string;
  items: NavigationItem[];
};

export type NavigationGroup = {
  key: string;
  title: string;
  description: string;
  sections: NavigationSection[];
};

function createItem(item: NavigationItem) {
  return item;
}

const navigationItems = {
  dashboard: createItem({
    title: "Dashboard",
    href: "/dashboard",
    description: "按角色查看今日重点、工作队列与业务入口。",
    iconName: "dashboard",
    activePrefixes: ["/dashboard"],
  }),
  customers: createItem({
    title: "客户中心",
    href: "/customers",
    description: "销售主工作台与组织级客户经营视图。",
    iconName: "customers",
    activePrefixes: ["/customers"],
  }),
  leads: createItem({
    title: "线索中心",
    href: "/leads",
    description: "处理线索复核、分配、归并与审计。",
    iconName: "leads",
    activePrefixes: ["/leads"],
  }),
  leadImports: createItem({
    title: "导入中心",
    href: "/lead-imports",
    description: "管理导入批次、模板与异常回看。",
    iconName: "leadImports",
    activePrefixes: ["/lead-imports", "/lead-import-templates"],
  }),
  liveSessions: createItem({
    title: "直播场次",
    href: "/live-sessions",
    description: "直播协同、邀约记录与运营配合入口。",
    iconName: "liveSessions",
    activePrefixes: ["/live-sessions"],
  }),
  suppliers: createItem({
    title: "供货商中心",
    href: "/suppliers",
    description: "维护供货商主数据与履约上游信息。",
    iconName: "suppliers",
    activePrefixes: ["/suppliers"],
  }),
  products: createItem({
    title: "商品中心",
    href: "/products",
    description: "维护商品与 SKU 主数据。",
    iconName: "products",
    activePrefixes: ["/products"],
  }),
  orders: createItem({
    title: "订单中心",
    href: "/orders",
    description: "管理 SalesOrder、审核与交易结果。",
    iconName: "orders",
    activePrefixes: ["/orders"],
  }),
  paymentRecords: createItem({
    title: "收款记录",
    href: "/payment-records",
    description: "查看收款提交、确认与驳回结果。",
    iconName: "paymentRecords",
    activePrefixes: ["/payment-records"],
  }),
  collectionTasks: createItem({
    title: "催收任务",
    href: "/collection-tasks",
    description: "跟进尾款、COD 与运费催收任务。",
    iconName: "collectionTasks",
    activePrefixes: ["/collection-tasks"],
  }),
  shipping: createItem({
    title: "发货中心",
    href: "/shipping",
    description: "履约执行台、状态推进与结果回看。",
    iconName: "shipping",
    activePrefixes: ["/shipping"],
    excludePrefixes: ["/shipping/export-batches"],
  }),
  shippingExportBatches: createItem({
    title: "报单批次",
    href: "/shipping/export-batches",
    description: "回看导出批次、供货商报单与历史记录。",
    iconName: "shippingExportBatches",
    activePrefixes: ["/shipping/export-batches"],
  }),
  gifts: createItem({
    title: "礼品管理",
    href: "/gifts",
    description: "处理礼品资格、礼品履约与兼容路径。",
    iconName: "gifts",
    activePrefixes: ["/gifts"],
  }),
  reports: createItem({
    title: "报表中心",
    href: "/reports",
    description: "查看经营、履约与财务预览。",
    iconName: "reports",
    activePrefixes: ["/reports"],
  }),
  settingsCenter: createItem({
    title: "设置中心",
    href: "/settings",
    description: "组织、账号与主数据中台总览。",
    iconName: "settings",
    activePrefixes: ["/settings"],
  }),
  settingsUsers: createItem({
    title: "账号管理",
    href: "/settings/users",
    description: "维护内部账号、角色、状态与密码流程。",
    iconName: "settings",
    activePrefixes: ["/settings/users"],
  }),
  settingsTeams: createItem({
    title: "团队管理",
    href: "/settings/teams",
    description: "维护团队结构、主管与成员归属。",
    iconName: "settings",
    activePrefixes: ["/settings/teams"],
  }),
  settingsTags: createItem({
    title: "标签与分类",
    href: "/settings/tag-groups",
    description: "统一维护标签组、分类和标签定义。",
    iconName: "settings",
    activePrefixes: ["/settings/tag-groups", "/settings/tag-categories", "/settings/tags"],
  }),
  settingsDictionaries: createItem({
    title: "字典与类目",
    href: "/settings/dictionaries",
    description: "维护字典类型、字典项与基础类目。",
    iconName: "settings",
    activePrefixes: ["/settings/dictionaries"],
  }),
} as const;

type NavigationTree = Record<RoleCode, NavigationGroup[]>;

const navigationTree: NavigationTree = {
  ADMIN: [
    {
      key: "workspace",
      title: "工作台",
      description: "组织级驾驶舱与关键任务入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "客户、线索、导入与直播协同。",
      sections: [
        {
          items: [
            navigationItems.customers,
            navigationItems.leads,
            navigationItems.leadImports,
            navigationItems.liveSessions,
          ],
        },
      ],
    },
    {
      key: "commerce",
      title: "商品交易",
      description: "商品主数据、交易审核与收款协同。",
      sections: [
        {
          items: [
            navigationItems.suppliers,
            navigationItems.products,
            navigationItems.orders,
          ],
        },
        {
          title: "收款协同",
          items: [navigationItems.paymentRecords, navigationItems.collectionTasks],
        },
      ],
    },
    {
      key: "fulfillment",
      title: "履约中心",
      description: "发货执行、报单批次与礼品协同。",
      sections: [
        {
          items: [
            navigationItems.shipping,
            navigationItems.shippingExportBatches,
            navigationItems.gifts,
          ],
        },
      ],
    },
    {
      key: "analytics",
      title: "数据分析",
      description: "经营分析与财务预览入口。",
      sections: [{ items: [navigationItems.reports] }],
    },
    {
      key: "settings",
      title: "设置中心",
      description: "组织与主数据中台。",
      sections: [
        {
          items: [navigationItems.settingsCenter],
        },
        {
          title: "组织与账号",
          items: [navigationItems.settingsUsers, navigationItems.settingsTeams],
        },
        {
          title: "主数据",
          items: [navigationItems.settingsTags, navigationItems.settingsDictionaries],
        },
      ],
    },
  ],
  SUPERVISOR: [
    {
      key: "workspace",
      title: "工作台",
      description: "团队经营与协同入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "团队客户、线索、导入与直播协同。",
      sections: [
        {
          items: [
            navigationItems.customers,
            navigationItems.leads,
            navigationItems.leadImports,
            navigationItems.liveSessions,
          ],
        },
      ],
    },
    {
      key: "commerce",
      title: "商品交易",
      description: "订单审核、商品主数据与团队收款。",
      sections: [
        {
          items: [
            navigationItems.suppliers,
            navigationItems.products,
            navigationItems.orders,
          ],
        },
        {
          title: "收款协同",
          items: [navigationItems.paymentRecords, navigationItems.collectionTasks],
        },
      ],
    },
    {
      key: "fulfillment",
      title: "履约中心",
      description: "查看团队履约、报单与礼品结果。",
      sections: [
        {
          items: [
            navigationItems.shipping,
            navigationItems.shippingExportBatches,
            navigationItems.gifts,
          ],
        },
      ],
    },
    {
      key: "analytics",
      title: "数据分析",
      description: "查看团队经营和异常摘要。",
      sections: [{ items: [navigationItems.reports] }],
    },
    {
      key: "settings",
      title: "设置中心",
      description: "组织与主数据中台。",
      sections: [
        {
          items: [navigationItems.settingsCenter],
        },
        {
          title: "组织与账号",
          items: [navigationItems.settingsUsers, navigationItems.settingsTeams],
        },
        {
          title: "主数据",
          items: [navigationItems.settingsTags, navigationItems.settingsDictionaries],
        },
      ],
    },
  ],
  SALES: [
    {
      key: "workspace",
      title: "工作台",
      description: "个人客户工作台与结果摘要。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "客户主线与直播邀约协同。",
      sections: [
        {
          items: [navigationItems.customers, navigationItems.liveSessions],
        },
      ],
    },
    {
      key: "commerce",
      title: "商品交易",
      description: "我的订单、收款和催收任务。",
      sections: [
        {
          items: [navigationItems.orders],
        },
        {
          title: "收款协同",
          items: [navigationItems.paymentRecords, navigationItems.collectionTasks],
        },
      ],
    },
  ],
  OPS: [
    {
      key: "workspace",
      title: "工作台",
      description: "运营协同与常用入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "operations",
      title: "运营协同",
      description: "直播场次和礼品协同。",
      sections: [
        {
          items: [navigationItems.liveSessions, navigationItems.gifts],
        },
      ],
    },
    {
      key: "product-collaboration",
      title: "商品协同",
      description: "商品信息协同查看与配置支持。",
      sections: [{ items: [navigationItems.products] }],
    },
  ],
  SHIPPER: [
    {
      key: "workspace",
      title: "工作台",
      description: "履约执行摘要与待办入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "fulfillment",
      title: "履约中心",
      description: "发货执行与报单批次。",
      sections: [
        {
          items: [navigationItems.shipping, navigationItems.shippingExportBatches],
        },
      ],
    },
  ],
};

export function getNavigationGroupsForRole(role: RoleCode) {
  return navigationTree[role] ?? [];
}
