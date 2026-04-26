import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { finishMobileCallSession } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function PATCH(
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
    const call = await finishMobileCallSession(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      callRecordId,
      body,
    );

    return NextResponse.json({ call }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "移动端通话结束失败。" },
      { status: 400 },
    );
  }
}
