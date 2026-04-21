import "dotenv/config";
import {
  AssignmentType,
  AttendanceStatus,
  CallResult,
  CustomerLevel,
  CustomerStatus,
  GiftQualificationSource,
  GiftReviewStatus,
  InvitationMethod,
  InvitationStatus,
  LeadSource,
  LeadStatus,
  LiveSessionStatus,
  OperationModule,
  OperationTargetType,
  OrderStatus,
  OrderType,
  PaymentStatus,
  PrismaClient,
  ShippingStatus,
  UserStatus,
  WechatAddStatus,
} from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { randomBytes, scryptSync } from "node:crypto";

// Local demo seed only.
// Do not use this script for staging or production bootstrap.

console.warn("[db:seed] Local demo seed only. Do not run this script in staging or production.");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run prisma seed.");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

const demoPassword = "demo123456";
const leadSeedTag = "[seed:milestone4]";
const customerSeedTag = "[seed:milestone5]";
const masterDataSeedTag = "[seed:milestone11]";
const accountSeedTag = "[seed:organization-account-management]";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

const roles = [
  ["ADMIN", "Admin", "System administrator"],
  ["SUPERVISOR", "Supervisor", "Team supervisor"],
  ["SALES", "Sales", "Sales user"],
  ["OPS", "Ops", "Operations user"],
  ["SHIPPER", "Shipper", "Shipping user"],
];

const teamSeeds = [
  {
    code: "EAST_SALES",
    name: "华东销售一组",
    description: `主管、销售、运营和发货协同的示例团队 ${accountSeedTag}`,
    supervisorUsername: "supervisor",
  },
  {
    code: "NORTH_GROWTH",
    name: "北区增长组",
    description: `用于验证跨团队权限边界的示例团队 ${accountSeedTag}`,
    supervisorUsername: "supervisor2",
  },
];

const userSeeds = [
  {
    username: "admin",
    name: "Admin Demo",
    roleCode: "ADMIN",
    phone: "13900000001",
    teamCode: null,
    supervisorUsername: null,
    invitedByUsername: null,
    invitedAt: null,
    lastLoginAt: "2026-03-31T08:40:00+08:00",
  },
  {
    username: "supervisor",
    name: "Supervisor Demo",
    roleCode: "SUPERVISOR",
    phone: "13900000002",
    teamCode: "EAST_SALES",
    supervisorUsername: null,
    invitedByUsername: "admin",
    invitedAt: "2026-03-29T09:00:00+08:00",
    lastLoginAt: "2026-03-31T09:10:00+08:00",
  },
  {
    username: "sales",
    name: "Sales Demo",
    roleCode: "SALES",
    phone: "13900000003",
    teamCode: "EAST_SALES",
    supervisorUsername: "supervisor",
    invitedByUsername: "supervisor",
    invitedAt: "2026-03-29T09:20:00+08:00",
    lastLoginAt: "2026-03-31T09:25:00+08:00",
  },
  {
    username: "ops",
    name: "Ops Demo",
    roleCode: "OPS",
    phone: "13900000004",
    teamCode: "EAST_SALES",
    supervisorUsername: "supervisor",
    invitedByUsername: "supervisor",
    invitedAt: "2026-03-29T09:25:00+08:00",
    lastLoginAt: "2026-03-30T18:15:00+08:00",
  },
  {
    username: "shipper",
    name: "Shipper Demo",
    roleCode: "SHIPPER",
    phone: "13900000005",
    teamCode: "EAST_SALES",
    supervisorUsername: "supervisor",
    invitedByUsername: "supervisor",
    invitedAt: "2026-03-29T09:30:00+08:00",
    lastLoginAt: "2026-03-30T19:30:00+08:00",
  },
  {
    username: "supervisor2",
    name: "Supervisor North",
    roleCode: "SUPERVISOR",
    phone: "13900000006",
    teamCode: "NORTH_GROWTH",
    supervisorUsername: null,
    invitedByUsername: "admin",
    invitedAt: "2026-03-29T10:00:00+08:00",
    lastLoginAt: "2026-03-31T10:20:00+08:00",
  },
  {
    username: "sales2",
    name: "Sales North",
    roleCode: "SALES",
    phone: "13900000007",
    teamCode: "NORTH_GROWTH",
    supervisorUsername: "supervisor2",
    invitedByUsername: "supervisor2",
    invitedAt: "2026-03-29T10:15:00+08:00",
    lastLoginAt: "2026-03-30T11:00:00+08:00",
  },
];

const leadSeeds = [
  ["13800000001", "Zhang Lin", LeadSource.INFO_FLOW, LeadStatus.NEW, null, "Gift Box A", "Spring First Purchase", "Landing page form", "Shanghai", "Shanghai", "Pudong", "188 Zhangjiang Road", "Waiting for assignment", "2026-03-29T09:10:00+08:00", null, "2026-03-30T10:00:00+08:00"],
  ["13800000002", "Li Qian", LeadSource.INFO_FLOW, LeadStatus.ASSIGNED, "sales", "Vintage Reserve", "Offline Tasting Event", "Event registration page", "Zhejiang", "Hangzhou", "Xihu", "68 Wensan Road", "Assigned and waiting for first call", "2026-03-28T11:20:00+08:00", null, "2026-03-29T15:00:00+08:00"],
  ["13800000003", "Wang Bo", LeadSource.INFO_FLOW, LeadStatus.FIRST_CALL_PENDING, "sales", "Zodiac Collection", "Short Video Ads March", "Ad campaign lead form", "Jiangsu", "Nanjing", "Gulou", "99 Zhongyang Road", "Pending first call", "2026-03-27T14:35:00+08:00", null, "2026-03-29T19:00:00+08:00"],
  ["13800000004", "Chen Xue", LeadSource.INFO_FLOW, LeadStatus.FOLLOWING, "sales", "Business Banquet Set", "Channel Partner Import", "Partner customer list", "Guangdong", "Shenzhen", "Nanshan", "2 Keji South 12th Road", "Already contacted once", "2026-03-26T16:05:00+08:00", "2026-03-28T18:00:00+08:00", "2026-03-30T14:30:00+08:00"],
  ["13800000005", "Zhao Qian", LeadSource.INFO_FLOW, LeadStatus.WECHAT_ADDED, "sales", "Collectors Bottle", "Store Manual Entry", "Store visitor registration", "Beijing", "Beijing", "Chaoyang", "86 Jianguo Road", "Wechat added already", "2026-03-25T10:15:00+08:00", "2026-03-28T11:00:00+08:00", "2026-03-31T20:00:00+08:00"],
  ["13800000006", "Sun Chen", LeadSource.INFO_FLOW, LeadStatus.LIVE_INVITED, "sales", "Premium Banquet Pack", "Referral Lead", "Friend referral", "Sichuan", "Chengdu", "Gaoxin", "299 Tianfu Avenue", "Invited to live session", "2026-03-24T13:45:00+08:00", "2026-03-28T09:30:00+08:00", "2026-03-29T20:00:00+08:00"],
  ["13800000007", "Zhou Yan", LeadSource.INFO_FLOW, LeadStatus.LIVE_WATCHED, "sales", "Wedding Custom Series", "Live Booking Page", "Live signup page", "Hubei", "Wuhan", "Hongshan", "77 Guanshan Avenue", "Watched live already", "2026-03-22T08:55:00+08:00", "2026-03-28T16:40:00+08:00", "2026-03-30T11:30:00+08:00"],
  ["13800000008", "Wu Tao", LeadSource.INFO_FLOW, LeadStatus.ORDERED, "sales", "Enterprise Gift Set", "Historical Customer Import", "Historical spreadsheet import", "Shandong", "Qingdao", "Shinan", "12 Xianggang Middle Road", "Completed first order", "2026-03-20T17:25:00+08:00", "2026-03-27T15:20:00+08:00", null],
  ["13800000009", "Zheng Nan", LeadSource.INFO_FLOW, LeadStatus.CLOSED_LOST, "sales", "Mid-range Daily Series", "Feed Ads", "Ad recovery list", "Henan", "Zhengzhou", "Jinshui", "120 Nongye Road", "Lost after multiple follow-ups", "2026-03-19T12:10:00+08:00", "2026-03-26T10:30:00+08:00", null],
  ["13800000010", "He Jia", LeadSource.INFO_FLOW, LeadStatus.INVALID, null, "Trial Pack", "Third-party Import", "Deduplicated channel list", "Fujian", "Xiamen", "Siming", "Software Park Phase 2", "Invalid number", "2026-03-18T09:40:00+08:00", null, null],
  ["13800000011", "Feng Kai", LeadSource.INFO_FLOW, LeadStatus.NEW, null, "Live Bundle", "City Tasting Salon", "Event signup", "Hunan", "Changsha", "Yuelu", "Meixi Lake Ring Road", "Newly entered pool", "2026-03-17T13:20:00+08:00", null, "2026-03-30T09:00:00+08:00"],
  ["13800000012", "Tang Min", LeadSource.INFO_FLOW, LeadStatus.FOLLOWING, "sales", "Mid-autumn Gift Pack", "Sales Manual Entry", "Phone inquiry registration", "Chongqing", "Chongqing", "Yubei", "100 Jinkai Avenue", "Pricing already discussed", "2026-03-16T15:55:00+08:00", "2026-03-27T09:10:00+08:00", "2026-03-31T15:00:00+08:00"],
  ["13800000013", "Gao Ning", LeadSource.INFO_FLOW, LeadStatus.ASSIGNED, null, "Banquet Double Bottle", "Official Website Lead", "Website inquiry form", "Shaanxi", "Xian", "Yanta", "55 Keji Road", "Assigned status without owner", "2026-03-15T10:00:00+08:00", null, null],
  ["13800000014", "Xu Lan", LeadSource.INFO_FLOW, LeadStatus.NEW, null, "Cellar Anniversary Edition", "Community Inquiry", "Community private chat", "Tianjin", "Tianjin", "Heping", "189 Nanjing Road", "Good for page 2 test", "2026-03-14T18:45:00+08:00", null, "2026-03-30T16:00:00+08:00"],
];

const liveSessionSeeds = [
  ["spring-live", `Spring Tasting Live ${customerSeedTag}`, "Host Allen", "2026-03-28T19:30:00+08:00", LiveSessionStatus.ENDED, "ops", "Vintage Reserve"],
  ["vip-live", `VIP Preview Live ${customerSeedTag}`, "Host Bella", "2026-03-30T20:00:00+08:00", LiveSessionStatus.SCHEDULED, "ops", "Enterprise Gift Set"],
];

const customerSeeds = [
  ["13800000002", "Li Qian", "sales", CustomerStatus.ACTIVE, CustomerLevel.REGULAR, "li.qian.wx", "Zhejiang", "Hangzhou", "Xihu", "68 Wensan Road", `Likely to convert this month ${customerSeedTag}`, ["13800000002"]],
  ["13800000004", "Chen Xue", "sales", CustomerStatus.ACTIVE, CustomerLevel.REGULAR, "chenxue.crm", "Guangdong", "Shenzhen", "Nanshan", "2 Keji South 12th Road", `Following up on banquet purchase ${customerSeedTag}`, ["13800000004"]],
  ["13800000005", "Zhao Qian", "sales", CustomerStatus.ACTIVE, CustomerLevel.NEW, "zhaoqian.wx", "Beijing", "Beijing", "Chaoyang", "86 Jianguo Road", `Wechat added, still early stage ${customerSeedTag}`, ["13800000005"]],
  ["13800000006", "Sun Chen", "sales", CustomerStatus.ACTIVE, CustomerLevel.NEW, null, "Sichuan", "Chengdu", "Gaoxin", "299 Tianfu Avenue", `Invited to live session ${customerSeedTag}`, ["13800000006"]],
  ["13800000008", "Wu Tao", "sales", CustomerStatus.DORMANT, CustomerLevel.VIP, "wutao.vip", "Shandong", "Qingdao", "Shinan", "12 Xianggang Middle Road", `Previous purchaser, now dormant ${customerSeedTag}`, ["13800000008"]],
  ["13800000011", "Feng Kai", null, CustomerStatus.ACTIVE, CustomerLevel.NEW, null, "Hunan", "Changsha", "Yuelu", "Meixi Lake Ring Road", `Unassigned customer for supervisor view ${customerSeedTag}`, ["13800000011"]],
  ["13800000013", "Gao Ning", "supervisor", CustomerStatus.DORMANT, CustomerLevel.REGULAR, null, "Shaanxi", "Xian", "Yanta", "55 Keji Road", `Supervisor-owned customer for access control ${customerSeedTag}`, ["13800000013"]],
];

const customerRecords = {
  "13800000002": {
    calls: [
      ["sales", "2026-03-29T15:05:00+08:00", 420, CallResult.INTERESTED, `Interested in tasting package ${customerSeedTag}`, "2026-03-31T14:00:00+08:00"],
    ],
    wechat: [
      ["sales", WechatAddStatus.ADDED, "2026-03-29T15:20:00+08:00", "li.qian.wx", "LQ", "Li Qian CRM", `Added successfully and sent live invitation ${customerSeedTag}`, "2026-03-31T14:00:00+08:00"],
    ],
    live: [
      ["spring-live", "sales", InvitationStatus.ACCEPTED, "2026-03-29T15:30:00+08:00", InvitationMethod.WECHAT, AttendanceStatus.ATTENDED, 52, true, `Watched most of the live session ${customerSeedTag}`],
    ],
    orders: [
      ["sales", OrderType.NORMAL_ORDER, OrderStatus.CONFIRMED, PaymentStatus.PAID, ShippingStatus.READY, 899, `customer-detail-demo-order-1 ${customerSeedTag}`, "Li Qian", "13800000002", "68 Wensan Road, Hangzhou", `First order from customer detail seed ${customerSeedTag}`],
    ],
    gifts: [
      ["sales", "spring-live", "Tasting Gift Pack", GiftQualificationSource.LIVE_SESSION, 19.9, GiftReviewStatus.APPROVED, ShippingStatus.PENDING, "Li Qian", "13800000002", "68 Wensan Road, Hangzhou", `Live gift approved ${customerSeedTag}`],
    ],
    logs: [
      ["supervisor", OperationModule.CUSTOMER, "seed.customer.created", `Created customer profile for Li Qian ${customerSeedTag}`],
    ],
  },
  "13800000004": {
    calls: [
      ["sales", "2026-03-28T18:10:00+08:00", 320, CallResult.NEED_CALLBACK, `Needs internal budget approval ${customerSeedTag}`, "2026-03-31T10:30:00+08:00"],
    ],
    wechat: [
      ["sales", WechatAddStatus.ADDED, "2026-03-28T18:20:00+08:00", "chenxue.crm", "CX", "Chen Xue Banquet", `Shared banquet proposal pdf ${customerSeedTag}`, "2026-03-31T10:30:00+08:00"],
    ],
    live: [],
    orders: [],
    gifts: [],
    logs: [
      ["sales", OperationModule.CUSTOMER, "seed.customer.note", `Added banquet follow-up note ${customerSeedTag}`],
    ],
  },
  "13800000005": {
    calls: [],
    wechat: [
      ["sales", WechatAddStatus.ADDED, "2026-03-28T11:10:00+08:00", "zhaoqian.wx", "ZQ", "Zhao Qian CRM", `Sent product brochure ${customerSeedTag}`, "2026-03-31T20:00:00+08:00"],
    ],
    live: [],
    orders: [],
    gifts: [],
    logs: [],
  },
  "13800000006": {
    calls: [],
    wechat: [
      ["sales", WechatAddStatus.PENDING, "2026-03-29T19:30:00+08:00", "sunchen_waiting", "SunChen", "Sun Chen Pending", `Wechat request sent and waiting for approval ${customerSeedTag}`, "2026-03-31T18:00:00+08:00"],
    ],
    live: [
      ["vip-live", "sales", InvitationStatus.INVITED, "2026-03-29T20:10:00+08:00", InvitationMethod.CALL, AttendanceStatus.NOT_ATTENDED, 0, false, `Invited via phone and waiting for attendance ${customerSeedTag}`],
    ],
    orders: [],
    gifts: [],
    logs: [],
  },
  "13800000008": {
    calls: [
      ["sales", "2026-03-27T15:30:00+08:00", 260, CallResult.INTERESTED, `Interested in enterprise replenishment ${customerSeedTag}`, "2026-04-02T14:00:00+08:00"],
    ],
    wechat: [],
    live: [],
    orders: [
      ["sales", OrderType.GIFT_FREIGHT_ORDER, OrderStatus.COMPLETED, PaymentStatus.PAID, ShippingStatus.SIGNED, 39.9, `customer-detail-demo-order-2 ${customerSeedTag}`, "Wu Tao", "13800000008", "12 Xianggang Middle Road, Qingdao", `Freight order completed ${customerSeedTag}`],
    ],
    gifts: [
      ["sales", null, "VIP Welcome Gift", GiftQualificationSource.MANUAL_APPROVAL, 39.9, GiftReviewStatus.APPROVED, ShippingStatus.SHIPPED, "Wu Tao", "13800000008", "12 Xianggang Middle Road, Qingdao", `Shipped to dormant VIP customer ${customerSeedTag}`],
    ],
    logs: [
      ["supervisor", OperationModule.CUSTOMER, "seed.customer.reactivated", `Seeded dormant VIP customer profile ${customerSeedTag}`],
    ],
  },
  "13800000011": { calls: [], wechat: [], live: [], orders: [], gifts: [], logs: [] },
  "13800000013": {
    calls: [],
    wechat: [],
    live: [],
    orders: [],
    gifts: [],
    logs: [
      ["supervisor", OperationModule.CUSTOMER, "seed.customer.assigned_to_supervisor", `Seeded supervisor-owned customer ${customerSeedTag}`],
    ],
  },
};

const tagGroupSeeds = [
  ["CUSTOMER_SEGMENT", "Customer Segment", "Customer lifecycle and value segmentation", 10],
  ["FOLLOW_UP_SIGNAL", "Follow-up Signal", "Intent and risk signals for customer and lead follow-up", 20],
];

const tagCategorySeeds = [
  ["CUSTOMER_LEVEL", "CUSTOMER_SEGMENT", "Customer Level", "Segmented by customer value and maturity", 10],
  ["CUSTOMER_RISK", "CUSTOMER_SEGMENT", "Customer Risk", "Risk indicators for customer churn or delay", 20],
  ["INTENT_LEVEL", "FOLLOW_UP_SIGNAL", "Intent Level", "Lead or customer purchase intent levels", 10],
  ["LIVE_SIGNAL", "FOLLOW_UP_SIGNAL", "Live Signal", "Signals related to live invitation and attendance", 20],
];

const tagSeeds = [
  ["VIP_CUSTOMER", "CUSTOMER_SEGMENT", "CUSTOMER_LEVEL", "VIP Customer", "#A65A2A", "High value customer", 10],
  ["DORMANT_CUSTOMER", "CUSTOMER_SEGMENT", "CUSTOMER_RISK", "Dormant Customer", "#8F6B4E", "Dormant customer needing reactivation", 20],
  ["HIGH_INTENT", "FOLLOW_UP_SIGNAL", "INTENT_LEVEL", "High Intent", "#C95A2C", "Likely to convert soon", 10],
  ["NEED_CALLBACK", "FOLLOW_UP_SIGNAL", "INTENT_LEVEL", "Need Callback", "#D48A2C", "Requires a scheduled callback", 20],
  ["LIVE_ATTENDEE", "FOLLOW_UP_SIGNAL", "LIVE_SIGNAL", "Live Attendee", "#2E7D5A", "Attended live session recently", 30],
  ["GIFT_ELIGIBLE", "FOLLOW_UP_SIGNAL", "LIVE_SIGNAL", "Gift Eligible", "#365F87", "Qualified for gift or freight follow-up", 40],
];

const categorySeeds = [
  ["CUSTOMER_STAGE", "Customer Stage", "Reusable customer stage categories", 10],
  ["FOLLOW_UP_REASON", "Follow-up Reason", "Reusable follow-up reason categories", 20],
  ["PRODUCT_CENTER", "Product Center", "Reusable product-center dictionaries", 30],
];

const dictionaryTypeSeeds = [
  ["CUSTOMER_STAGE", "CUSTOMER_STAGE", "Customer Stage", "Reusable customer stage dictionary", 10],
  ["FOLLOW_UP_REASON", "FOLLOW_UP_REASON", "Follow-up Reason", "Reusable follow-up reason dictionary", 20],
  ["PRODUCT_CATEGORY", "PRODUCT_CENTER", "Product Category", "Product category dictionary", 30],
  [
    "PRODUCT_PRIMARY_SALES_SCENE",
    "PRODUCT_CENTER",
    "Primary Sales Scene",
    "Primary sales-scene dictionary for products",
    40,
  ],
  ["PRODUCT_SUPPLY_GROUP", "PRODUCT_CENTER", "Supply Group", "Internal supply-group dictionary", 50],
  [
    "PRODUCT_FINANCE_CATEGORY",
    "PRODUCT_CENTER",
    "Finance Category",
    "Finance category dictionary for products",
    60,
  ],
  ["PRODUCT_PACKAGE_FORM", "PRODUCT_CENTER", "Package Form", "Package-form dictionary for SKUs", 70],
];

const dictionaryItemSeeds = [
  ["CUSTOMER_STAGE", "NEW", "New", "new", "Newly created customer", 10],
  ["CUSTOMER_STAGE", "ACTIVE", "Active", "active", "Actively followed-up customer", 20],
  ["CUSTOMER_STAGE", "REACTIVATION", "Reactivation", "reactivation", "Customer in reactivation stage", 30],
  ["FOLLOW_UP_REASON", "PRICE_CONCERN", "Price Concern", "price_concern", "Customer hesitates because of pricing", 10],
  ["FOLLOW_UP_REASON", "WAITING_CALLBACK", "Waiting Callback", "waiting_callback", "Waiting for scheduled callback", 20],
  ["FOLLOW_UP_REASON", "LIVE_FOLLOW_UP", "Live Follow-up", "live_follow_up", "Post-live-session follow-up reason", 30],
  ["PRODUCT_CATEGORY", "BAIJIU", "\u767d\u9152", "baijiu", "Baijiu product category", 10],
  [
    "PRODUCT_PRIMARY_SALES_SCENE",
    "PRIVATE_LIVE",
    "\u79c1\u57df\u76f4\u64ad",
    "private_live",
    "Primary sales scene for private live sessions",
    10,
  ],
  [
    "PRODUCT_SUPPLY_GROUP",
    "CORE_SUPPLY",
    "\u6838\u5fc3\u4f9b\u8d27",
    "core_supply",
    "Core internal supply group",
    10,
  ],
  [
    "PRODUCT_FINANCE_CATEGORY",
    "DOMESTIC_SPIRIT",
    "\u56fd\u4ea7\u767d\u9152",
    "domestic_spirit",
    "Finance category for domestic baijiu",
    10,
  ],
  [
    "PRODUCT_PACKAGE_FORM",
    "BOTTLE",
    "\u74f6\u88c5",
    "bottle",
    "Bottle package form",
    10,
  ],
];

const customerTagAssignments = {
  "13800000002": ["HIGH_INTENT", "LIVE_ATTENDEE", "GIFT_ELIGIBLE"],
  "13800000004": ["NEED_CALLBACK"],
  "13800000008": ["VIP_CUSTOMER", "DORMANT_CUSTOMER"],
  "13800000013": ["DORMANT_CUSTOMER"],
};

const leadTagAssignments = {
  "13800000003": ["HIGH_INTENT"],
  "13800000006": ["LIVE_ATTENDEE", "GIFT_ELIGIBLE"],
  "13800000011": ["NEED_CALLBACK"],
  "13800000013": ["HIGH_INTENT"],
};

const leadImportTemplateSeeds = [
  {
    name: "标准线索导入模板",
    description: "适配常见渠道 Excel / CSV 导入字段",
    defaultLeadSource: LeadSource.INFO_FLOW,
    mappingConfig: {
      phone: "手机号",
      name: "姓名",
      province: "省份",
      city: "城市",
      district: "区县",
      address: "地址",
      interestedProduct: "意向产品",
      campaignName: "活动名称",
      sourceDetail: "来源详情",
      remark: "备注",
    },
  },
];

async function ensureOperationLog(data) {
  const existing = await prisma.operationLog.findFirst({
    where: {
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId,
      description: data.description,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.operationLog.create({ data });
    return 1;
  }

  return 0;
}

async function main() {
  for (const [code, name, description] of roles) {
    await prisma.role.upsert({
      where: { code },
      update: { name, description, isSystem: true },
      create: { code, name, description, isSystem: true },
    });
  }

  const roleMap = Object.fromEntries(
    (await prisma.role.findMany()).map((role) => [role.code, role.id]),
  );

  let userCreated = 0;
  let userUpdated = 0;
  let teamCreated = 0;
  let teamUpdated = 0;

  for (const seed of userSeeds) {
    const existing = await prisma.user.findUnique({
      where: { username: seed.username },
      select: { id: true },
    });

    const payload = {
      name: seed.name,
      phone: seed.phone,
      roleId: roleMap[seed.roleCode],
      userStatus: UserStatus.ACTIVE,
      passwordHash: hashPassword(demoPassword),
      mustChangePassword: false,
      teamId: null,
      supervisorId: null,
      invitedAt: null,
      invitedById: null,
      lastLoginAt: null,
      disabledAt: null,
      disabledById: null,
    };

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: payload,
      });
      userUpdated += 1;
    } else {
      await prisma.user.create({
        data: {
          username: seed.username,
          ...payload,
        },
      });
      userCreated += 1;
    }
  }

  let userMap = Object.fromEntries(
    (
      await prisma.user.findMany({
        select: { id: true, username: true, name: true },
      })
    ).map((user) => [user.username, user]),
  );

  const teamMap = {};
  for (const seed of teamSeeds) {
    const existing = await prisma.team.findUnique({
      where: { code: seed.code },
      select: { id: true },
    });

    const payload = {
      name: seed.name,
      description: seed.description,
      supervisorId: userMap[seed.supervisorUsername]?.id ?? null,
    };

    if (existing) {
      teamMap[seed.code] = await prisma.team.update({
        where: { id: existing.id },
        data: payload,
        select: { id: true, code: true },
      });
      teamUpdated += 1;
    } else {
      teamMap[seed.code] = await prisma.team.create({
        data: {
          code: seed.code,
          ...payload,
        },
        select: { id: true, code: true },
      });
      teamCreated += 1;
    }
  }

  for (const seed of userSeeds) {
    await prisma.user.update({
      where: { username: seed.username },
      data: {
        teamId: seed.teamCode ? teamMap[seed.teamCode]?.id ?? null : null,
        supervisorId: seed.supervisorUsername
          ? userMap[seed.supervisorUsername]?.id ?? null
          : null,
        invitedAt: seed.invitedAt ? new Date(seed.invitedAt) : null,
        invitedById: seed.invitedByUsername
          ? userMap[seed.invitedByUsername]?.id ?? null
          : null,
        lastLoginAt: seed.lastLoginAt ? new Date(seed.lastLoginAt) : null,
      },
    });
  }

  userMap = Object.fromEntries(
    (
      await prisma.user.findMany({
        select: { id: true, username: true, name: true },
      })
    ).map((user) => [user.username, user]),
  );

  for (const template of leadImportTemplateSeeds) {
    const existing = await prisma.leadImportTemplate.findUnique({
      where: { name: template.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.leadImportTemplate.update({
        where: { id: existing.id },
        data: {
          description: template.description,
          defaultLeadSource: template.defaultLeadSource,
          mappingConfig: template.mappingConfig,
          isActive: true,
          createdById: userMap.admin?.id ?? null,
        },
      });
    } else {
      await prisma.leadImportTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          defaultLeadSource: template.defaultLeadSource,
          mappingConfig: template.mappingConfig,
          isActive: true,
          createdById: userMap.admin?.id ?? null,
        },
      });
    }
  }

  let tagGroupCreated = 0;
  let tagCategoryCreated = 0;
  let tagCreated = 0;
  let categoryCreated = 0;
  let dictionaryTypeCreated = 0;
  let dictionaryItemCreated = 0;

  const tagGroupMap = {};
  for (const [code, name, description, sortOrder] of tagGroupSeeds) {
    const existing = await prisma.tagGroup.findUnique({
      where: { code },
      select: { id: true },
    });

    const group = existing
      ? await prisma.tagGroup.update({
          where: { id: existing.id },
          data: {
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        })
      : await prisma.tagGroup.create({
          data: {
            code,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        });

    tagGroupMap[code] = group;
    if (!existing) tagGroupCreated += 1;
  }

  const tagCategoryMap = {};
  for (const [code, groupCode, name, description, sortOrder] of tagCategorySeeds) {
    const existing = await prisma.tagCategory.findUnique({
      where: { code },
      select: { id: true },
    });

    const category = existing
      ? await prisma.tagCategory.update({
          where: { id: existing.id },
          data: {
            groupId: tagGroupMap[groupCode].id,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        })
      : await prisma.tagCategory.create({
          data: {
            groupId: tagGroupMap[groupCode].id,
            code,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        });

    tagCategoryMap[code] = category;
    if (!existing) tagCategoryCreated += 1;
  }

  const tagMap = {};
  for (const [code, groupCode, categoryCode, name, color, description, sortOrder] of tagSeeds) {
    const existing = await prisma.tag.findUnique({
      where: { code },
      select: { id: true },
    });

    const tag = existing
      ? await prisma.tag.update({
          where: { id: existing.id },
          data: {
            groupId: tagGroupMap[groupCode].id,
            categoryId: categoryCode ? tagCategoryMap[categoryCode].id : null,
            name,
            color,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        })
      : await prisma.tag.create({
          data: {
            groupId: tagGroupMap[groupCode].id,
            categoryId: categoryCode ? tagCategoryMap[categoryCode].id : null,
            code,
            name,
            color,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        });

    tagMap[code] = tag;
    if (!existing) tagCreated += 1;
  }

  const categoryMap = {};
  for (const [code, name, description, sortOrder] of categorySeeds) {
    const existing = await prisma.category.findUnique({
      where: { code },
      select: { id: true },
    });

    const category = existing
      ? await prisma.category.update({
          where: { id: existing.id },
          data: {
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        })
      : await prisma.category.create({
          data: {
            code,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        });

    categoryMap[code] = category;
    if (!existing) categoryCreated += 1;
  }

  const dictionaryTypeMap = {};
  for (const [code, categoryCode, name, description, sortOrder] of dictionaryTypeSeeds) {
    const existing = await prisma.dictionaryType.findUnique({
      where: { code },
      select: { id: true },
    });

    const type = existing
      ? await prisma.dictionaryType.update({
          where: { id: existing.id },
          data: {
            categoryId: categoryCode ? categoryMap[categoryCode].id : null,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        })
      : await prisma.dictionaryType.create({
          data: {
            categoryId: categoryCode ? categoryMap[categoryCode].id : null,
            code,
            name,
            description: `${description} ${masterDataSeedTag}`,
            sortOrder,
            isActive: true,
          },
          select: { id: true, code: true },
        });

    dictionaryTypeMap[code] = type;
    if (!existing) dictionaryTypeCreated += 1;
  }

  for (const [typeCode, code, label, value, description, sortOrder] of dictionaryItemSeeds) {
    const existing = await prisma.dictionaryItem.findUnique({
      where: {
        typeId_code: {
          typeId: dictionaryTypeMap[typeCode].id,
          code,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.dictionaryItem.update({
        where: { id: existing.id },
        data: {
          label,
          value,
          description: `${description} ${masterDataSeedTag}`,
          sortOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.dictionaryItem.create({
        data: {
          typeId: dictionaryTypeMap[typeCode].id,
          code,
          label,
          value,
          description: `${description} ${masterDataSeedTag}`,
          sortOrder,
          isActive: true,
        },
      });
      dictionaryItemCreated += 1;
    }
  }

  const liveSessionMap = {};
  for (const [key, title, hostName, startAt, status, createdByUsername, targetProduct] of liveSessionSeeds) {
    const existing = await prisma.liveSession.findFirst({
      where: { title },
      select: { id: true },
    });

    const payload = {
      title,
      hostName,
      startAt: new Date(startAt),
      status,
      createdById: userMap[createdByUsername]?.id ?? null,
      targetProduct,
      remark: `Milestone 5 customer detail demo ${customerSeedTag}`,
    };

    liveSessionMap[key] = existing
      ? await prisma.liveSession.update({
          where: { id: existing.id },
          data: payload,
          select: { id: true },
        })
      : await prisma.liveSession.create({
          data: payload,
          select: { id: true },
        });
  }

  let leadCreated = 0;
  let leadUpdated = 0;
  let leadAssignments = 0;
  let operationLogs = 0;
  const leadMap = {};

  for (const seed of leadSeeds) {
    const [
      phone,
      name,
      source,
      status,
      ownerUsername,
      interestedProduct,
      campaignName,
      sourceDetail,
      province,
      city,
      district,
      address,
      remark,
      createdAt,
      lastFollowUpAt,
      nextFollowUpAt,
    ] = seed;

    const existing = await prisma.lead.findFirst({
      where: { phone },
      select: { id: true },
    });

    const owner = ownerUsername ? userMap[ownerUsername] : null;
    const payload = {
      source,
      sourceDetail: `${sourceDetail} ${leadSeedTag}`,
      campaignName,
      name,
      phone,
      province,
      city,
      district,
      address,
      interestedProduct,
      isFirstPurchase: true,
      remark: `${remark} ${leadSeedTag}`,
      status,
      ownerId: owner?.id ?? null,
      createdAt: new Date(createdAt),
      lastFollowUpAt: lastFollowUpAt ? new Date(lastFollowUpAt) : null,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
    };

    const lead = existing
      ? await prisma.lead.update({
          where: { id: existing.id },
          data: payload,
          select: { id: true, phone: true, name: true },
        })
      : await prisma.lead.create({
          data: payload,
          select: { id: true, phone: true, name: true },
        });

    leadMap[phone] = lead;
    if (existing) leadUpdated += 1;
    else leadCreated += 1;

    operationLogs += await ensureOperationLog({
      actorId: userMap.supervisor?.id ?? null,
      module: OperationModule.LEAD,
      action: "seed.lead.created",
      targetType: OperationTargetType.LEAD,
      targetId: lead.id,
      description: `Created seed lead ${name} ${leadSeedTag}`,
      afterData: { phone, status, ownerUsername },
    });

    if (owner && userMap.supervisor) {
      const assignmentNote = `Seed initial assignment ${leadSeedTag}`;
      const existingAssignment = await prisma.leadAssignment.findFirst({
        where: {
          leadId: lead.id,
          toUserId: owner.id,
          assignedById: userMap.supervisor.id,
          assignmentType: AssignmentType.MANUAL,
          note: assignmentNote,
        },
        select: { id: true },
      });

      if (!existingAssignment) {
        await prisma.leadAssignment.create({
          data: {
            leadId: lead.id,
            fromUserId: null,
            toUserId: owner.id,
            assignedById: userMap.supervisor.id,
            assignmentType: AssignmentType.MANUAL,
            note: assignmentNote,
          },
        });
        leadAssignments += 1;
      }

      operationLogs += await ensureOperationLog({
        actorId: userMap.supervisor.id,
        module: OperationModule.ASSIGNMENT,
        action: "seed.lead.assignment",
        targetType: OperationTargetType.LEAD,
        targetId: lead.id,
        description: `Assigned seed lead to ${owner.name} (@${owner.username}) ${leadSeedTag}`,
        beforeData: { ownerId: null },
        afterData: { ownerId: owner.id, status },
      });
    }
  }

  let customerCreated = 0;
  let customerUpdated = 0;
  let callCreated = 0;
  let wechatCreated = 0;
  let liveCreated = 0;
  let orderCreated = 0;
  let giftCreated = 0;
  let customerTagCreated = 0;
  let leadTagCreated = 0;
  const customerMap = {};

  for (const seed of customerSeeds) {
    const [
      phone,
      name,
      ownerUsername,
      status,
      level,
      wechatId,
      province,
      city,
      district,
      address,
      remark,
      leadPhones,
    ] = seed;

    const existing = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true },
    });

    const owner = ownerUsername ? userMap[ownerUsername] : null;
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name,
            phone,
            wechatId,
            province,
            city,
            district,
            address,
            status,
            level,
            ownerId: owner?.id ?? null,
            remark,
          },
          select: { id: true, phone: true, name: true },
        })
      : await prisma.customer.create({
          data: {
            name,
            phone,
            wechatId,
            province,
            city,
            district,
            address,
            status,
            level,
            ownerId: owner?.id ?? null,
            remark,
          },
          select: { id: true, phone: true, name: true },
        });

    customerMap[phone] = customer;
    if (existing) customerUpdated += 1;
    else customerCreated += 1;

    for (const leadPhone of leadPhones) {
      if (leadMap[leadPhone]) {
        await prisma.lead.update({
          where: { id: leadMap[leadPhone].id },
          data: { customerId: customer.id },
        });
      }
    }

    for (const [actorUsername, module, action, description] of customerRecords[phone].logs) {
      operationLogs += await ensureOperationLog({
        actorId: userMap[actorUsername]?.id ?? null,
        module,
        action,
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description,
      });
    }

    for (const record of customerRecords[phone].calls) {
      const [salesUsername, callTime, durationSeconds, result, callRemark, nextFollowUpAt] = record;
      const existingRecord = await prisma.callRecord.findFirst({
        where: { customerId: customer.id, remark: callRemark },
        select: { id: true },
      });

      const payload = {
        customerId: customer.id,
        salesId: userMap[salesUsername].id,
        callTime: new Date(callTime),
        durationSeconds,
        result,
        remark: callRemark,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
      };

      if (existingRecord) {
        await prisma.callRecord.update({ where: { id: existingRecord.id }, data: payload });
      } else {
        await prisma.callRecord.create({ data: payload });
        callCreated += 1;
      }
    }

    for (const record of customerRecords[phone].wechat) {
      const [salesUsername, addedStatus, addedAt, wechatAccount, wechatNickname, wechatRemarkName, summary, nextFollowUpAt] = record;
      const existingRecord = await prisma.wechatRecord.findFirst({
        where: { customerId: customer.id, summary },
        select: { id: true },
      });

      const payload = {
        customerId: customer.id,
        salesId: userMap[salesUsername].id,
        addedStatus,
        addedAt: addedAt ? new Date(addedAt) : null,
        wechatAccount,
        wechatNickname,
        wechatRemarkName,
        summary,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
      };

      if (existingRecord) {
        await prisma.wechatRecord.update({ where: { id: existingRecord.id }, data: payload });
      } else {
        await prisma.wechatRecord.create({ data: payload });
        wechatCreated += 1;
      }
    }

    for (const record of customerRecords[phone].live) {
      const [liveKey, salesUsername, invitationStatus, invitedAt, invitationMethod, attendanceStatus, watchDurationMinutes, giftQualified, liveRemark] = record;
      const existingRecord = await prisma.liveInvitation.findFirst({
        where: { customerId: customer.id, remark: liveRemark },
        select: { id: true },
      });

      const payload = {
        customerId: customer.id,
        liveSessionId: liveSessionMap[liveKey].id,
        salesId: userMap[salesUsername].id,
        invitationStatus,
        invitedAt: invitedAt ? new Date(invitedAt) : null,
        invitationMethod,
        attendanceStatus,
        watchDurationMinutes,
        giftQualified,
        remark: liveRemark,
      };

      if (existingRecord) {
        await prisma.liveInvitation.update({ where: { id: existingRecord.id }, data: payload });
      } else {
        await prisma.liveInvitation.create({ data: payload });
        liveCreated += 1;
      }
    }

    for (const record of customerRecords[phone].orders) {
      const [recordOwnerUsername, type, orderStatus, paymentStatus, shippingStatus, amount, sourceScene, receiverName, receiverPhone, receiverAddress, orderRemark] = record;
      const existingRecord = await prisma.order.findFirst({
        where: { customerId: customer.id, sourceScene },
        select: { id: true },
      });

      const payload = {
        customerId: customer.id,
        ownerId: userMap[recordOwnerUsername]?.id ?? null,
        type,
        status: orderStatus,
        paymentStatus,
        shippingStatus,
        amount,
        sourceScene,
        receiverName,
        receiverPhone,
        receiverAddress,
        remark: orderRemark,
      };

      if (existingRecord) {
        await prisma.order.update({ where: { id: existingRecord.id }, data: payload });
      } else {
        await prisma.order.create({ data: payload });
        orderCreated += 1;
      }
    }

    for (const record of customerRecords[phone].gifts) {
      const [salesUsername, liveKey, giftName, qualificationSource, freightAmount, reviewStatus, shippingStatus, receiverName, receiverPhone, receiverAddress, giftRemark] = record;
      const existingRecord = await prisma.giftRecord.findFirst({
        where: { customerId: customer.id, remark: giftRemark },
        select: { id: true },
      });

      const payload = {
        customerId: customer.id,
        salesId: userMap[salesUsername]?.id ?? null,
        liveSessionId: liveKey ? liveSessionMap[liveKey].id : null,
        giftName,
        qualificationSource,
        freightAmount,
        reviewStatus,
        shippingStatus,
        receiverName,
        receiverPhone,
        receiverAddress,
        remark: giftRemark,
      };

      if (existingRecord) {
        await prisma.giftRecord.update({ where: { id: existingRecord.id }, data: payload });
      } else {
        await prisma.giftRecord.create({ data: payload });
        giftCreated += 1;
      }
    }
  }

  for (const [phone, tagCodes] of Object.entries(customerTagAssignments)) {
    const customer = customerMap[phone];
    if (!customer) {
      continue;
    }

    for (const tagCode of tagCodes) {
      const existing = await prisma.customerTag.findUnique({
        where: {
          customerId_tagId: {
            customerId: customer.id,
            tagId: tagMap[tagCode].id,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        await prisma.customerTag.create({
          data: {
            customerId: customer.id,
            tagId: tagMap[tagCode].id,
            assignedById: userMap.supervisor?.id ?? null,
          },
        });
        customerTagCreated += 1;
      }
    }
  }

  for (const [phone, tagCodes] of Object.entries(leadTagAssignments)) {
    const lead = leadMap[phone];
    if (!lead) {
      continue;
    }

    for (const tagCode of tagCodes) {
      const existing = await prisma.leadTag.findUnique({
        where: {
          leadId_tagId: {
            leadId: lead.id,
            tagId: tagMap[tagCode].id,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        await prisma.leadTag.create({
          data: {
            leadId: lead.id,
            tagId: tagMap[tagCode].id,
            assignedById: userMap.supervisor?.id ?? null,
          },
        });
        leadTagCreated += 1;
      }
    }
  }

  console.log("Seed completed.");
  console.log(`Demo password: ${demoPassword}`);
  console.log(
    `Account seeds => users created: ${userCreated}, users updated: ${userUpdated}, teams created: ${teamCreated}, teams updated: ${teamUpdated}`,
  );
  console.log(
    `Master data seeds => tag groups created: ${tagGroupCreated}, tag categories created: ${tagCategoryCreated}, tags created: ${tagCreated}, categories created: ${categoryCreated}, dictionary types created: ${dictionaryTypeCreated}, dictionary items created: ${dictionaryItemCreated}`,
  );
  console.log(
    `Lead seeds => created: ${leadCreated}, updated: ${leadUpdated}, assignments added: ${leadAssignments}, logs added: ${operationLogs}`,
  );
  console.log(
    `Customer seeds => created: ${customerCreated}, updated: ${customerUpdated}, calls added: ${callCreated}, wechat added: ${wechatCreated}, live invitations added: ${liveCreated}, orders added: ${orderCreated}, gifts added: ${giftCreated}, customer tags added: ${customerTagCreated}, lead tags added: ${leadTagCreated}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
