import { NextResponse } from "next/server";
import {
  canAccessFinanceModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildFinancePaymentsExportCsv,
  buildFinancePaymentsExportFileName,
} from "@/lib/finance/export";
import { getFinancePaymentsExportData } from "@/lib/finance/queries";

export const runtime = "nodejs";

function getSearchParamsRecord(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
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
  const data = await getFinancePaymentsExportData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    getSearchParamsRecord(url),
  );

  const csv = buildFinancePaymentsExportCsv(data.items);
  const fileName = buildFinancePaymentsExportFileName();

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}
