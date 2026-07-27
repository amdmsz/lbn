import { NextResponse } from "next/server";
import { z } from "zod";
import { canExportCustomers } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildCustomersExportXlsx,
  buildSelectedCustomersExportFileName,
  CustomerExportSelectionError,
  customersExportContentType,
  getSelectedCustomersExportData,
} from "@/lib/customers/export";
import { MAX_BATCH_CUSTOMER_ACTION_SIZE } from "@/lib/customers/metadata";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const selectedExportFiltersSchema = z
  .object({
    queue: z.string().trim().max(64).optional(),
    executionClasses: z.array(z.string().trim().max(32)).max(10).optional(),
    grades: z.array(z.string().trim().max(32)).max(10).optional(),
    teamId: z.string().trim().max(100).optional(),
    salesId: z.string().trim().max(100).optional(),
    search: z.string().trim().max(200).optional(),
    productKeys: z.array(z.string().trim().max(200)).max(1000).optional(),
    productKeyword: z.string().trim().max(200).optional(),
    tagIds: z.array(z.string().trim().max(100)).max(1000).optional(),
    assignedFrom: z.string().trim().max(32).optional(),
    assignedTo: z.string().trim().max(32).optional(),
  })
  .strict();

const selectedExportRequestSchema = z
  .object({
    selectionMode: z.enum(["manual", "filtered"]),
    customerIds: z
      .array(z.string().trim().min(1).max(100))
      .max(MAX_BATCH_CUSTOMER_ACTION_SIZE)
      .default([]),
    filters: selectedExportFiltersSchema.optional(),
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canExportCustomers(session.user.role)) {
    return NextResponse.json({ message: "无权导出客户数据。" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = selectedExportRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "导出参数无效，请刷新页面后重试。" }, { status: 400 });
  }

  try {
    const rawSearchParams = parsed.data.filters as
      | Record<string, string | string[] | undefined>
      | undefined;
    const data = await getSelectedCustomersExportData(
      {
        id: session.user.id,
        role: session.user.role,
        teamId: session.user.teamId,
      },
      {
        selectionMode: parsed.data.selectionMode,
        customerIds: parsed.data.customerIds,
        rawSearchParams,
      },
    );
    const xlsx = await buildCustomersExportXlsx(data.items, {
      title: "已选客户导出",
    });
    const fileName = buildSelectedCustomersExportFileName();

    await prisma.operationLog.create({
      data: {
        actorId: session.user.id,
        module: "CUSTOMER",
        action: "customer.selected_export",
        targetType: "CUSTOMER",
        targetId: "__customer_selected_export__",
        description: `导出已选客户 ${data.items.length} 条（手机号已脱敏）`,
        afterData: {
          selectionMode: data.selectionMode,
          count: data.items.length,
          customerIds: data.items.map((item) => item.id),
          filters: parsed.data.selectionMode === "filtered" ? parsed.data.filters ?? {} : {},
          phoneMasking: "middle_four",
        },
      },
    });

    return new NextResponse(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "Content-Type": customersExportContentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof CustomerExportSelectionError) {
      const status =
        error.code === "limit_exceeded" ? 413 : error.code === "stale_selection" ? 409 : 400;
      return NextResponse.json({ message: error.message }, { status });
    }

    throw error;
  }
}
