import { NextResponse } from "next/server";
import {
  canExportCustomers,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildCustomersExportCsv,
  buildCustomersExportFileName,
  getCustomersExportData,
} from "@/lib/customers/export";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function getSearchParamsRecord(url: URL) {
  const result: Record<string, string | string[]> = {};

  for (const [key, value] of url.searchParams.entries()) {
    const existing = result[key];

    if (typeof existing === "undefined") {
      result[key] = value;
      continue;
    }

    result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  }

  return result;
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canExportCustomers(session.user.role)) {
    return NextResponse.json(
      { message: getDefaultRouteForRole(session.user.role) },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const searchParams = getSearchParamsRecord(url);
  const data = await getCustomersExportData(
    {
      id: session.user.id,
      role: session.user.role,
      teamId: session.user.teamId,
    },
    searchParams,
  );
  const csv = buildCustomersExportCsv(data.items);
  const fileName = buildCustomersExportFileName();

  await prisma.operationLog.create({
    data: {
      actorId: session.user.id,
      module: "CUSTOMER",
      action: "customer.filtered_export",
      targetType: "CUSTOMER",
      targetId: "__customer_filtered_export__",
      description: `导出客户 ${data.items.length} 条`,
      afterData: {
        count: data.items.length,
        filters: data.filters,
      },
    },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}
