import "dotenv/config";
import crypto from "node:crypto";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function writeJsonLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function requireValue(name: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function buildPayload() {
  const now = new Date();
  const rawCdr = getArg("raw-cdr");
  let cdr: unknown = undefined;

  if (rawCdr) {
    try {
      cdr = JSON.parse(rawCdr);
    } catch {
      cdr = rawCdr;
    }
  }

  return {
    eventId: getArg("event-id") ?? `smoke_evt_${Date.now()}`,
    sessionId: getArg("session-id") ?? undefined,
    callRecordId: getArg("call-record-id") ?? undefined,
    providerCallId: getArg("provider-call-id") ?? `smoke_call_${Date.now()}`,
    status: getArg("status") ?? "ANSWERED",
    eventAt: getArg("event-at") ?? now.toISOString(),
    durationSeconds: Number.parseInt(getArg("duration-seconds") ?? "12", 10),
    recordingUrl: getArg("recording-url") ?? undefined,
    recordingPath: getArg("recording-path") ?? undefined,
    recordingStorageKey: getArg("recording-storage-key") ?? undefined,
    recordingExternalId: getArg("recording-external-id") ?? undefined,
    recordingMimeType: getArg("recording-mime-type") ?? undefined,
    recordingCodec: getArg("recording-codec") ?? undefined,
    cdr,
  };
}

async function main() {
  const endpoint = requireValue(
    "--endpoint",
    getArg("endpoint") ?? process.env.OUTBOUND_CALL_WEBHOOK_TEST_ENDPOINT,
  );
  const secret = requireValue(
    "--secret or OUTBOUND_CALL_WEBHOOK_SECRET",
    getArg("secret") ?? process.env.OUTBOUND_CALL_WEBHOOK_SECRET,
  );
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = buildPayload();
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LBN-CTI-Timestamp": timestamp,
      "X-LBN-CTI-Signature": signature,
    },
    body: rawBody,
  });
  const text = await response.text();
  let body: unknown = text;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  writeJsonLine({
    event: response.ok
      ? "outbound_webhook.signature_ok"
      : "outbound_webhook.signature_failed",
    endpoint,
    status: response.status,
    ok: response.ok,
    response: body,
  });

  if (!response.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "outbound_webhook.failed",
      message:
        error instanceof Error ? error.message : "Outbound webhook check failed.",
    }),
  );
  process.exitCode = 1;
});
