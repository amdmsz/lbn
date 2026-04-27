import { NextResponse } from "next/server";
import {
  canAccessLeadModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  buildLeadUnassignedExportCsv,
  buildLeadUnassignedExportFileName,
} from "@/lib/leads/export";
import { getLeadUnassignedExportData } from "@/lib/leads/queries";

export const runtime = "nodejs";

function getSearchParamsRecord(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessLeadModule(session.user.role)) {
    return NextResponse.json(
      { message: getDefaultRouteForRole(session.user.role) },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const searchParams = getSearchParamsRecord(url);
  const data = await getLeadUnassignedExportData(
    {
      id: session.user.id,
      role: session.user.role,
      teamId: session.user.teamId,
    },
    searchParams,
  );
  const csv = buildLeadUnassignedExportCsv(data.items);
  const fileName = buildLeadUnassignedExportFileName();

  await prisma.operationLog.create({
    data: {
      actorId: session.user.id,
      module: "LEAD",
      action: "lead.unassigned_export",
      targetType: "LEAD",
      targetId: "__unassigned_export__",
      description: `导出未分配线索 ${data.items.length} 条`,
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
