import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function getFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), ...parts);
}

function loadEnv(envPath: string) {
  dotenv.config({ path: repoPath(".env"), quiet: true });

  if (!existsSync(envPath)) {
    throw new Error(
      `Local CTI env not found: ${envPath}. Run npm run cti:setup:local first.`,
    );
  }

  const parsed = dotenv.config({ path: envPath, override: true, quiet: true });

  if (parsed.error) {
    throw parsed.error;
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is missing.`);
  }

  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function booleanEnv(name: string, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(value ?? "")) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value ?? "")) {
    return false;
  }

  return fallback;
}

function uniqueList(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function getWebRtcDiagnostics() {
  const crmEnabled = booleanEnv("OUTBOUND_CALL_WEBRTC_ENABLED");
  const asteriskEnabled = booleanEnv("CTI_ASTERISK_WEBRTC_ENABLED");
  const webSocketUrl = optionalEnv("OUTBOUND_CALL_WEBRTC_WS_URL");
  const sipDomain = optionalEnv("OUTBOUND_CALL_WEBRTC_SIP_DOMAIN");
  const transportProtocol = optionalEnv("CTI_ASTERISK_WEBRTC_TRANSPORT_PROTOCOL");
  const httpEnabled = booleanEnv("CTI_ASTERISK_HTTP_ENABLED", true);
  const seatNos = uniqueList([
    optionalEnv("CTI_ASTERISK_DEFAULT_SEAT_NO"),
    ...(process.env.CTI_ASTERISK_SEAT_NOS ?? "")
      .split(",")
      .map((item) => item.trim()),
  ]);
  const warnings: string[] = [];

  if (!crmEnabled) {
    warnings.push("OUTBOUND_CALL_WEBRTC_ENABLED is not enabled.");
  }

  if (!asteriskEnabled) {
    warnings.push("CTI_ASTERISK_WEBRTC_ENABLED is not enabled.");
  }

  if (!webSocketUrl) {
    warnings.push("OUTBOUND_CALL_WEBRTC_WS_URL is missing.");
  }

  if (!sipDomain) {
    warnings.push("OUTBOUND_CALL_WEBRTC_SIP_DOMAIN is missing.");
  }

  if (!httpEnabled) {
    warnings.push("CTI_ASTERISK_HTTP_ENABLED is disabled.");
  }

  if (seatNos.length === 0) {
    warnings.push("No Asterisk seat numbers are configured.");
  }

  return {
    ready: warnings.length === 0,
    crmEnabled,
    asteriskEnabled,
    webSocketUrl,
    sipDomain,
    transportProtocol,
    seatNos,
    warnings,
  };
}

function getGatewayEndpoint() {
  const baseUrl = requireEnv("OUTBOUND_CALL_GATEWAY_BASE_URL");
  const startPath = process.env.OUTBOUND_CALL_START_PATH?.trim() || "/calls/start";
  return new URL(startPath, baseUrl).toString();
}

function getNextMessage(webRtc: ReturnType<typeof getWebRtcDiagnostics>) {
  const mode = process.env.CTI_GATEWAY_MODE;

  if (mode === "FREESWITCH_ESL") {
    return "FreeSWITCH ESL passed. Use CRM customer detail to start a real call.";
  }

  if (mode === "ASTERISK_AMI") {
    if (!webRtc.ready) {
      return "Asterisk AMI passed, but WebRTC seat config is incomplete. Fix webRtc.warnings before browser seat registration.";
    }

    return "Asterisk AMI passed. Register a softphone with the seat number before making a real call.";
  }

  return "MOCK passed. Fill PBX/SIP values, switch CTI_GATEWAY_MODE, then recheck.";
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = text;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function main() {
  const envPath = repoPath(getArg("env") ?? "runtime/cti/local.env");
  loadEnv(envPath);

  const webRtc = getWebRtcDiagnostics();

  if (getFlag("webrtc-only")) {
    console.log(
      JSON.stringify({
        event: webRtc.ready
          ? "cti_local_webrtc.ok"
          : "cti_local_webrtc.failed",
        envPath,
        webRtc,
      }),
    );

    if (!webRtc.ready) {
      process.exitCode = 1;
    }

    return;
  }

  const endpoint = getGatewayEndpoint();
  const healthUrl = new URL("/health", process.env.OUTBOUND_CALL_GATEWAY_BASE_URL);
  const token = requireEnv("CTI_GATEWAY_API_TOKEN");
  const health = await fetchJson(healthUrl.toString());

  if (!health.ok) {
    throw new Error(`CTI Gateway health check failed: ${health.status}`);
  }

  const start = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId: `local_check_${Date.now()}`,
      callRecordId: `local_check_call_${Date.now()}`,
      customerId: "local_customer",
      customerName: "本地 CTI 联调客户",
      customerPhone: getArg("phone") ?? "13800000000",
      dialedNumber: getArg("phone") ?? "13800000000",
      salesId: "local_sales",
      seatNo: getArg("seat-no") ?? "6001",
      codec: process.env.OUTBOUND_CALL_CODEC || "PCMA",
      recordOnServer: true,
      routingGroup: process.env.OUTBOUND_CALL_DEFAULT_ROUTING_GROUP || null,
      webhookBaseUrl: process.env.OUTBOUND_CALL_WEBHOOK_BASE_URL || null,
    }),
  });

  if (!start.ok) {
    throw new Error(`CTI Gateway start check failed: ${start.status}`);
  }

  console.log(
    JSON.stringify({
      event: "cti_local_env.ok",
      envPath,
      mode: process.env.CTI_GATEWAY_MODE || "MOCK",
      endpoint,
      health: health.body,
      start: start.body,
      webRtc,
      next: getNextMessage(webRtc),
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "cti_local_env.failed",
      message:
        error instanceof Error ? error.message : "Local CTI check failed.",
    }),
  );
  process.exitCode = 1;
});
