import { Worker, type Job } from "bullmq";
import { createLeadImportBatchFailureLog, setLeadImportBatchFailed } from "@/lib/lead-imports/batch-state";
import {
  getLeadImportQueueConnection,
  getLeadImportWorkerConcurrency,
  LEAD_IMPORT_QUEUE_NAME,
  type LeadImportQueueJobPayload,
} from "@/lib/lead-imports/queue";
import { processCustomerContinuationImportBatchAsync } from "@/lib/lead-imports/customer-continuation-import";
import { processLeadImportBatchAsync } from "@/lib/lead-imports/mutations";
import { prisma } from "@/lib/db/prisma";

async function markJobFailure(job: Job<LeadImportQueueJobPayload>, error: unknown) {
  const message = error instanceof Error ? error.message : "导入处理失败，请稍后重试。";
  const batch = await prisma.leadImportBatch.findUnique({
    where: { id: job.data.batchId },
    select: {
      id: true,
      createdById: true,
      fileName: true,
    },
  });

  if (!batch) {
    return;
  }

  await setLeadImportBatchFailed({
    batchId: batch.id,
    message,
  });

  const currentAttempt = job.attemptsMade + 1;
  const attemptsAllowed = job.opts.attempts ?? 1;

  if (currentAttempt >= attemptsAllowed) {
    await createLeadImportBatchFailureLog({
      actorId: batch.createdById,
      batchId: batch.id,
      fileName: batch.fileName,
      importKind:
        job.data.mode === "customer_continuation" ? "CUSTOMER_CONTINUATION" : "LEAD",
      message,
      attempt: currentAttempt,
      attemptsAllowed,
    });
  }
}

export async function processLeadImportQueueJob(job: Job<LeadImportQueueJobPayload>) {
  try {
    if (job.data.mode === "customer_continuation") {
      return processCustomerContinuationImportBatchAsync(job.data.batchId, {
        queueJobId: job.id?.toString() ?? job.data.batchId,
      });
    }

    return processLeadImportBatchAsync(job.data.batchId, {
      queueJobId: job.id?.toString() ?? job.data.batchId,
    });
  } catch (error) {
    await markJobFailure(job, error);
    throw error;
  }
}

export function createLeadImportWorker() {
  return new Worker<LeadImportQueueJobPayload>(
    LEAD_IMPORT_QUEUE_NAME,
    processLeadImportQueueJob,
    {
      connection: getLeadImportQueueConnection(),
      concurrency: getLeadImportWorkerConcurrency(),
    },
  );
}
