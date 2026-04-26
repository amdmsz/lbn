import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { completeRecordingUpload } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { uploadId } = await context.params;

  if (!uploadId?.trim()) {
    return NextResponse.json({ message: "Invalid upload id" }, { status: 400 });
  }

  try {
    const recording = await completeRecordingUpload(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      uploadId,
    );

    return NextResponse.json(
      { recording },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "完成录音上传失败。" },
      { status: 400 },
    );
  }
}
