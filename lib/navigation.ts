import type { RoleCode } from "@prisma/client";
import {
  canAccessLiveSessionModule,
  canAccessProductModule,
  canAccessRecycleBinModule,
  canAccessSupplierModule,
} from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";

export type NavigationIconName =
  | "dashboard"
  | "leads"
  | "leadImports"
  | "customers"
  | "suppliers"
  | "products"
  | "liveSessions"
  | "recycleBin"
  | "orders"
  | "fulfillmentCenter"
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
    description: "查看当前角色的今日重点、工作队列和常用入口。",
    iconName: "dashboard",
    activePrefixes: ["/dashboard"],
  }),
  customers: createItem({
    title: "客户中心",
    href: "/customers",
    description: "客户执行主工作台和客户经营视图。",
    iconName: "customers",
    activePrefixes: ["/customers"],
  }),
  leads: createItem({
    title: "线索中心",
    href: "/leads",
    description: "处理线索复核、分配、归并和审计。",
    iconName: "leads",
    activePrefixes: ["/leads"],
  }),
  leadImports: createItem({
    title: "导入中心",
    href: "/lead-imports",
    description: "管理导入批次、模板和异常回看。",
    iconName: "leadImports",
    activePrefixes: ["/lead-imports", "/lead-import-templates"],
  }),
  liveSessions: createItem({
    title: "直播场次",
    href: "/live-sessions",
    description: "直播协同、邀约记录和运营配合入口。",
    iconName: "liveSessions",
    activePrefixes: ["/live-sessions"],
  }),
  recycleBin: createItem({
    title: "回收站",
    href: "/recycle-bin",
    description: "统一查看商品主数据与直播场次的回收站对象，并执行恢复或最终清理。",
    iconName: "recycleBin",
    activePrefixes: ["/recycle-bin"],
  }),
  suppliers: createItem({
    title: "供应商中心",
    href: "/suppliers",
    description: "兼容入口，已收口到商品中心。",
    iconName: "suppliers",
    activePrefixes: ["/suppliers"],
  }),
  products: createItem({
    title: "商品中心",
    href: "/products",
    description: "维护商品、SKU 和供应商相关主数据。",
    iconName: "products",
    activePrefixes: ["/products"],
  }),
  orders: createItem({
    title: "订单中心 / 交易单",
    href: "/orders",
    description: "兼容入口，当前主线已收口到履约中心。",
    iconName: "orders",
    activePrefixes: ["/orders"],
  }),
  fulfillmentCenter: createItem({
    title: "订单中心",
    href: "/fulfillment",
    description: "统一承接交易单、发货执行和批次记录。",
    iconName: "orders",
    activePrefixes: ["/fulfillment", "/orders", "/shipping"],
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
    description: "跟进尾款、COD 和运费催收任务。",
    iconName: "collectionTasks",
    activePrefixes: ["/collection-tasks"],
  }),
  shipping: createItem({
    title: "订单中心 / 发货执行",
    href: "/shipping",
    description: "兼容入口，已收口到履约中心发货视图。",
    iconName: "shipping",
    activePrefixes: ["/shipping"],
    excludePrefixes: ["/shipping/export-batches"],
  }),
  shippingExportBatches: createItem({
    title: "订单中心 / 批次记录",
    href: "/shipping/export-batches",
    description: "兼容入口，已收口到履约中心批次视图。",
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
    description: "查看经营、履约和财务预览。",
    iconName: "reports",
    activePrefixes: ["/reports"],
  }),
  settingsCenter: createItem({
    title: "设置中心",
    href: "/settings",
    description: "账号、团队、标签、字典和通话结果统一入口。",
    iconName: "settings",
    activePrefixes: ["/settings"],
  }),
  settingsUsers: createItem({
    title: "账号管理",
    href: "/settings/users",
    description: "维护内部账号、角色、状态和密码流程。",
    iconName: "settings",
    activePrefixes: ["/settings/users"],
  }),
  settingsTeams: createItem({
    title: "团队管理",
    href: "/settings/teams",
    description: "维护团队结构、负责人和成员归属。",
    iconName: "settings",
    activePrefixes: ["/settings/teams"],
  }),
  settingsTags: createItem({
    title: "标签体系",
    href: "/settings/tag-groups",
    description: "统一维护标签组、标签分类和标签定义。",
    iconName: "settings",
    activePrefixes: ["/settings/tag-groups", "/settings/tag-categories", "/settings/tags"],
  }),
  settingsDictionaries: createItem({
    title: "字典配置",
    href: "/settings/dictionaries",
    description: "维护字典类型、字典项和基础类目。",
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
      description: "组织级驾驶舱和关键任务入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "客户、线索、导入和直播协同。",
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
      description: "商品主数据、交易审核和收款协同。",
      sections: [
        {
          items: [navigationItems.products, navigationItems.fulfillmentCenter],
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
      description: "礼品协同和履约相关结果回看。",
      sections: [{ items: [navigationItems.gifts] }],
    },
    {
      key: "analytics",
      title: "数据分析",
      description: "经营分析和管理视图入口。",
      sections: [{ items: [navigationItems.reports] }],
    },
    {
      key: "settings",
      title: "设置中心",
      description: "设置域统一入口，不再把 settings 子页拆成多个 sidebar 入口。",
      sections: [{ items: [navigationItems.settingsCenter] }],
    },
  ],
  SUPERVISOR: [
    {
      key: "workspace",
      title: "工作台",
      description: "团队经营和协同入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "团队客户、线索、导入和直播协同。",
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
      description: "订单审核、商品主数据和团队收款。",
      sections: [
        {
          items: [navigationItems.products, navigationItems.fulfillmentCenter],
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
      description: "查看团队履约、报单和礼品结果。",
      sections: [{ items: [navigationItems.gifts] }],
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
      description: "设置域统一入口，不再把 settings 子页拆成多个 sidebar 入口。",
      sections: [{ items: [navigationItems.settingsCenter] }],
    },
  ],
  SALES: [
    {
      key: "workspace",
      title: "工作台",
      description: "个人客户工作台和结果摘要。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "customer-operations",
      title: "客户运营",
      description: "客户主线与直播邀约协同。",
      sections: [{ items: [navigationItems.customers, navigationItems.liveSessions] }],
    },
    {
      key: "commerce",
      title: "商品交易",
      description: "我的订单、收款和催收任务。",
      sections: [
        {
          items: [navigationItems.fulfillmentCenter],
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
      description: "运营协同和常用入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "operations",
      title: "运营协同",
      description: "直播场次和礼品协同。",
      sections: [{ items: [navigationItems.liveSessions, navigationItems.gifts] }],
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
      description: "履约执行摘要和待办入口。",
      sections: [{ items: [navigationItems.dashboard] }],
    },
    {
      key: "operations",
      title: "协同支持",
      description: "直播场次协同与跨岗位活动信息维护。",
      sections: [{ items: [navigationItems.liveSessions] }],
    },
    {
      key: "fulfillment",
      title: "履约中心",
      description: "发货执行、报单批次与履约相关主数据协同。",
      sections: [{ items: [navigationItems.fulfillmentCenter, navigationItems.products] }],
    },
  ],
};

function canAccessNavigationItem(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[],
  item: NavigationItem,
) {
  if (item.href === "/live-sessions") {
    return canAccessLiveSessionModule(role, permissionCodes);
  }

  if (item.href === "/products") {
    return canAccessProductModule(role, permissionCodes);
  }

  if (item.href === "/suppliers") {
    return canAccessSupplierModule(role, permissionCodes);
  }

  if (item.href === "/recycle-bin") {
    return canAccessRecycleBinModule(role, permissionCodes);
  }

  return true;
}

function hasNavigationItem(groups: NavigationGroup[], href: string) {
  return groups.some((group) =>
    group.sections.some((section) => section.items.some((item) => item.href === href)),
  );
}

export function getNavigationGroupsForRole(
  role: RoleCode,
  permissionCodes: readonly ExtraPermissionCode[] = [],
) {
  const filteredGroups = (navigationTree[role] ?? [])
    .map((group) => ({
      ...group,
      sections: group.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            canAccessNavigationItem(role, permissionCodes, item),
          ),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((group) => group.sections.length > 0);

  const groupsWithRecycleBin =
    canAccessRecycleBinModule(role, permissionCodes) &&
    !hasNavigationItem(filteredGroups, navigationItems.recycleBin.href)
      ? [
          ...filteredGroups,
          {
            key: "governance-tools",
            title: "治理工具",
            description: "统一承接删除治理、恢复与最终清理等低频系统动作。",
            sections: [{ items: [navigationItems.recycleBin] }],
          },
        ]
      : filteredGroups;

  const grantedItems: NavigationItem[] = [];

  if (
    canAccessLiveSessionModule(role, permissionCodes) &&
    !hasNavigationItem(groupsWithRecycleBin, navigationItems.liveSessions.href)
  ) {
    grantedItems.push(navigationItems.liveSessions);
  }

  if (
    canAccessProductModule(role, permissionCodes) &&
    !hasNavigationItem(groupsWithRecycleBin, navigationItems.products.href)
  ) {
    grantedItems.push(navigationItems.products);
  }

  if (grantedItems.length === 0) {
    return groupsWithRecycleBin;
  }

  return [
    ...groupsWithRecycleBin,
    {
      key: "granted-access",
      title: "额外授权",
      description: "由管理员按账号追加的跨岗位模块入口。",
      sections: [{ items: grantedItems }],
    },
  ];
}
