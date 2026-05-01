import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { recordMobileCallSessionEvent } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ callRecordId: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { callRecordId } = await context.params;

  if (!callRecordId?.trim()) {
    return NextResponse.json({ message: "Invalid call record id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const event = await recordMobileCallSessionEvent(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      callRecordId,
      body,
    );

    return NextResponse.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "移动端通话事件记录失败。" },
      { status: 400 },
    );
  }
}
