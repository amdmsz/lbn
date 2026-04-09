import { canAccessLeadImportModule } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  customerContinuationImportTemplateHeaders,
  getLeadImportMode,
  getLeadImportModeMeta,
  leadImportTemplateHeaders,
} from "@/lib/lead-imports/metadata";

function toCsvLine(values: string[]) {
  return values
    .map((value) => {
      const normalized = value ?? "";
      if (!/[",\n]/.test(normalized)) {
        return normalized;
      }

      return `"${normalized.replace(/"/g, '""')}"`;
    })
    .join(",");
}

function buildLeadTemplateCsv() {
  const headerLine = toCsvLine([...leadImportTemplateHeaders]);
  const sampleRows = [
    [
      "13800138000",
      "张三",
      "上海市浦东新区世纪大道100号",
      "酱香白酒礼盒",
      "抖音直播场次 A",
      "3月直播复购名单",
      "已成交客户，适合二次触达",
    ],
    [
      "13900139000",
      "李四",
      "杭州市西湖区文三路88号",
      "五粮液礼盒",
      "企微复购活动",
      "老客二次唤醒",
      "适合继续跟进复购",
    ],
  ].map((row) => toCsvLine(row));

  return `\uFEFF${headerLine}\n${sampleRows.join("\n")}\n`;
}

function buildCustomerContinuationTemplateCsv() {
  const headerLine = toCsvLine([...customerContinuationImportTemplateHeaders]);
  const sampleRows = [
    [
      "13800138000",
      "张三",
      "上海市浦东新区世纪大道100号",
      "sales",
      "A类|续接迁移客户",
      "52860",
      "6",
      "飞天茅台礼盒",
      "高净值老客，适合继续私域承接",
      "2026-04-06 14:30",
      "A类客户，已加微信，待邀约",
      "老系统 ABC 客户续接到新系统后会自动进入已加微信承接。",
    ],
    [
      "13800138001",
      "李四",
      "杭州市西湖区文三路88号",
      "sales",
      "D类|续接迁移客户",
      "0",
      "0",
      "",
      "已加微信但还未做直播邀约",
      "2026-04-07 11:00",
      "D类已加微信，待邀约",
      "D 类客户会落到已加微信，并进入待邀约视角。",
    ],
    [
      "13800138002",
      "王五",
      "成都市高新区天府大道299号",
      "sales",
      "跟进客户（未接通/拒接）|续接迁移客户",
      "0",
      "0",
      "",
      "继续电话回访",
      "2026-04-07 16:20",
      "未接通，待回访",
      "会自动生成挂断通话结果，并进入待回访。",
    ],
    [
      "13800138003",
      "赵六",
      "厦门市思明区软件园二期",
      "sales",
      "拒绝添加|无效客户（空号/停机）|续接迁移客户",
      "0",
      "0",
      "",
      "不再继续邀约",
      "2026-04-08 09:15",
      "拒绝添加或空号停机",
      "拒绝添加会映射到拒绝加微信，无效客户会映射到空号/无效号码。",
    ],
  ].map((row) => toCsvLine(row));

  return `\uFEFF${headerLine}\n${sampleRows.join("\n")}\n`;
}

function getTemplateResponse(mode: "lead" | "customer_continuation") {
  const meta = getLeadImportModeMeta(mode);
  const csv =
    mode === "customer_continuation"
      ? buildCustomerContinuationTemplateCsv()
      : buildLeadTemplateCsv();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meta.templateFileName}"`,
    },
  });
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const mode = getLeadImportMode({ mode: url.searchParams.get("mode") ?? undefined });

  return getTemplateResponse(mode);
}

export async function HEAD(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    return new Response(null, { status: 403 });
  }

  const url = new URL(request.url);
  const mode = getLeadImportMode({ mode: url.searchParams.get("mode") ?? undefined });
  const meta = getLeadImportModeMeta(mode);

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${meta.templateFileName}"`,
    },
  });
}
