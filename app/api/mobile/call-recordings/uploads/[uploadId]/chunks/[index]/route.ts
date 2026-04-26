import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { uploadRecordingChunk } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadId: string; index: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { uploadId, index } = await context.params;

  if (!uploadId?.trim()) {
    return NextResponse.json({ message: "Invalid upload id" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await request.arrayBuffer());

    if (bytes.length === 0) {
      return NextResponse.json({ message: "Empty chunk" }, { status: 400 });
    }

    const upload = await uploadRecordingChunk({
      actor: {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      uploadId,
      chunkIndex: index,
      bytes,
      chunkSha256: request.headers.get("x-chunk-sha256"),
    });

    return NextResponse.json({ upload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "上传录音分片失败。" },
      { status: 400 },
    );
  }
}
