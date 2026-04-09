import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import { type LeadImportMode } from "@/lib/lead-imports/metadata";

export const LEAD_IMPORT_QUEUE_NAME = "lead-import-batches";

export type LeadImportQueueJobPayload = {
  batchId: string;
  mode: LeadImportMode;
};

let leadImportQueue: Queue<LeadImportQueueJobPayload> | null = null;

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum = 1,
) {
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(parsed));
}

export function getLeadImportRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for async lead import queue processing.");
  }

  return redisUrl;
}

export function getLeadImportQueueConnection(): ConnectionOptions {
  return {
    url: getLeadImportRedisUrl(),
    maxRetriesPerRequest: null,
  };
}

export function getLeadImportChunkSize() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_CHUNK_SIZE, 20);
}

export function getLeadImportWorkerConcurrency() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_WORKER_CONCURRENCY, 1);
}

export function getLeadImportJobAttempts() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_JOB_ATTEMPTS, 3);
}

export function getLeadImportQueue() {
  if (leadImportQueue) {
    return leadImportQueue;
  }

  leadImportQueue = new Queue<LeadImportQueueJobPayload>(LEAD_IMPORT_QUEUE_NAME, {
    connection: getLeadImportQueueConnection(),
    defaultJobOptions: getLeadImportJobOptions(),
  });

  return leadImportQueue;
}

export function getLeadImportJobOptions(): JobsOptions {
  return {
    attempts: getLeadImportJobAttempts(),
    backoff: {
      type: "exponential",
      delay: 3_000,
    },
    removeOnComplete: 100,
    removeOnFail: 200,
  };
}

export async function enqueueLeadImportBatchJob(input: LeadImportQueueJobPayload) {
  const queue = getLeadImportQueue();
  return queue.add("process-batch", input, {
    jobId: input.batchId,
  });
}
