import { CallRecordingStatus, type OutboundCallProvider } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { maskPhoneForAudit } from "@/lib/outbound-calls/metadata";

export type OutboundRecordingGap = {
  sessionId: string;
  callRecordId: string;
  provider: OutboundCallProvider;
  providerCallId: string | null;
  customerId: string;
  customerName: string;
  customerPhoneMasked: string;
  salesId: string;
  seatNo: string | null;
  requestedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  recordingStatus: CallRecordingStatus | null;
  recordingFailureCode: string | null;
  recordingFailureMessage: string | null;
};

const incompleteRecordingStatuses = [
  CallRecordingStatus.LOCAL_PENDING,
  CallRecordingStatus.UPLOADING,
  CallRecordingStatus.FAILED,
] as const;

export async function findOutboundRecordingGaps(input?: {
  hours?: number;
  limit?: number;
  now?: Date;
}) {
  const now = input?.now ?? new Date();
  const hours = Math.max(1, input?.hours ?? 24);
  const limit = Math.min(Math.max(1, input?.limit ?? 50), 500);
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const sessions = await prisma.outboundCallSession.findMany({
    where: {
      status: "ENDED",
      endedAt: {
        gte: since,
      },
      OR: [
        {
          durationSeconds: {
            gt: 0,
          },
        },
        {
          callRecord: {
            is: {
              durationSeconds: {
                gt: 0,
              },
            },
          },
        },
      ],
      callRecord: {
        is: {
          OR: [
            {
              recording: {
                is: null,
              },
            },
            {
              recording: {
                is: {
                  status: {
                    in: [...incompleteRecordingStatuses],
                  },
                },
              },
            },
          ],
        },
      },
    },
    orderBy: [{ endedAt: "desc" }, { requestedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      callRecordId: true,
      provider: true,
      providerCallId: true,
      customerId: true,
      salesId: true,
      seatNo: true,
      requestedAt: true,
      endedAt: true,
      durationSeconds: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
      callRecord: {
        select: {
          durationSeconds: true,
          recording: {
            select: {
              status: true,
              failureCode: true,
              failureMessage: true,
            },
          },
        },
      },
    },
  });

  return sessions.map<OutboundRecordingGap>((session) => ({
    sessionId: session.id,
    callRecordId: session.callRecordId,
    provider: session.provider,
    providerCallId: session.providerCallId,
    customerId: session.customerId,
    customerName: session.customer.name,
    customerPhoneMasked: maskPhoneForAudit(session.customer.phone),
    salesId: session.salesId,
    seatNo: session.seatNo,
    requestedAt: session.requestedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    durationSeconds:
      session.durationSeconds ?? session.callRecord.durationSeconds ?? 0,
    recordingStatus: session.callRecord.recording?.status ?? null,
    recordingFailureCode: session.callRecord.recording?.failureCode ?? null,
    recordingFailureMessage: session.callRecord.recording?.failureMessage ?? null,
  }));
}
