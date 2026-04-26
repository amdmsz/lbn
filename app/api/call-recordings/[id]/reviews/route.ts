import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { saveCallQualityReview } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function POST(
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
    const body = await request.json();
    const review = await saveCallQualityReview(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      id,
      body,
    );

    return NextResponse.json({ review }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "保存录音复核失败。" },
      { status: 400 },
    );
  }
}
