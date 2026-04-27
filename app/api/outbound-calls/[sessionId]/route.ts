import { NextResponse } from "next/server";
import { canAccessCustomerModule, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { maskPhoneForAudit } from "@/lib/outbound-calls/metadata";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessCustomerModule(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { sessionId } = await context.params;

  if (!sessionId?.trim()) {
    return NextResponse.json({ message: "Invalid session id" }, { status: 400 });
  }

  const customerScope = getCustomerScope(
    session.user.role,
    session.user.id,
    session.user.teamId,
  );

  if (!customerScope) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const outboundSession = await prisma.outboundCallSession.findFirst({
    where: {
      id: sessionId,
      customer: {
        is: customerScope,
      },
    },
    select: {
      id: true,
      callRecordId: true,
      provider: true,
      providerCallId: true,
      providerTraceId: true,
      dialedNumber: true,
      displayNumber: true,
      seatNo: true,
      status: true,
      failureCode: true,
      failureMessage: true,
      requestedAt: true,
      ringingAt: true,
      answeredAt: true,
      endedAt: true,
      durationSeconds: true,
      recordingImportedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      callRecord: {
        select: {
          durationSeconds: true,
          recording: {
            select: {
              id: true,
              status: true,
              durationSeconds: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  if (!outboundSession) {
    return NextResponse.json({ message: "外呼会话不存在。" }, { status: 404 });
  }

  return NextResponse.json(
    {
      session: {
        id: outboundSession.id,
        callRecordId: outboundSession.callRecordId,
        provider: outboundSession.provider,
        providerCallId: outboundSession.providerCallId,
        providerTraceId: outboundSession.providerTraceId,
        customer: {
          id: outboundSession.customer.id,
          name: outboundSession.customer.name,
          phoneMasked: maskPhoneForAudit(outboundSession.customer.phone),
        },
        dialedNumberMasked: maskPhoneForAudit(outboundSession.dialedNumber),
        displayNumber: outboundSession.displayNumber,
        seatNo: outboundSession.seatNo,
        status: outboundSession.status,
        failureCode: outboundSession.failureCode,
        failureMessage: outboundSession.failureMessage,
        requestedAt: outboundSession.requestedAt.toISOString(),
        ringingAt: outboundSession.ringingAt?.toISOString() ?? null,
        answeredAt: outboundSession.answeredAt?.toISOString() ?? null,
        endedAt: outboundSession.endedAt?.toISOString() ?? null,
        durationSeconds:
          outboundSession.durationSeconds ??
          outboundSession.callRecord.durationSeconds ??
          null,
        recordingImportedAt:
          outboundSession.recordingImportedAt?.toISOString() ?? null,
        recording: outboundSession.callRecord.recording
          ? {
              id: outboundSession.callRecord.recording.id,
              status: outboundSession.callRecord.recording.status,
              durationSeconds:
                outboundSession.callRecord.recording.durationSeconds,
              uploadedAt:
                outboundSession.callRecord.recording.uploadedAt?.toISOString() ??
                null,
            }
          : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
