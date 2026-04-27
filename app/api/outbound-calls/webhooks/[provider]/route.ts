import { NextResponse } from "next/server";
import { handleOutboundCallWebhook } from "@/lib/outbound-calls/mutations";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  try {
    const rawBody = await request.text();
    const result = await handleOutboundCallWebhook({
      provider,
      headers: request.headers,
      rawBody,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "外呼回调处理失败。" },
      { status: 400 },
    );
  }
}
