import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { CallRecordingStorageProvider } from "@prisma/client";
import { getRecordingExtensionForMimeType } from "@/lib/calls/recording-audio";
import { resolveSystemSettingValue } from "@/lib/system-settings/queries";
import type {
  RecordingStorageSettingValue,
  RecordingUploadSettingValue,
} from "@/lib/system-settings/schema";

const DEFAULT_MAX_FILE_MB = 200;
const DEFAULT_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 365;
const BYTES_PER_MB = 1024 * 1024;

export type RecordingStorageConfig = {
  provider: CallRecordingStorageProvider;
  storageDir: string;
  uploadTmpDir: string;
  bucket: string | null;
  maxFileBytes: number;
  defaultChunkSizeBytes: number;
  retentionDays: number;
};

export type RecordingRuntimeConfigSource = "database" | "fallback" | "default";

export type RecordingByteRangeRequest = {
  start?: number;
  end?: number;
};

export type RecordingByteRange = {
  start: number;
  end: number;
  total: number;
};

export class RecordingRangeNotSatisfiableError extends Error {
  totalLength: number;

  constructor(totalLength: number) {
    super("Requested audio byte range is not satisfiable.");
    this.name = "RecordingRangeNotSatisfiableError";
    this.totalLength = totalLength;
  }
}

export type ResolvedRecordingStorageConfig = RecordingStorageConfig & {
  source: {
    storage: RecordingRuntimeConfigSource;
    upload: RecordingRuntimeConfigSource;
  };
  publicBaseUrl: string | null;
  uploadExpiresMinutes: number;
  allowedMimeTypes: string[];
  requireSha256: boolean;
  playbackCacheEnabled: boolean;
  playbackCacheDir: string | null;
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStorageProvider(value: string | undefined) {
  if (value === "MINIO" || value === "S3") {
    return value;
  }

  return "LOCAL_MOUNT";
}

function sanitizeSegment(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function assertLocalProvider(provider: CallRecordingStorageProvider) {
  if (provider !== "LOCAL_MOUNT") {
    throw new Error("当前服务端仅启用了 LOCAL_MOUNT 录音存储适配器。");
  }
}

function resolveInside(baseDir: string, relativePath: string) {
  const absoluteBase = path.resolve(baseDir);
  const absolutePath = path.resolve(absoluteBase, relativePath);
  const allowedPrefix = `${absoluteBase}${path.sep}`;

  if (absolutePath !== absoluteBase && !absolutePath.startsWith(allowedPrefix)) {
    throw new Error("录音存储路径越界。");
  }

  return absolutePath;
}

export function getRecordingStorageConfig(): RecordingStorageConfig {
  const maxFileMb = parsePositiveInteger(
    process.env.CALL_RECORDING_MAX_FILE_MB,
    DEFAULT_MAX_FILE_MB,
  );

  return {
    provider: normalizeStorageProvider(
      process.env.CALL_RECORDING_STORAGE_PROVIDER,
    ),
    storageDir:
      process.env.CALL_RECORDING_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), "runtime", "call-recordings"),
    uploadTmpDir:
      process.env.CALL_RECORDING_UPLOAD_TMP_DIR?.trim() ||
      path.join(process.cwd(), "runtime", "call-recording-uploads"),
    bucket: process.env.CALL_RECORDING_STORAGE_BUCKET?.trim() || null,
    maxFileBytes: maxFileMb * 1024 * 1024,
    defaultChunkSizeBytes: parsePositiveInteger(
      process.env.CALL_RECORDING_CHUNK_SIZE_BYTES,
      DEFAULT_CHUNK_SIZE_BYTES,
    ),
    retentionDays: parsePositiveInteger(
      process.env.CALL_RECORDING_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
    ),
  };
}

function getEnvRecordingStorageSettingValue(): RecordingStorageSettingValue {
  const envConfig = getRecordingStorageConfig();

  return {
    provider: envConfig.provider,
    storageDir: envConfig.storageDir,
    uploadTmpDir: envConfig.uploadTmpDir,
    bucket: envConfig.bucket,
    publicBaseUrl:
      process.env.CALL_RECORDING_PUBLIC_BASE_URL?.trim() ||
      process.env.CALL_AI_AUDIO_PUBLIC_BASE_URL?.trim() ||
      null,
    retentionDays: envConfig.retentionDays,
    playbackCacheEnabled: true,
    playbackCacheDir:
      process.env.CALL_RECORDING_PLAYBACK_CACHE_DIR?.trim() || null,
  };
}

function getEnvRecordingUploadSettingValue(): RecordingUploadSettingValue {
  const envConfig = getRecordingStorageConfig();
  const chunkSizeMb = Math.max(
    1,
    Math.ceil(envConfig.defaultChunkSizeBytes / BYTES_PER_MB),
  );

  return {
    maxFileMb: Math.max(1, Math.ceil(envConfig.maxFileBytes / BYTES_PER_MB)),
    chunkSizeMb,
    uploadExpiresMinutes: parsePositiveInteger(
      process.env.CALL_RECORDING_UPLOAD_EXPIRES_MINUTES,
      24 * 60,
    ),
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/mp4",
      "audio/m4a",
      "audio/amr",
      "audio/wav",
    ],
    requireSha256: false,
  };
}

export async function resolveRecordingStorageConfig(): Promise<ResolvedRecordingStorageConfig> {
  const envConfig = getRecordingStorageConfig();
  const [storage, upload] = await Promise.all([
    resolveSystemSettingValue<RecordingStorageSettingValue>(
      "recording.storage",
      "active",
      {
        fallbackValue: getEnvRecordingStorageSettingValue(),
      },
    ),
    resolveSystemSettingValue<RecordingUploadSettingValue>(
      "recording.upload",
      "active",
      {
        fallbackValue: getEnvRecordingUploadSettingValue(),
      },
    ),
  ]);

  return {
    provider: storage.value.provider,
    storageDir: storage.value.storageDir || envConfig.storageDir,
    uploadTmpDir: storage.value.uploadTmpDir || envConfig.uploadTmpDir,
    bucket: storage.value.bucket ?? null,
    maxFileBytes:
      upload.source === "fallback"
        ? envConfig.maxFileBytes
        : upload.value.maxFileMb * BYTES_PER_MB,
    defaultChunkSizeBytes:
      upload.source === "fallback"
        ? envConfig.defaultChunkSizeBytes
        : upload.value.chunkSizeMb * BYTES_PER_MB,
    retentionDays: storage.value.retentionDays,
    source: {
      storage: storage.source,
      upload: upload.source,
    },
    publicBaseUrl: storage.value.publicBaseUrl ?? null,
    uploadExpiresMinutes: upload.value.uploadExpiresMinutes,
    allowedMimeTypes: upload.value.allowedMimeTypes,
    requireSha256: upload.value.requireSha256,
    playbackCacheEnabled: storage.value.playbackCacheEnabled,
    playbackCacheDir: storage.value.playbackCacheDir ?? null,
  };
}

export function buildRecordingStorageConfigSnapshot(
  config: RecordingStorageConfig | ResolvedRecordingStorageConfig,
) {
  const resolved = config as Partial<ResolvedRecordingStorageConfig>;

  return {
    provider: config.provider,
    storageDir: config.storageDir,
    uploadTmpDir: config.uploadTmpDir,
    bucket: config.bucket,
    maxFileBytes: config.maxFileBytes,
    defaultChunkSizeBytes: config.defaultChunkSizeBytes,
    retentionDays: config.retentionDays,
    source: resolved.source ?? null,
    publicBaseUrlConfigured: Boolean(resolved.publicBaseUrl),
    uploadExpiresMinutes: resolved.uploadExpiresMinutes ?? null,
    playbackCacheEnabled: resolved.playbackCacheEnabled ?? null,
  };
}

export function buildRecordingObjectKey(input: {
  callRecordId: string;
  salesId: string;
  teamId?: string | null;
  mimeType: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const extension = getRecordingExtensionForMimeType(input.mimeType);

  return [
    "recordings",
    yyyy,
    mm,
    `team_${sanitizeSegment(input.teamId, "none")}`,
    `sales_${sanitizeSegment(input.salesId, "unknown")}`,
    `call_${sanitizeSegment(input.callRecordId, "unknown")}.${extension}`,
  ].join("/");
}

export function buildRecordingPlaybackObjectKey(input: {
  recordingId: string;
  storageKey: string;
}) {
  const parsedPath = path.parse(input.storageKey);
  const safeRecordingId = sanitizeSegment(input.recordingId, "unknown");

  return path
    .join(parsedPath.dir, "_playback", `${safeRecordingId}.m4a`)
    .replace(/\\/g, "/");
}

export function buildRetentionUntil(config: RecordingStorageConfig, from = new Date()) {
  const retentionUntil = new Date(from);
  retentionUntil.setDate(retentionUntil.getDate() + config.retentionDays);
  return retentionUntil;
}

function getUploadChunkPath(config: RecordingStorageConfig, uploadId: string, index: number) {
  return resolveInside(
    config.uploadTmpDir,
    path.join(sanitizeSegment(uploadId, "upload"), `chunk_${index}`),
  );
}

export function resolveRecordingStoragePath(input: {
  storageKey: string;
  config?: RecordingStorageConfig;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  assertLocalProvider(config.provider);
  return resolveInside(config.storageDir, input.storageKey);
}

export function resolveRecordingByteRange(
  request: RecordingByteRangeRequest | null | undefined,
  totalLength: number,
): RecordingByteRange | null {
  if (!request) {
    return null;
  }

  if (totalLength <= 0) {
    throw new RecordingRangeNotSatisfiableError(totalLength);
  }

  const hasStart = Number.isInteger(request.start);
  const hasEnd = Number.isInteger(request.end);

  if (!hasStart && !hasEnd) {
    throw new RecordingRangeNotSatisfiableError(totalLength);
  }

  let start: number;
  let end: number;

  if (!hasStart) {
    const suffixLength = request.end ?? 0;

    if (suffixLength <= 0) {
      throw new RecordingRangeNotSatisfiableError(totalLength);
    }

    start = Math.max(totalLength - suffixLength, 0);
    end = totalLength - 1;
  } else {
    start = request.start ?? 0;
    end = hasEnd ? request.end ?? 0 : totalLength - 1;
  }

  if (start < 0 || end < 0 || start > end || start >= totalLength) {
    throw new RecordingRangeNotSatisfiableError(totalLength);
  }

  return {
    start,
    end: Math.min(end, totalLength - 1),
    total: totalLength,
  };
}

export async function ensureRecordingStorageReady(config = getRecordingStorageConfig()) {
  assertLocalProvider(config.provider);
  await Promise.all([
    fs.mkdir(config.storageDir, { recursive: true }),
    fs.mkdir(config.uploadTmpDir, { recursive: true }),
  ]);
}

export async function writeUploadChunk(input: {
  uploadId: string;
  index: number;
  bytes: Buffer;
  expectedSha256?: string | null;
  config?: RecordingStorageConfig;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  assertLocalProvider(config.provider);

  if (input.expectedSha256) {
    const actualSha256 = createHash("sha256").update(input.bytes).digest("hex");

    if (actualSha256.toLowerCase() !== input.expectedSha256.toLowerCase()) {
      throw new Error("上传分片校验失败。");
    }
  }

  const chunkPath = getUploadChunkPath(config, input.uploadId, input.index);
  await fs.mkdir(path.dirname(chunkPath), { recursive: true });
  await fs.writeFile(chunkPath, input.bytes);

  return {
    bytes: input.bytes.length,
  };
}

export async function assembleUploadChunks(input: {
  uploadId: string;
  totalChunks: number;
  storageKey: string;
  expectedSha256?: string | null;
  config?: RecordingStorageConfig;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  assertLocalProvider(config.provider);

  const finalPath = resolveInside(config.storageDir, input.storageKey);
  const stagingPath = `${finalPath}.uploading`;
  const hash = createHash("sha256");
  let totalSizeBytes = 0;

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.rm(stagingPath, { force: true });

  for (let index = 0; index < input.totalChunks; index += 1) {
    const chunkPath = getUploadChunkPath(config, input.uploadId, index);
    const chunk = await fs.readFile(chunkPath);
    hash.update(chunk);
    totalSizeBytes += chunk.length;
    await fs.appendFile(stagingPath, chunk);
  }

  const sha256 = hash.digest("hex");

  if (
    input.expectedSha256 &&
    sha256.toLowerCase() !== input.expectedSha256.toLowerCase()
  ) {
    await fs.rm(stagingPath, { force: true });
    throw new Error("录音文件完整性校验失败。");
  }

  await fs.rm(finalPath, { force: true });
  await fs.rename(stagingPath, finalPath);

  return {
    storageKey: input.storageKey,
    sha256,
    fileSizeBytes: totalSizeBytes,
  };
}

export async function removeUploadChunks(
  uploadId: string,
  config = getRecordingStorageConfig(),
) {
  assertLocalProvider(config.provider);
  const uploadDirectory = resolveInside(
    config.uploadTmpDir,
    sanitizeSegment(uploadId, "upload"),
  );

  await fs.rm(uploadDirectory, { force: true, recursive: true });
}

export async function openRecordingReadStream(input: {
  storageKey: string;
  config?: RecordingStorageConfig;
  byteRange?: RecordingByteRangeRequest | null;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  assertLocalProvider(config.provider);

  const absolutePath = resolveRecordingStoragePath({
    storageKey: input.storageKey,
    config,
  });
  const stat = await fs.stat(absolutePath);
  const byteRange = resolveRecordingByteRange(input.byteRange, stat.size);
  const stream = Readable.toWeb(
    createReadStream(
      absolutePath,
      byteRange
        ? {
            start: byteRange.start,
            end: byteRange.end,
          }
        : undefined,
    ),
  );
  const contentLength = byteRange
    ? byteRange.end - byteRange.start + 1
    : stat.size;

  return {
    stream: stream as ReadableStream<Uint8Array>,
    contentLength,
    totalContentLength: stat.size,
    byteRange,
  };
}

export async function readRecordingFileBuffer(input: {
  storageKey: string;
  config?: RecordingStorageConfig;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  assertLocalProvider(config.provider);

  const absolutePath = resolveRecordingStoragePath({
    storageKey: input.storageKey,
    config,
  });
  const bytes = await fs.readFile(absolutePath);

  return {
    bytes,
    filename: path.basename(input.storageKey),
  };
}
