import type { Prisma } from "@prisma/client";
import {
  buildManagedUserDeletionImpact,
  type ManagedUserDeletionImpact,
} from "@/lib/account-management/deletion-impact";
import { isMissingUserPermissionGrantTableError } from "@/lib/auth/permission-grants-compat";
import { prisma } from "@/lib/db/prisma";

type TransactionClient = Prisma.TransactionClient;

const noMatchIds = ["__managed_user_delete_no_match__"];

function ids(records: Array<{ id: string }>) {
  return records.map((record) => record.id);
}

function listOrNoMatch(value: string[]) {
  return value.length > 0 ? value : noMatchIds;
}

export type ManagedUserDeletionHistoricalCleanupCounts = {
  callActionEventsDeleted: number;
  callAiAnalysesDeleted: number;
  callQualityReviewsDeleted: number;
  callRecordingUploadsDeleted: number;
  callRecordingsDeleted: number;
  outboundCallSessionsDeleted: number;
  callRecordsDeleted: number;
  followUpTasksDeleted: number;
  wechatRecordsDeleted: number;
  liveAudienceRecordsUnlinked: number;
  liveInvitationsDeleted: number;
  leadAssignmentsDeleted: number;
  paymentRecordsDeleted: number;
  codCollectionRecordsUnlinked: number;
  collectionTasksDeleted: number;
  logisticsFollowUpTasksDeleted: number;
  leadDedupLogsDeleted: number;
  leadCustomerMergeLogsDeleted: number;
  leadImportRowsDeleted: number;
  customerHistoryArchivesUnlinked: number;
  leadImportBatchRollbacksDeleted: number;
  importedCustomerDeletionRequestsDeleted: number;
  leadsUnlinkedFromRolledBackBatch: number;
  leadImportBatchesDeleted: number;
  recycleBinEntriesDeleted: number;
};

async function countUserPermissionGrantsTx(tx: TransactionClient, userId: string) {
  try {
    return await tx.userPermissionGrant.count({
      where: {
        userId,
      },
    });
  } catch (error) {
    if (isMissingUserPermissionGrantTableError(error)) {
      return 0;
    }

    throw error;
  }
}

async function deleteUserPermissionGrantsTx(tx: TransactionClient, userId: string) {
  try {
    const result = await tx.userPermissionGrant.deleteMany({
      where: {
        userId,
      },
    });

    return result.count;
  } catch (error) {
    if (isMissingUserPermissionGrantTableError(error)) {
      return 0;
    }

    throw error;
  }
}

export async function getManagedUserDeletionImpactTx(
  tx: TransactionClient,
  userId: string,
): Promise<ManagedUserDeletionImpact> {
  const [
    ownedCustomerCount,
    permissionGrantCount,
    outboundCallSeatBindingCount,
    mobileDeviceCount,
    productSavedViewCount,
    callRecordCount,
    callRecordingCount,
    outboundCallSessionCount,
    callQualityReviewCount,
    followUpTaskCount,
    wechatRecordCount,
    liveInvitationCount,
    leadAssignmentToCount,
    leadAssignmentByCount,
    paymentRecordSubmittedCount,
    collectionTaskCount,
    logisticsFollowUpTaskCount,
    leadImportBatchCount,
    recycleBinEntryDeletedCount,
    leadImportBatchRollbackCount,
    importedCustomerDeletionRequestCount,
  ] = await Promise.all([
    tx.customer.count({ where: { ownerId: userId } }),
    countUserPermissionGrantsTx(tx, userId),
    tx.outboundCallSeatBinding.count({ where: { userId } }),
    tx.mobileDevice.count({ where: { userId } }),
    tx.productSavedView.count({ where: { ownerId: userId } }),
    tx.callRecord.count({ where: { salesId: userId } }),
    tx.callRecording.count({ where: { salesId: userId } }),
    tx.outboundCallSession.count({ where: { salesId: userId } }),
    tx.callQualityReview.count({ where: { reviewerId: userId } }),
    tx.followUpTask.count({ where: { ownerId: userId } }),
    tx.wechatRecord.count({ where: { salesId: userId } }),
    tx.liveInvitation.count({ where: { salesId: userId } }),
    tx.leadAssignment.count({ where: { toUserId: userId } }),
    tx.leadAssignment.count({ where: { assignedById: userId } }),
    tx.paymentRecord.count({ where: { submittedById: userId } }),
    tx.collectionTask.count({ where: { ownerId: userId } }),
    tx.logisticsFollowUpTask.count({ where: { ownerId: userId } }),
    tx.leadImportBatch.count({ where: { createdById: userId } }),
    tx.recycleBinEntry.count({ where: { deletedById: userId } }),
    tx.leadImportBatchRollback.count({ where: { actorId: userId } }),
    tx.importedCustomerDeletionRequest.count({
      where: {
        requestedById: userId,
      },
    }),
  ]);

  return buildManagedUserDeletionImpact({
    ownedCustomerCount,
    permissionGrantCount,
    outboundCallSeatBindingCount,
    mobileDeviceCount,
    productSavedViewCount,
    callRecordCount,
    callRecordingCount,
    outboundCallSessionCount,
    callQualityReviewCount,
    followUpTaskCount,
    wechatRecordCount,
    liveInvitationCount,
    leadAssignmentToCount,
    leadAssignmentByCount,
    paymentRecordSubmittedCount,
    collectionTaskCount,
    logisticsFollowUpTaskCount,
    leadImportBatchCount,
    recycleBinEntryDeletedCount,
    leadImportBatchRollbackCount,
    importedCustomerDeletionRequestCount,
  });
}

export async function getManagedUserDeletionImpact(
  userId: string,
): Promise<ManagedUserDeletionImpact> {
  return prisma.$transaction((tx) => getManagedUserDeletionImpactTx(tx, userId));
}

export async function cleanupManagedUserPrivateConfigTx(
  tx: TransactionClient,
  userId: string,
) {
  const permissionGrantsDeleted = await deleteUserPermissionGrantsTx(tx, userId);
  const outboundCallSeatBindingsDeleted = await tx.outboundCallSeatBinding.deleteMany({
    where: {
      userId,
    },
  });
  const mobileDevicesDeleted = await tx.mobileDevice.deleteMany({
    where: {
      userId,
    },
  });
  const productSavedViewsDeleted = await tx.productSavedView.deleteMany({
    where: {
      ownerId: userId,
    },
  });

  return {
    permissionGrantsDeleted,
    outboundCallSeatBindingsDeleted: outboundCallSeatBindingsDeleted.count,
    mobileDevicesDeleted: mobileDevicesDeleted.count,
    productSavedViewsDeleted: productSavedViewsDeleted.count,
  };
}

export async function deleteManagedUserHistoricalReferencesTx(
  tx: TransactionClient,
  userId: string,
): Promise<ManagedUserDeletionHistoricalCleanupCounts> {
  const callRecords = await tx.callRecord.findMany({
    where: {
      salesId: userId,
    },
    select: {
      id: true,
    },
  });
  const callRecordIds = ids(callRecords);

  const [callRecordings, outboundCallSessions, paymentRecords, liveInvitations, leadImportBatches] =
    await Promise.all([
      tx.callRecording.findMany({
        where: {
          OR: [
            { salesId: userId },
            {
              callRecordId: {
                in: listOrNoMatch(callRecordIds),
              },
            },
          ],
        },
        select: {
          id: true,
        },
      }),
      tx.outboundCallSession.findMany({
        where: {
          OR: [
            { salesId: userId },
            {
              callRecordId: {
                in: listOrNoMatch(callRecordIds),
              },
            },
          ],
        },
        select: {
          id: true,
        },
      }),
      tx.paymentRecord.findMany({
        where: {
          submittedById: userId,
        },
        select: {
          id: true,
        },
      }),
      tx.liveInvitation.findMany({
        where: {
          salesId: userId,
        },
        select: {
          id: true,
        },
      }),
      tx.leadImportBatch.findMany({
        where: {
          createdById: userId,
        },
        select: {
          id: true,
        },
      }),
    ]);

  const callRecordingIds = ids(callRecordings);
  const outboundCallSessionIds = ids(outboundCallSessions);
  const paymentRecordIds = ids(paymentRecords);
  const liveInvitationIds = ids(liveInvitations);
  const leadImportBatchIds = ids(leadImportBatches);

  const [leadImportRows, leadAssignments, followUpTasks, wechatRecords] =
    await Promise.all([
      tx.leadImportRow.findMany({
        where: {
          batchId: {
            in: listOrNoMatch(leadImportBatchIds),
          },
        },
        select: {
          id: true,
        },
      }),
      tx.leadAssignment.findMany({
        where: {
          OR: [{ toUserId: userId }, { assignedById: userId }],
        },
        select: {
          id: true,
        },
      }),
      tx.followUpTask.findMany({
        where: {
          ownerId: userId,
        },
        select: {
          id: true,
        },
      }),
      tx.wechatRecord.findMany({
        where: {
          salesId: userId,
        },
        select: {
          id: true,
        },
      }),
    ]);

  const leadImportRowIds = ids(leadImportRows);
  const leadAssignmentIds = ids(leadAssignments);
  const followUpTaskIds = ids(followUpTasks);
  const wechatRecordIds = ids(wechatRecords);

  const callActionEventsDeleted = await tx.callActionEvent.deleteMany({
    where: {
      OR: [
        {
          callRecordId: {
            in: listOrNoMatch(callRecordIds),
          },
        },
        {
          outboundSessionId: {
            in: listOrNoMatch(outboundCallSessionIds),
          },
        },
      ],
    },
  });
  const callAiAnalysesDeleted = await tx.callAiAnalysis.deleteMany({
    where: {
      OR: [
        {
          callRecordId: {
            in: listOrNoMatch(callRecordIds),
          },
        },
        {
          recordingId: {
            in: listOrNoMatch(callRecordingIds),
          },
        },
      ],
    },
  });
  const callQualityReviewsDeleted = await tx.callQualityReview.deleteMany({
    where: {
      OR: [
        { reviewerId: userId },
        {
          callRecordId: {
            in: listOrNoMatch(callRecordIds),
          },
        },
        {
          recordingId: {
            in: listOrNoMatch(callRecordingIds),
          },
        },
      ],
    },
  });
  const callRecordingUploadsDeleted = await tx.callRecordingUpload.deleteMany({
    where: {
      recordingId: {
        in: listOrNoMatch(callRecordingIds),
      },
    },
  });

  const codCollectionRecordsUnlinked = await tx.codCollectionRecord.updateMany({
    where: {
      paymentRecordId: {
        in: listOrNoMatch(paymentRecordIds),
      },
    },
    data: {
      paymentRecordId: null,
    },
  });
  const liveAudienceRecordsUnlinked = await tx.liveAudienceRecord.updateMany({
    where: {
      liveInvitationId: {
        in: listOrNoMatch(liveInvitationIds),
      },
    },
    data: {
      liveInvitationId: null,
    },
  });
  const customerHistoryArchivesUnlinked = await tx.customerHistoryArchive.updateMany({
    where: {
      OR: [
        {
          sourceBatchId: {
            in: listOrNoMatch(leadImportBatchIds),
          },
        },
        {
          sourceRowId: {
            in: listOrNoMatch(leadImportRowIds),
          },
        },
      ],
    },
    data: {
      sourceBatchId: null,
      sourceRowId: null,
    },
  });
  const leadsUnlinkedFromRolledBackBatch = await tx.lead.updateMany({
    where: {
      rolledBackBatchId: {
        in: listOrNoMatch(leadImportBatchIds),
      },
    },
    data: {
      rolledBackBatchId: null,
    },
  });

  const callRecordingsDeleted = await tx.callRecording.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(callRecordingIds),
      },
    },
  });
  const outboundCallSessionsDeleted = await tx.outboundCallSession.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(outboundCallSessionIds),
      },
    },
  });
  const callRecordsDeleted = await tx.callRecord.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(callRecordIds),
      },
    },
  });
  const followUpTasksDeleted = await tx.followUpTask.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(followUpTaskIds),
      },
    },
  });
  const wechatRecordsDeleted = await tx.wechatRecord.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(wechatRecordIds),
      },
    },
  });
  const liveInvitationsDeleted = await tx.liveInvitation.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(liveInvitationIds),
      },
    },
  });
  const leadAssignmentsDeleted = await tx.leadAssignment.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(leadAssignmentIds),
      },
    },
  });
  const paymentRecordsDeleted = await tx.paymentRecord.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(paymentRecordIds),
      },
    },
  });
  const collectionTasksDeleted = await tx.collectionTask.deleteMany({
    where: {
      ownerId: userId,
    },
  });
  const logisticsFollowUpTasksDeleted = await tx.logisticsFollowUpTask.deleteMany({
    where: {
      ownerId: userId,
    },
  });
  const leadDedupLogsDeleted = await tx.leadDedupLog.deleteMany({
    where: {
      batchId: {
        in: listOrNoMatch(leadImportBatchIds),
      },
    },
  });
  const leadCustomerMergeLogsDeleted = await tx.leadCustomerMergeLog.deleteMany({
    where: {
      batchId: {
        in: listOrNoMatch(leadImportBatchIds),
      },
    },
  });
  const leadImportRowsDeleted = await tx.leadImportRow.deleteMany({
    where: {
      batchId: {
        in: listOrNoMatch(leadImportBatchIds),
      },
    },
  });
  const leadImportBatchRollbacksDeleted = await tx.leadImportBatchRollback.deleteMany({
    where: {
      OR: [
        { actorId: userId },
        {
          batchId: {
            in: listOrNoMatch(leadImportBatchIds),
          },
        },
      ],
    },
  });
  const importedCustomerDeletionRequestsDeleted =
    await tx.importedCustomerDeletionRequest.deleteMany({
      where: {
        OR: [
          { requestedById: userId },
          {
            sourceBatchId: {
              in: listOrNoMatch(leadImportBatchIds),
            },
          },
        ],
      },
    });
  const leadImportBatchesDeleted = await tx.leadImportBatch.deleteMany({
    where: {
      id: {
        in: listOrNoMatch(leadImportBatchIds),
      },
    },
  });
  const recycleBinEntriesDeleted = await tx.recycleBinEntry.deleteMany({
    where: {
      deletedById: userId,
    },
  });

  return {
    callActionEventsDeleted: callActionEventsDeleted.count,
    callAiAnalysesDeleted: callAiAnalysesDeleted.count,
    callQualityReviewsDeleted: callQualityReviewsDeleted.count,
    callRecordingUploadsDeleted: callRecordingUploadsDeleted.count,
    callRecordingsDeleted: callRecordingsDeleted.count,
    outboundCallSessionsDeleted: outboundCallSessionsDeleted.count,
    callRecordsDeleted: callRecordsDeleted.count,
    followUpTasksDeleted: followUpTasksDeleted.count,
    wechatRecordsDeleted: wechatRecordsDeleted.count,
    liveAudienceRecordsUnlinked: liveAudienceRecordsUnlinked.count,
    liveInvitationsDeleted: liveInvitationsDeleted.count,
    leadAssignmentsDeleted: leadAssignmentsDeleted.count,
    paymentRecordsDeleted: paymentRecordsDeleted.count,
    codCollectionRecordsUnlinked: codCollectionRecordsUnlinked.count,
    collectionTasksDeleted: collectionTasksDeleted.count,
    logisticsFollowUpTasksDeleted: logisticsFollowUpTasksDeleted.count,
    leadDedupLogsDeleted: leadDedupLogsDeleted.count,
    leadCustomerMergeLogsDeleted: leadCustomerMergeLogsDeleted.count,
    leadImportRowsDeleted: leadImportRowsDeleted.count,
    customerHistoryArchivesUnlinked: customerHistoryArchivesUnlinked.count,
    leadImportBatchRollbacksDeleted: leadImportBatchRollbacksDeleted.count,
    importedCustomerDeletionRequestsDeleted: importedCustomerDeletionRequestsDeleted.count,
    leadsUnlinkedFromRolledBackBatch: leadsUnlinkedFromRolledBackBatch.count,
    leadImportBatchesDeleted: leadImportBatchesDeleted.count,
    recycleBinEntriesDeleted: recycleBinEntriesDeleted.count,
  };
}
