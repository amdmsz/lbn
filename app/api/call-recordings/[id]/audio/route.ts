import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { getRecordingAudioForPlayback } from "@/lib/calls/recording-mutations";
import {
  RecordingRangeNotSatisfiableError,
  type RecordingByteRangeRequest,
} from "@/lib/calls/recording-storage";

export const runtime = "nodejs";

type ParsedHttpRange = RecordingByteRangeRequest | "invalid" | null;

function buildContentDisposition(type: "inline" | "attachment", filename: string) {
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");
  return `${type}; filename="${safeFilename}"`;
}

function parseHttpByteRange(value: string | null): ParsedHttpRange {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes(",")) {
    return "invalid";
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);

  if (!match) {
    return "invalid";
  }

  const [, startText, endText] = match;
  const start = startText ? Number.parseInt(startText, 10) : undefined;
  const end = endText ? Number.parseInt(endText, 10) : undefined;

  if (
    (start === undefined && end === undefined) ||
    (start !== undefined && (!Number.isSafeInteger(start) || start < 0)) ||
    (end !== undefined && (!Number.isSafeInteger(end) || end < 0))
  ) {
    return "invalid";
  }

  return { start, end };
}

function buildUnsatisfiedRangeResponse(totalLength?: number) {
  return new Response(null, {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${totalLength ?? "*"}`,
      "Cache-Control": "no-store",
    },
  });
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
    const byteRange = parseHttpByteRange(request.headers.get("range"));

    if (byteRange === "invalid") {
      return buildUnsatisfiedRangeResponse();
    }

    const audio = await getRecordingAudioForPlayback(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      id,
      { downloadOriginal, byteRange },
    );
    const headers = new Headers({
      "Content-Type": audio.mimeType,
      "Content-Length": String(audio.contentLength),
      "Content-Disposition": buildContentDisposition(
        downloadOriginal ? "attachment" : "inline",
        audio.filename,
      ),
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
      "X-Call-Recording-Original-Mime-Type": audio.originalMimeType,
      "X-Call-Recording-Transcoded": String(audio.transcoded),
    });

    if (audio.byteRange) {
      headers.set(
        "Content-Range",
        `bytes ${audio.byteRange.start}-${audio.byteRange.end}/${audio.byteRange.total}`,
      );
    }

    return new Response(audio.stream, {
      status: audio.byteRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof RecordingRangeNotSatisfiableError) {
      return buildUnsatisfiedRangeResponse(error.totalLength);
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "录音文件不可播放。" },
      { status: 404 },
    );
  }
}
