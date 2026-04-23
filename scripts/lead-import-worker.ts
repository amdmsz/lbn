import "dotenv/config";
import { createLeadImportWorker } from "../lib/lead-imports/worker";
import {
  getLeadImportChunkSize,
  getLeadImportJobAttempts,
  getLeadImportWorkerConcurrency,
  LEAD_IMPORT_QUEUE_NAME,
} from "../lib/lead-imports/queue";

async function main() {
  console.log("[lead-import-worker] boot", {
    queueName: LEAD_IMPORT_QUEUE_NAME,
    chunkSize: getLeadImportChunkSize(),
    workerConcurrency: getLeadImportWorkerConcurrency(),
    jobAttempts: getLeadImportJobAttempts(),
  });

  const worker = createLeadImportWorker();

  worker.on("ready", () => {
    console.log("[lead-import-worker] ready");
  });

  worker.on("active", (job) => {
    console.log("[lead-import-worker] active", {
      batchId: job.data.batchId,
      mode: job.data.mode,
      jobId: job.id,
    });
  });

  worker.on("completed", (job) => {
    console.log("[lead-import-worker] completed", {
      batchId: job.data.batchId,
      mode: job.data.mode,
      jobId: job.id,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("[lead-import-worker] failed", {
      batchId: job?.data.batchId,
      mode: job?.data.mode,
      jobId: job?.id,
      message: error.message,
    });
  });

  const shutdown = async (signal: string) => {
    console.log("[lead-import-worker] shutting down", { signal });
    await worker.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  console.error("[lead-import-worker] boot failed", error);
  process.exit(1);
});
