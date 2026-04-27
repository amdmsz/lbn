import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function repoPath(...parts: string[]) {
  return path.resolve(process.cwd(), ...parts);
}

function loadEnv(envPath: string) {
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

function textEscape(value: string | undefined) {
  return String(value ?? "").replace(/[\r\n]/g, " ").trim();
}

function configObjectName(value: string | undefined) {
  return textEscape(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function shellQuote(value: string | undefined) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").trim();

  return `'${normalized.replace(/'/g, "'\\''")}'`;
}

function mapCodec(value: string | undefined) {
  const codec = String(value ?? "").trim().toUpperCase();

  if (codec === "PCMA" || codec === "G711A" || codec === "G.711A") {
    return "alaw";
  }

  if (codec === "PCMU" || codec === "G711U" || codec === "G.711U") {
    return "ulaw";
  }

  return codec.toLowerCase() || "alaw";
}

function getBooleanEnv(key: string, fallback = false) {
  const value = process.env[key]?.trim().toLowerCase();

  if (value === "1" || value === "true" || value === "yes") {
    return true;
  }

  if (value === "0" || value === "false" || value === "no") {
    return false;
  }

  return fallback;
}

function getSeatPasswordEnvKey(seatNo: string) {
  return `CTI_ASTERISK_SEAT_${seatNo.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PASSWORD`;
}

function getAsteriskSeatNos() {
  const values = [
    process.env.CTI_ASTERISK_DEFAULT_SEAT_NO,
    ...(process.env.CTI_ASTERISK_SEAT_NOS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  const seen = new Set<string>();

  return values
    .map(configObjectName)
    .filter((seatNo) => {
      if (!seatNo || seen.has(seatNo)) {
        return false;
      }

      seen.add(seatNo);
      return true;
    });
}

function renderAsteriskSeatEndpoints() {
  const seatNos = getAsteriskSeatNos();
  const defaultPassword = textEscape(process.env.CTI_ASTERISK_DEFAULT_SEAT_PASSWORD);
  const webRtcEnabled = getBooleanEnv("CTI_ASTERISK_WEBRTC_ENABLED", false);
  const transport = webRtcEnabled
    ? configObjectName(process.env.CTI_ASTERISK_WEBRTC_TRANSPORT_NAME) ||
      "lbn-crm-ws"
    : "lbn-crm-udp";
  const codecs = webRtcEnabled
    ? textEscape(process.env.CTI_ASTERISK_WEBRTC_CODECS) || "opus,alaw,ulaw"
    : "alaw,ulaw";

  return seatNos
    .map((seatNo) => {
      const password = textEscape(
        process.env[getSeatPasswordEnvKey(seatNo)] || defaultPassword,
      );

      const endpointOptions = webRtcEnabled
        ? `webrtc=yes
use_avpf=yes
media_encryption=dtls
dtls_auto_generate_cert=yes
dtls_verify=fingerprint
dtls_setup=actpass
ice_support=yes
media_use_received_transport=yes`
        : "";

      return `[${seatNo}]
type=endpoint
transport=${transport}
context=from-lbn-seat
disallow=all
allow=${codecs}
auth=${seatNo}
aors=${seatNo}
direct_media=no
rtp_symmetric=yes
force_rport=yes
rewrite_contact=yes
${endpointOptions}

[${seatNo}]
type=auth
auth_type=userpass
username=${seatNo}
password=${password}

[${seatNo}]
type=aor
max_contacts=5
remove_existing=yes
qualify_frequency=30`;
    })
    .join("\n\n");
}

function renderAsteriskWebRtcTransport() {
  if (!getBooleanEnv("CTI_ASTERISK_WEBRTC_ENABLED", false)) {
    return "";
  }

  const transportName =
    configObjectName(process.env.CTI_ASTERISK_WEBRTC_TRANSPORT_NAME) ||
    "lbn-crm-ws";
  const protocol =
    textEscape(process.env.CTI_ASTERISK_WEBRTC_TRANSPORT_PROTOCOL) ||
    (process.env.NODE_ENV === "production" ? "wss" : "ws");
  const bind =
    textEscape(process.env.CTI_ASTERISK_WEBRTC_TRANSPORT_BIND) || "0.0.0.0";

  return `[${transportName}]
type=transport
protocol=${protocol}
bind=${bind}`;
}

function resolveEnv(key: string): string {
  if (key === "CTI_ASTERISK_TRUNK_NAME") {
    return (
      process.env.CTI_ASTERISK_TRUNK_NAME ||
      process.env.CTI_GATEWAY_DEFAULT_ROUTING_GROUP ||
      process.env.CTI_SIP_GATEWAY_NAME ||
      "lbn-provider"
    );
  }

  if (key === "CTI_ASTERISK_CODEC") {
    return mapCodec(process.env.CTI_SIP_CODEC || process.env.OUTBOUND_CALL_CODEC);
  }

  if (key === "CTI_ASTERISK_RECORDING_DIR") {
    return (
      process.env.CTI_ASTERISK_RECORDING_DIR ||
      process.env.CALL_RECORDING_STORAGE_DIR ||
      "/var/spool/asterisk/monitor/lbn-crm"
    );
  }

  if (key === "CTI_ASTERISK_POST_CALL_WEBHOOK_SCRIPT") {
    return (
      process.env.CTI_ASTERISK_POST_CALL_WEBHOOK_SCRIPT ||
      "/usr/local/bin/lbn-crm-post-call-webhook.sh"
    );
  }

  if (key === "CTI_POST_CALL_WEBHOOK_URL") {
    return (
      process.env.CTI_POST_CALL_WEBHOOK_URL ||
      process.env.OUTBOUND_CALL_WEBHOOK_BASE_URL ||
      ""
    );
  }

  if (key === "CTI_POST_CALL_WEBHOOK_LOG_FILE") {
    return (
      process.env.CTI_POST_CALL_WEBHOOK_LOG_FILE ||
      "/var/log/asterisk/lbn-crm-post-call-webhook.log"
    );
  }

  if (key === "SHELL_CTI_POST_CALL_WEBHOOK_URL") {
    return shellQuote(resolveEnv("CTI_POST_CALL_WEBHOOK_URL"));
  }

  if (key === "SHELL_OUTBOUND_CALL_WEBHOOK_SECRET") {
    return shellQuote(process.env.OUTBOUND_CALL_WEBHOOK_SECRET);
  }

  if (key === "SHELL_CTI_POST_CALL_WEBHOOK_LOG_FILE") {
    return shellQuote(resolveEnv("CTI_POST_CALL_WEBHOOK_LOG_FILE"));
  }

  if (key === "CTI_ASTERISK_TRUNK_QUALIFY_FREQUENCY") {
    return process.env.CTI_ASTERISK_TRUNK_QUALIFY_FREQUENCY || "0";
  }

  if (key === "CTI_ASTERISK_SEAT_ENDPOINTS") {
    return renderAsteriskSeatEndpoints();
  }

  if (key === "CTI_ASTERISK_WEBRTC_TRANSPORT") {
    return renderAsteriskWebRtcTransport();
  }

  if (key === "CTI_ASTERISK_HTTP_ENABLED") {
    return process.env.CTI_ASTERISK_HTTP_ENABLED || "yes";
  }

  if (key === "CTI_ASTERISK_HTTP_BIND_ADDR") {
    return process.env.CTI_ASTERISK_HTTP_BIND_ADDR || "0.0.0.0";
  }

  if (key === "CTI_ASTERISK_HTTP_BIND_PORT") {
    return process.env.CTI_ASTERISK_HTTP_BIND_PORT || "8088";
  }

  if (key === "CTI_ASTERISK_HTTP_TLS_ENABLED") {
    return process.env.CTI_ASTERISK_HTTP_TLS_ENABLED || "no";
  }

  if (key === "CTI_ASTERISK_HTTP_TLS_BIND_ADDR") {
    return process.env.CTI_ASTERISK_HTTP_TLS_BIND_ADDR || "0.0.0.0:8089";
  }

  if (key === "CTI_ASTERISK_HTTP_TLS_CERT_FILE") {
    return process.env.CTI_ASTERISK_HTTP_TLS_CERT_FILE || "";
  }

  if (key === "CTI_ASTERISK_HTTP_TLS_PRIVATE_KEY") {
    return process.env.CTI_ASTERISK_HTTP_TLS_PRIVATE_KEY || "";
  }

  return process.env[key] ?? "";
}

function renderTemplate(template: string) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = resolveEnv(key);
    return key === "CTI_ASTERISK_SEAT_ENDPOINTS" ? value : textEscape(value);
  });
}

async function renderOne(templatePath: string, outputPath: string) {
  const template = await readFile(templatePath, "utf8");
  const rendered = renderTemplate(template);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, "utf8");

  if (outputPath.endsWith(".sh")) {
    await chmod(outputPath, 0o700);
  }

  return outputPath;
}

async function main() {
  const envPath = repoPath(getArg("env") ?? "runtime/cti/local.env");
  const outputDir = repoPath(getArg("output-dir") ?? "runtime/cti/asterisk");

  loadEnv(envPath);

  const files = await Promise.all([
    renderOne(
      repoPath("deploy/asterisk/manager_lbn_crm.conf.template"),
      path.join(outputDir, "manager_lbn_crm.conf"),
    ),
    renderOne(
      repoPath("deploy/asterisk/pjsip_lbn_crm.conf.template"),
      path.join(outputDir, "pjsip_lbn_crm.conf"),
    ),
    renderOne(
      repoPath("deploy/asterisk/http_lbn_crm.conf.template"),
      path.join(outputDir, "http_lbn_crm.conf"),
    ),
    renderOne(
      repoPath("deploy/asterisk/extensions_lbn_crm.conf.template"),
      path.join(outputDir, "extensions_lbn_crm.conf"),
    ),
    renderOne(
      repoPath("deploy/asterisk/lbn-crm-post-call-webhook.sh.template"),
      path.join(outputDir, "lbn-crm-post-call-webhook.sh"),
    ),
  ]);

  console.log(
    JSON.stringify({
      event: "asterisk_config.rendered",
      outputDir,
      files,
      trunkName:
        process.env.CTI_ASTERISK_TRUNK_NAME ||
        process.env.CTI_GATEWAY_DEFAULT_ROUTING_GROUP,
      defaultSeatNo: process.env.CTI_ASTERISK_DEFAULT_SEAT_NO,
      copyTo:
        "Copy *.conf to /etc/asterisk, install lbn-crm-post-call-webhook.sh to CTI_ASTERISK_POST_CALL_WEBHOOK_SCRIPT, then reload asterisk.",
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "asterisk_config.failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to render Asterisk config.",
    }),
  );
  process.exitCode = 1;
});
