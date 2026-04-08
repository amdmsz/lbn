import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { canAccessShippingExportBatchModule } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function resolveExportDiskPath(fileUrl: string | null, fileName: string) {
  const normalizedUrl = fileUrl?.trim();
  const relativePath =
    normalizedUrl && normalizedUrl.startsWith("/exports/shipping/")
      ? normalizedUrl.replace(/^\//, "")
      : path.join("exports", "shipping", fileName);

  return path.join(process.cwd(), "public", relativePath);
}

async function getSupervisorTeamId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessShippingExportBatchModule(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const exportBatchId = id?.trim();

  if (!exportBatchId) {
    return NextResponse.json({ message: "Invalid export batch id" }, { status: 400 });
  }

  const supervisorTeamId =
    session.user.role === "SUPERVISOR"
      ? await getSupervisorTeamId(session.user.id)
      : null;

  const batch = await prisma.shippingExportBatch.findFirst({
    where: {
      id: exportBatchId,
      ...(session.user.role === "SUPERVISOR"
        ? supervisorTeamId
          ? {
              shippingTasks: {
                some: {
                  OR: [
                    { salesOrder: { owner: { is: { teamId: supervisorTeamId } } } },
                    { salesOrder: { customer: { owner: { is: { teamId: supervisorTeamId } } } } },
                  ],
                },
              },
            }
          : { id: "__missing_shipping_batch_scope__" }
        : {}),
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
    },
  });

  if (!batch) {
    return NextResponse.json({ message: "Export batch not found" }, { status: 404 });
  }

  const absolutePath = resolveExportDiskPath(batch.fileUrl, batch.fileName);

  try {
    const fileBuffer = await fs.readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(batch.fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "Export file not found" }, { status: 404 });
  }
}
