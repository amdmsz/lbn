const browserPlayableMimeTypes = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/wave",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

export function normalizeRecordingMimeType(mimeType: string) {
  return mimeType.toLowerCase().split(";")[0]?.trim() || "application/octet-stream";
}

export function getRecordingExtensionForMimeType(mimeType: string) {
  const normalized = normalizeRecordingMimeType(mimeType);

  if (normalized === "audio/amr" || normalized === "audio/amr-wb") {
    return "amr";
  }

  if (normalized === "audio/3gpp") {
    return "3gp";
  }

  if (normalized === "audio/3gpp2") {
    return "3g2";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }

  if (normalized.includes("wav")) {
    return "wav";
  }

  if (normalized.includes("ogg")) {
    return "ogg";
  }

  if (normalized.includes("webm")) {
    return "webm";
  }

  if (
    normalized.includes("mp4") ||
    normalized.includes("m4a") ||
    normalized.includes("aac")
  ) {
    return "m4a";
  }

  return normalized.startsWith("audio/") ? "audio" : "bin";
}

export function isBrowserPlayableRecordingMimeType(mimeType: string) {
  return browserPlayableMimeTypes.has(normalizeRecordingMimeType(mimeType));
}

export function shouldTranscodeRecordingForBrowser(mimeType: string) {
  const normalized = normalizeRecordingMimeType(mimeType);
  return (
    normalized.startsWith("audio/") &&
    !isBrowserPlayableRecordingMimeType(normalized)
  );
}

export function getRecordingMimeLabel(mimeType: string) {
  const normalized = normalizeRecordingMimeType(mimeType);

  switch (normalized) {
    case "audio/amr":
      return "AMR";
    case "audio/amr-wb":
      return "AMR-WB";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "M4A";
    case "audio/mpeg":
    case "audio/mp3":
      return "MP3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "WAV";
    case "audio/3gpp":
      return "3GP";
    default:
      return normalized.replace(/^audio\//, "").toUpperCase();
  }
}

export function buildRecordingDownloadFilename(recordingId: string, mimeType: string) {
  const safeRecordingId = recordingId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `call-recording-${safeRecordingId}.${getRecordingExtensionForMimeType(mimeType)}`;
}
