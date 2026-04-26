import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";
import { registerMobileDevice } from "@/lib/calls/recording-mutations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const device = await registerMobileDevice(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      body,
    );

    return NextResponse.json({ device }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "设备登记失败。" },
      { status: 400 },
    );
  }
}
