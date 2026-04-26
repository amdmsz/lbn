import { spawn } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable } from "node:stream";
import {
  buildRecordingPlaybackObjectKey,
  getRecordingStorageConfig,
  resolveRecordingStoragePath,
  type RecordingStorageConfig,
} from "@/lib/calls/recording-storage";

const require = createRequire(import.meta.url);

type FfmpegInstaller = {
  path: string;
};

function getFfmpegPath() {
  const configured = process.env.CALL_RECORDING_FFMPEG_PATH?.trim();

  if (configured) {
    return configured;
  }

  try {
    const installer = require("@ffmpeg-installer/ffmpeg") as FfmpegInstaller;
    return installer.path;
  } catch {
    return "ffmpeg";
  }
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, {
      windowsHide: true,
    });
    const stderr: Buffer[] = [];

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim();
      reject(
        new Error(
          detail
            ? `录音转码失败：${detail}`
            : `录音转码失败，ffmpeg exit code ${code ?? "unknown"}。`,
        ),
      );
    });
  });
}

async function isFreshReadableFile(targetPath: string, sourceMtimeMs: number) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile() && stat.size > 0 && stat.mtimeMs >= sourceMtimeMs;
  } catch {
    return false;
  }
}

export async function ensureTranscodedRecordingFile(input: {
  recordingId: string;
  storageKey: string;
  config?: RecordingStorageConfig;
}) {
  const config = input.config ?? getRecordingStorageConfig();
  const sourcePath = resolveRecordingStoragePath({
    storageKey: input.storageKey,
    config,
  });
  const sourceStat = await fs.stat(sourcePath);
  const playbackStorageKey = buildRecordingPlaybackObjectKey({
    recordingId: input.recordingId,
    storageKey: input.storageKey,
  });
  const targetPath = resolveRecordingStoragePath({
    storageKey: playbackStorageKey,
    config,
  });

  if (!(await isFreshReadableFile(targetPath, sourceStat.mtimeMs))) {
    const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp.m4a`;

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rm(tmpPath, { force: true });

    try {
      await runFfmpeg([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "aac",
        "-b:a",
        "48k",
        "-movflags",
        "+faststart",
        tmpPath,
      ]);
      await fs.rm(targetPath, { force: true });
      await fs.rename(tmpPath, targetPath);
    } catch (error) {
      await fs.rm(tmpPath, { force: true });
      throw error;
    }
  }

  const playbackStat = await fs.stat(targetPath);

  return {
    absolutePath: targetPath,
    storageKey: playbackStorageKey,
    contentLength: playbackStat.size,
    mimeType: "audio/mp4",
    filename: `call-recording-${input.recordingId}.m4a`,
    transcoded: true,
  };
}

export async function transcodeRecordingForBrowser(input: {
  recordingId: string;
  storageKey: string;
  config?: RecordingStorageConfig;
}) {
  const file = await ensureTranscodedRecordingFile(input);
  const stream = Readable.toWeb(createReadStream(file.absolutePath));

  return {
    stream: stream as ReadableStream<Uint8Array>,
    contentLength: file.contentLength,
    mimeType: file.mimeType,
    filename: file.filename,
    transcoded: file.transcoded,
  };
}

export async function readTranscodedRecordingFileBuffer(input: {
  recordingId: string;
  storageKey: string;
  config?: RecordingStorageConfig;
}) {
  const file = await ensureTranscodedRecordingFile(input);
  const bytes = await fs.readFile(file.absolutePath);

  return {
    bytes,
    filename: file.filename,
    mimeType: file.mimeType,
    storageKey: file.storageKey,
    transcoded: file.transcoded,
  };
}
