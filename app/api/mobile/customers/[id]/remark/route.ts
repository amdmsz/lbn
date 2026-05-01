import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessMobileApp } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { updateCustomerRemark } from "@/lib/customers/mutations";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

const updateMobileCustomerRemarkSchema = z.object({
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").default(""),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const customerId = id?.trim();

  if (!customerId) {
    return NextResponse.json(
      { message: "Invalid customer id" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const payload = updateMobileCustomerRemarkSchema.parse(body ?? {});
    const normalizedRemark = payload.remark || null;
    const result = await updateCustomerRemark(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        customerId,
        remark: payload.remark,
      },
    );

    return NextResponse.json(
      {
        customer: {
          id: result.customerId,
          remark: normalizedRemark,
        },
        message: result.description,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? "备注内容无效。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const message = error instanceof Error ? error.message : "客户备注保存失败。";
    const status = message.includes("无权") ? 403 : 500;

    console.error("Failed to update mobile customer remark.", error);

    return NextResponse.json(
      { message },
      { status, headers: noStoreHeaders },
    );
  }
}
