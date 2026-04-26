import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { getRecordingAudioForPlayback } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

function buildContentDisposition(type: "inline" | "attachment", filename: string) {
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");
  return `${type}; filename="${safeFilename}"`;
}

export async function GET(
  request: Request,
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
    const url = new URL(request.url);
    const downloadOriginal = url.searchParams.get("download") === "1";
    const audio = await getRecordingAudioForPlayback(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      id,
      { downloadOriginal },
    );

    return new Response(audio.stream, {
      status: 200,
      headers: {
        "Content-Type": audio.mimeType,
        "Content-Length": String(audio.contentLength),
        "Content-Disposition": buildContentDisposition(
          downloadOriginal ? "attachment" : "inline",
          audio.filename,
        ),
        "Cache-Control": "no-store",
        "X-Call-Recording-Original-Mime-Type": audio.originalMimeType,
        "X-Call-Recording-Transcoded": String(audio.transcoded),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "录音文件不可播放。" },
      { status: 404 },
    );
  }
}
