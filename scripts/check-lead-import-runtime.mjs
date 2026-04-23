import "dotenv/config";
import { Queue } from "bullmq";

const LEAD_IMPORT_QUEUE_NAME = "lead-import-batches";

function parseBooleanFlag(value, fallback = false) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveInteger(value, fallback, minimum = 1) {
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.floor(parsed));
}

function getLeadImportRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for async lead import queue processing.");
  }

  return redisUrl;
}

function getLeadImportQueueConnection() {
  return {
    url: getLeadImportRedisUrl(),
    maxRetriesPerRequest: null,
  };
}

function getLeadImportChunkSize() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_CHUNK_SIZE, 20);
}

function getLeadImportWorkerConcurrency() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_WORKER_CONCURRENCY, 1);
}

function getLeadImportJobAttempts() {
  return parsePositiveInteger(process.env.LEAD_IMPORT_JOB_ATTEMPTS, 3);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function main() {
  const requireWorker = parseBooleanFlag(process.env.REQUIRE_LEAD_IMPORT_WORKER, false);
  const verbose = parseBooleanFlag(process.env.LEAD_IMPORT_RUNTIME_VERBOSE, false);
  const timeoutMs = parsePositiveInteger(
    process.env.LEAD_IMPORT_RUNTIME_TIMEOUT_MS,
    10_000,
    1_000,
  );
  const queue = new Queue(LEAD_IMPORT_QUEUE_NAME, {
    connection: getLeadImportQueueConnection(),
  });
  let ready = false;

  console.log("[lead-import-runtime-check] config", {
    queueName: LEAD_IMPORT_QUEUE_NAME,
    chunkSize: getLeadImportChunkSize(),
    workerConcurrency: getLeadImportWorkerConcurrency(),
    jobAttempts: getLeadImportJobAttempts(),
    requireWorker,
    timeoutMs,
  });

  try {
    await withTimeout(queue.waitUntilReady(), timeoutMs, "Redis connection");
    ready = true;

    const client = await queue.client;
    const [pingResult, isPaused, jobCounts] = await withTimeout(
      Promise.all([
        client.ping(),
        queue.isPaused(),
        queue.getJobCounts(
          "waiting",
          "active",
          "completed",
          "failed",
          "delayed",
          "prioritized",
          "waiting-children",
        ),
      ]),
      timeoutMs,
      "Queue status inspection",
    );

    let workerCount = null;
    let workerDetails = [];

    try {
      workerCount = await withTimeout(
        queue.getWorkersCount(),
        timeoutMs,
        "Worker count inspection",
      );

      if (verbose) {
        workerDetails = await withTimeout(
          queue.getWorkers(),
          timeoutMs,
          "Worker detail inspection",
        );
      }
    } catch (error) {
      console.warn("[lead-import-runtime-check] worker inspection unavailable", {
        message: error instanceof Error ? error.message : "unknown error",
      });
    }

    console.log("[lead-import-runtime-check] queue", {
      redisPing: pingResult,
      redisVersion: queue.redisVersion,
      paused: isPaused,
      workers: workerCount,
      jobs: jobCounts,
    });

    if (verbose && workerDetails.length > 0) {
      console.log("[lead-import-runtime-check] worker details", workerDetails);
    }

    if (requireWorker && workerCount === 0) {
      throw new Error("Lead import worker is required but no active BullMQ workers were detected.");
    }

    console.log("[lead-import-runtime-check] ok");
  } finally {
    if (ready) {
      await withTimeout(queue.close(), Math.min(timeoutMs, 5_000), "Queue close").catch(
        () => {
          void queue.disconnect().catch(() => undefined);
        },
      );
    } else {
      void queue.disconnect().catch(() => undefined);
    }
  }
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[lead-import-runtime-check] failed", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    process.exit(1);
  });
