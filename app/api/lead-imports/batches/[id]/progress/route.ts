import { NextResponse } from "next/server";
import {
  canAccessLeadImportModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getLeadImportBatchProgressData } from "@/lib/lead-imports/queries";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessLeadImportModule(session.user.role)) {
    return NextResponse.json(
      {
        message: "Forbidden",
        redirectTo: getDefaultRouteForRole(session.user.role),
      },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const batchId = id?.trim();

  if (!batchId) {
    return NextResponse.json({ message: "Invalid batch id" }, { status: 400 });
  }

  const progress = await getLeadImportBatchProgressData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    batchId,
  );

  if (!progress) {
    return NextResponse.json({ message: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      progress,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
