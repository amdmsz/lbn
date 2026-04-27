import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { resolveOutboundCallWebRtcConfig } from "@/lib/outbound-calls/webrtc-config";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await resolveOutboundCallWebRtcConfig(session.user.id);

    return NextResponse.json(config, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        enabled: false,
        message:
          error instanceof Error ? error.message : "网页坐席配置读取失败。",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
