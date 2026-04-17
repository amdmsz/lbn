import { NextResponse } from "next/server";
import {
  canAccessRecycleBinModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildRecycleBinHistoryExportCsv,
  buildRecycleBinHistoryExportFileName,
} from "@/lib/recycle-bin/export";
import { getRecycleBinPageData } from "@/lib/recycle-bin/queries";

export const runtime = "nodejs";

function getSearchParamsRecord(url: URL) {
  return Object.fromEntries(url.searchParams.entries());
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessRecycleBinModule(session.user.role, session.user.permissionCodes)) {
    return NextResponse.json(
      { message: getDefaultRouteForRole(session.user.role) },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const searchParams = getSearchParamsRecord(url);
  const data = await getRecycleBinPageData(
    {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
    },
    searchParams,
  );

  if (data.filters.entryStatus === "active") {
    return NextResponse.json(
      { message: "ACTIVE recycle entries are not in the export scope." },
      { status: 400 },
    );
  }

  const csv = buildRecycleBinHistoryExportCsv(data.items);
  const fileName = buildRecycleBinHistoryExportFileName({
    activeTab: data.activeTab,
    entryStatus: data.filters.entryStatus,
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
