import { NextResponse } from "next/server";
import { z } from "zod";
import { canCreateSalesOrder } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  saveTradeOrderDraft,
  submitTradeOrderForReview,
} from "@/lib/trade-orders/mutations";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

const mobileTradeOrderLineSchema = z.object({
  lineId: z.string().trim().default(""),
  skuId: z.string().trim().min(1, "请选择商品 SKU。"),
  qty: z.coerce.number().int().min(1, "商品数量至少为 1。"),
  dealPrice: z.coerce.number().min(0, "成交单价不能为负数。"),
  discountReason: z.string().trim().max(500, "优惠说明不能超过 500 字。").default(""),
});

const mobileTradeOrderSchema = z.object({
  action: z.enum(["save_draft", "submit_for_review"]).default("submit_for_review"),
  id: z.string().trim().default(""),
  customerId: z.string().trim().min(1, "缺少客户。"),
  lines: z.array(mobileTradeOrderLineSchema).min(1, "至少需要一条商品行。"),
  paymentScheme: z.enum([
    "FULL_PREPAID",
    "DEPOSIT_PLUS_BALANCE",
    "FULL_COD",
    "DEPOSIT_PLUS_COD",
  ]),
  depositAmount: z.coerce.number().min(0, "定金不能为负数。").default(0),
  receiverName: z.string().trim().min(1, "请填写收货人。").max(80),
  receiverPhone: z.string().trim().min(1, "请填写收货电话。").max(30),
  receiverAddress: z.string().trim().min(1, "请填写收货地址。").max(500),
  insuranceRequired: z.coerce.boolean().default(false),
  insuranceAmount: z.coerce.number().min(0, "保价金额不能为负数。").default(0),
  remark: z.string().trim().max(1000, "订单备注不能超过 1000 字。").default(""),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canCreateSalesOrder(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = mobileTradeOrderSchema.parse(await request.json());
    const actor = {
      id: session.user.id,
      role: session.user.role,
    };
    const mutationInput = {
      id: payload.id,
      customerId: payload.customerId,
      lines: payload.lines,
      giftLines: [],
      bundleLines: [],
      paymentScheme: payload.paymentScheme,
      depositAmount: payload.depositAmount,
      receiverName: payload.receiverName,
      receiverPhone: payload.receiverPhone,
      receiverAddress: payload.receiverAddress,
      insuranceRequired: payload.insuranceRequired,
      insuranceAmount: payload.insuranceAmount,
      remark: payload.remark,
    };

    const order =
      payload.action === "save_draft"
        ? await saveTradeOrderDraft(actor, mutationInput)
        : await submitTradeOrderForReview(actor, mutationInput);

    return NextResponse.json(
      {
        order,
        message: payload.action === "save_draft" ? "订单草稿已保存。" : "订单已提交审核。",
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? "移动端订单参数不完整。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const message = error instanceof Error ? error.message : "移动端订单提交失败。";
    const status =
      message.includes("permission") || message.includes("out of scope") ? 403 : 400;

    return NextResponse.json({ message }, { status, headers: noStoreHeaders });
  }
}
