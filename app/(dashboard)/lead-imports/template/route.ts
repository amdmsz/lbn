import { canAccessLeadImportModule } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { leadImportTemplateHeaders } from "@/lib/lead-imports/metadata";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const headerLine = leadImportTemplateHeaders.join(",");
  const sampleLine = [
    "13800138000",
    "张三",
    "上海市浦东新区世纪大道100号",
    "酱香白酒礼盒",
    "SF1234567890",
    "3月直播复购名单",
    "已成交客户，适合二次触达",
  ].join(",");
  const csv = `\uFEFF${headerLine}\n${sampleLine}\n`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lead-import-template.csv"',
    },
  });
}

export async function HEAD() {
  const session = await auth();

  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lead-import-template.csv"',
    },
  });
}
