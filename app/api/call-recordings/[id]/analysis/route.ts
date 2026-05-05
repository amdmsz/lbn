import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { getCallRecordingAnalysisDetail } from "@/lib/calls/recording-queries";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  if (!id?.trim()) {
    return NextResponse.json({ message: "Invalid recording id" }, { status: 400 });
  }

  try {
    const analysis = await getCallRecordingAnalysisDetail(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      id,
    );

    return NextResponse.json(
      { analysis },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "录音分析不可查看。" },
      { status: 404 },
    );
  }
}
