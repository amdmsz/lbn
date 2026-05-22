import { NextResponse } from "next/server";
import {
  canAccessFinanceModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildCustomersExportCsv,
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

function buildFinanceCustomerReconciliationExportFileName() {
  const datePart = new Date().toISOString().slice(0, 10);
  return `finance-reconciliation-customers-${datePart}.csv`;
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessFinanceModule(session.user.role)) {
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
  const fileName = buildFinanceCustomerReconciliationExportFileName();

  await prisma.operationLog.create({
    data: {
      actorId: session.user.id,
      module: "PAYMENT",
      action: "finance.customer_reconciliation_export",
      targetType: "CUSTOMER",
      targetId: "__finance_customer_reconciliation_export__",
      description: `导出财务客户对账 ${data.items.length} 条`,
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
