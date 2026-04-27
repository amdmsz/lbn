import crypto from "node:crypto";
import http from "node:http";
import net from "node:net";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

if (process.env.CTI_GATEWAY_ENV_FILE?.trim()) {
  dotenv.config({
    path: process.env.CTI_GATEWAY_ENV_FILE.trim(),
    override: true,
    quiet: true,
  });
}

type GatewayMode = "MOCK" | "FREESWITCH_ESL" | "ASTERISK_AMI";

type GatewayConfig = {
  host: string;
  port: number;
  mode: GatewayMode;
  apiToken: string;
  allowNoAuth: boolean;
  defaultRoutingGroup: string | null;
  requestTimeoutMs: number;
  freeswitch: {
    host: string;
    port: number;
    password: string;
    agentEndpointTemplate: string;
    customerEndpointTemplate: string;
  };
  asterisk: {
    host: string;
    port: number;
    username: string;
    password: string;
    agentEndpointTemplate: string;
    context: string;
    customerExtenTemplate: string;
  };
};

const startCallSchema = z.object({
  correlationId: z.string().trim().optional(),
  sessionId: z.string().trim().min(1),
  callRecordId: z.string().trim().min(1),
  customerId: z.string().trim().min(1),
  customerName: z.string().trim().min(1),
  customerPhone: z.string().trim().min(1),
  dialedNumber: z.string().trim().min(1),
  salesId: z.string().trim().min(1),
  seatNo: z.string().trim().min(1),
  extensionNo: z.string().trim().nullable().optional(),
  displayNumber: z.string().trim().nullable().optional(),
  routingGroup: z.string().trim().nullable().optional(),
  codec: z.string().trim().default("PCMA"),
  recordOnServer: z.coerce.boolean().default(true),
  webhookBaseUrl: z.string().trim().nullable().optional(),
});

type StartCallInput = z.infer<typeof startCallSchema>;

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMode(value: string | undefined): GatewayMode {
  const mode = value?.trim().toUpperCase();
  if (mode === "ASTERISK_AMI") {
    return "ASTERISK_AMI";
  }
  return mode === "FREESWITCH_ESL" ? "FREESWITCH_ESL" : "MOCK";
}

function requireProductionSecret(config: GatewayConfig) {
  if (
    process.env.NODE_ENV === "production" &&
    !config.apiToken &&
    !config.allowNoAuth
  ) {
    throw new Error(
      "CTI_GATEWAY_API_TOKEN is required in production unless CTI_GATEWAY_ALLOW_NO_AUTH=1.",
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    config.mode === "FREESWITCH_ESL" &&
    !config.freeswitch.password
  ) {
    throw new Error("CTI_GATEWAY_FREESWITCH_PASSWORD is required.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    config.mode === "ASTERISK_AMI" &&
    (!config.asterisk.username || !config.asterisk.password)
  ) {
    throw new Error(
      "CTI_GATEWAY_ASTERISK_USERNAME and CTI_GATEWAY_ASTERISK_PASSWORD are required.",
    );
  }
}

function getConfig(): GatewayConfig {
  const config: GatewayConfig = {
    host: process.env.CTI_GATEWAY_HOST?.trim() || "127.0.0.1",
    port: parsePositiveInt(process.env.CTI_GATEWAY_PORT, 8790),
    mode: parseMode(process.env.CTI_GATEWAY_MODE),
    apiToken: process.env.CTI_GATEWAY_API_TOKEN?.trim() ?? "",
    allowNoAuth: process.env.CTI_GATEWAY_ALLOW_NO_AUTH === "1",
    defaultRoutingGroup:
      process.env.CTI_GATEWAY_DEFAULT_ROUTING_GROUP?.trim() || null,
    requestTimeoutMs: parsePositiveInt(
      process.env.CTI_GATEWAY_REQUEST_TIMEOUT_MS,
      10_000,
    ),
    freeswitch: {
      host: process.env.CTI_GATEWAY_FREESWITCH_HOST?.trim() || "127.0.0.1",
      port: parsePositiveInt(process.env.CTI_GATEWAY_FREESWITCH_PORT, 8021),
      password: process.env.CTI_GATEWAY_FREESWITCH_PASSWORD?.trim() ?? "",
      agentEndpointTemplate:
        process.env.CTI_GATEWAY_FREESWITCH_AGENT_ENDPOINT_TEMPLATE?.trim() ||
        "user/{seatNo}",
      customerEndpointTemplate:
        process.env.CTI_GATEWAY_FREESWITCH_CUSTOMER_ENDPOINT_TEMPLATE?.trim() ||
        "sofia/gateway/{routingGroup}/{dialedNumber}",
    },
    asterisk: {
      host: process.env.CTI_GATEWAY_ASTERISK_HOST?.trim() || "127.0.0.1",
      port: parsePositiveInt(process.env.CTI_GATEWAY_ASTERISK_PORT, 5038),
      username: process.env.CTI_GATEWAY_ASTERISK_USERNAME?.trim() || "",
      password: process.env.CTI_GATEWAY_ASTERISK_PASSWORD?.trim() || "",
      agentEndpointTemplate:
        process.env.CTI_GATEWAY_ASTERISK_AGENT_ENDPOINT_TEMPLATE?.trim() ||
        "PJSIP/seat-{seatNo}",
      context:
        process.env.CTI_GATEWAY_ASTERISK_CONTEXT?.trim() || "crm-outbound",
      customerExtenTemplate:
        process.env.CTI_GATEWAY_ASTERISK_CUSTOMER_EXTEN_TEMPLATE?.trim() ||
        "{dialedNumber}",
    },
  };

  requireProductionSecret(config);
  return config;
}

function writeJson(
  response: http.ServerResponse,
  status: number,
  payload: Record<string, unknown>,
) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyGatewayAuth(request: http.IncomingMessage, config: GatewayConfig) {
  if (!config.apiToken && config.allowNoAuth) {
    return;
  }

  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!config.apiToken || !timingSafeEqual(token, config.apiToken)) {
    throw new Error("CTI Gateway authorization failed.");
  }
}

function normalizeDialedNumber(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function sanitizeFreeSwitchValue(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/[{},\r\n]/g, "_");
}

function sanitizeEndpointValue(value: string | null | undefined) {
  return sanitizeFreeSwitchValue(value).replace(/[\s"'`]/g, "");
}

function renderTemplate(
  template: string,
  values: Record<string, string | null | undefined>,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    sanitizeEndpointValue(values[key]),
  );
}

function buildOriginateCommand(input: StartCallInput, config: GatewayConfig) {
  const providerCallId = crypto.randomUUID();
  const routingGroup =
    input.routingGroup?.trim() || config.defaultRoutingGroup || "default";
  const dialedNumber = normalizeDialedNumber(input.dialedNumber);
  const displayNumber = input.displayNumber?.trim() || input.seatNo;
  const codec = input.codec.toUpperCase() === "PCMA" ? "PCMA" : input.codec;
  const vars = {
    origination_uuid: providerCallId,
    origination_caller_id_number: displayNumber,
    effective_caller_id_number: displayNumber,
    crm_session_id: input.sessionId,
    crm_call_record_id: input.callRecordId,
    crm_customer_id: input.customerId,
    crm_sales_id: input.salesId,
    crm_seat_no: input.seatNo,
    absolute_codec_string: codec,
  };
  const variableText = Object.entries(vars)
    .map(([key, value]) => `${key}=${sanitizeFreeSwitchValue(value)}`)
    .join(",");
  const templateValues = {
    seatNo: input.seatNo,
    extensionNo: input.extensionNo ?? input.seatNo,
    dialedNumber,
    customerPhone: normalizeDialedNumber(input.customerPhone),
    routingGroup,
    displayNumber,
    codec,
  };
  const agentEndpoint = renderTemplate(
    config.freeswitch.agentEndpointTemplate,
    templateValues,
  );
  const customerEndpoint = renderTemplate(
    config.freeswitch.customerEndpointTemplate,
    templateValues,
  );

  return {
    providerCallId,
    command: `bgapi originate {${variableText}}${agentEndpoint} &bridge(${customerEndpoint})`,
    agentEndpoint,
    customerEndpoint,
  };
}

function readEslFrame(socket: net.Socket, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("FreeSWITCH ESL response timeout."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");

      if (buffer.includes("\n\n") || buffer.includes("\r\n\r\n")) {
        cleanup();
        resolve(buffer);
      }
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("FreeSWITCH ESL socket closed."));
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

function readAmiFrame(
  socket: net.Socket,
  timeoutMs: number,
  options: { allowBannerLine?: boolean } = {},
) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Asterisk AMI response timeout."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");

      if (
        options.allowBannerLine &&
        /^Asterisk Call Manager\//i.test(buffer) &&
        /\r?\n/.test(buffer)
      ) {
        cleanup();
        resolve(buffer);
        return;
      }

      if (buffer.includes("\r\n\r\n") || buffer.includes("\n\n")) {
        cleanup();
        resolve(buffer);
      }
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error("Asterisk AMI socket closed."));
    }

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
  });
}

function connectSocket(config: GatewayConfig) {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({
      host: config.freeswitch.host,
      port: config.freeswitch.port,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("FreeSWITCH ESL connection timeout."));
    }, config.requestTimeoutMs);

    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function getReplyText(frame: string) {
  const match = frame.match(/^Reply-Text:\s*(.+)$/im);
  return match?.[1]?.trim() ?? frame.trim();
}

async function startViaFreeSwitch(input: StartCallInput, config: GatewayConfig) {
  if (!config.freeswitch.password) {
    throw new Error("FreeSWITCH ESL password is not configured.");
  }

  const socket = await connectSocket(config);

  try {
    const authRequest = await readEslFrame(socket, config.requestTimeoutMs);

    if (!/auth\/request/i.test(authRequest)) {
      throw new Error("FreeSWITCH ESL did not request authentication.");
    }

    socket.write(`auth ${config.freeswitch.password}\n\n`);
    const authReply = await readEslFrame(socket, config.requestTimeoutMs);

    if (!/\+OK/i.test(authReply)) {
      throw new Error(`FreeSWITCH ESL auth failed: ${getReplyText(authReply)}`);
    }

    const originate = buildOriginateCommand(input, config);
    socket.write(`${originate.command}\n\n`);
    const commandReply = await readEslFrame(socket, config.requestTimeoutMs);
    const replyText = getReplyText(commandReply);

    if (!/\+OK/i.test(replyText)) {
      throw new Error(`FreeSWITCH originate failed: ${replyText}`);
    }

    return {
      providerCallId: originate.providerCallId,
      providerTraceId:
        replyText.match(/Job-UUID:\s*([0-9a-f-]+)/i)?.[1] ??
        originate.providerCallId,
      status: "PROVIDER_ACCEPTED",
      debug: {
        agentEndpoint: originate.agentEndpoint,
        customerEndpoint: originate.customerEndpoint,
      },
    };
  } finally {
    socket.end();
  }
}

function buildAmiAction(fields: Record<string, string | string[]>) {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      lines.push(`${key}: ${String(item).replace(/[\r\n]/g, " ")}`);
    }
  }

  return `${lines.join("\r\n")}\r\n\r\n`;
}

function parseAmiResponse(frame: string) {
  const entries = new Map<string, string>();

  for (const line of frame.split(/\r?\n/)) {
    const index = line.indexOf(":");

    if (index > 0) {
      entries.set(
        line.slice(0, index).trim().toLowerCase(),
        line.slice(index + 1).trim(),
      );
    }
  }

  return {
    response: entries.get("response") ?? "",
    message: entries.get("message") ?? frame.trim(),
    actionId: entries.get("actionid") ?? "",
  };
}

async function startViaAsterisk(input: StartCallInput, config: GatewayConfig) {
  if (!config.asterisk.username || !config.asterisk.password) {
    throw new Error("Asterisk AMI username/password is not configured.");
  }

  const providerCallId = crypto.randomUUID();
  const routingGroup =
    input.routingGroup?.trim() || config.defaultRoutingGroup || "lbn-provider";
  const dialedNumber = normalizeDialedNumber(input.dialedNumber);
  const displayNumber = input.displayNumber?.trim() || input.seatNo;
  const templateValues = {
    seatNo: input.seatNo,
    extensionNo: input.extensionNo ?? input.seatNo,
    dialedNumber,
    customerPhone: normalizeDialedNumber(input.customerPhone),
    routingGroup,
    displayNumber,
    codec: input.codec,
  };
  const agentEndpoint = renderTemplate(
    config.asterisk.agentEndpointTemplate,
    templateValues,
  );
  const customerExten = renderTemplate(
    config.asterisk.customerExtenTemplate,
    templateValues,
  );
  const socket = await connectSocket({
    ...config,
    freeswitch: {
      ...config.freeswitch,
      host: config.asterisk.host,
      port: config.asterisk.port,
    },
  });

  try {
    const banner = await readAmiFrame(socket, config.requestTimeoutMs, {
      allowBannerLine: true,
    });

    if (!/Asterisk Call Manager/i.test(banner)) {
      throw new Error("Asterisk AMI banner was not received.");
    }

    socket.write(
      buildAmiAction({
        Action: "Login",
        Username: config.asterisk.username,
        Secret: config.asterisk.password,
        Events: "off",
      }),
    );
    const loginReply = parseAmiResponse(
      await readAmiFrame(socket, config.requestTimeoutMs),
    );

    if (!/^success$/i.test(loginReply.response)) {
      throw new Error(`Asterisk AMI auth failed: ${loginReply.message}`);
    }

    socket.write(
      buildAmiAction({
        Action: "Originate",
        ActionID: providerCallId,
        Channel: agentEndpoint,
        Context: config.asterisk.context,
        Exten: customerExten,
        Priority: "1",
        CallerID: `${sanitizeFreeSwitchValue(input.customerName)} <${displayNumber}>`,
        Timeout: "30000",
        Async: "true",
        Variable: [
          `CRM_SESSION_ID=${sanitizeFreeSwitchValue(input.sessionId)}`,
          `CRM_CALL_RECORD_ID=${sanitizeFreeSwitchValue(input.callRecordId)}`,
          `CRM_CUSTOMER_ID=${sanitizeFreeSwitchValue(input.customerId)}`,
          `CRM_SALES_ID=${sanitizeFreeSwitchValue(input.salesId)}`,
          `CRM_SEAT_NO=${sanitizeFreeSwitchValue(input.seatNo)}`,
          `CRM_ROUTING_GROUP=${sanitizeFreeSwitchValue(routingGroup)}`,
        ],
      }),
    );
    const originateReply = parseAmiResponse(
      await readAmiFrame(socket, config.requestTimeoutMs),
    );

    if (!/^success$/i.test(originateReply.response)) {
      throw new Error(`Asterisk originate failed: ${originateReply.message}`);
    }

    socket.write(buildAmiAction({ Action: "Logoff" }));

    return {
      providerCallId,
      providerTraceId: originateReply.actionId || providerCallId,
      status: "PROVIDER_ACCEPTED",
      debug: {
        agentEndpoint,
        customerExten,
        context: config.asterisk.context,
      },
    };
  } finally {
    socket.end();
  }
}

async function startCall(input: StartCallInput, config: GatewayConfig) {
  if (config.mode === "MOCK") {
    return {
      providerCallId: `cti_mock_${input.sessionId}`,
      providerTraceId: `cti_trace_${input.callRecordId}`,
      status: "PROVIDER_ACCEPTED",
      debug: {
        seatNo: input.seatNo,
        codec: input.codec,
      },
    };
  }

  if (config.mode === "FREESWITCH_ESL") {
    return startViaFreeSwitch(input, config);
  }

  return startViaAsterisk(input, config);
}

function getRequestPath(request: http.IncomingMessage) {
  return new URL(request.url ?? "/", "http://cti-gateway.local").pathname;
}

const config = getConfig();

const server = http.createServer(async (request, response) => {
  const path = getRequestPath(request);

  if (request.method === "GET" && path === "/health") {
    writeJson(response, 200, {
      ok: true,
      service: "lbn-cti-gateway",
      mode: config.mode,
      freeswitch:
        config.mode === "FREESWITCH_ESL"
          ? {
              host: config.freeswitch.host,
              port: config.freeswitch.port,
            }
          : null,
      asterisk:
        config.mode === "ASTERISK_AMI"
          ? {
              host: config.asterisk.host,
              port: config.asterisk.port,
            }
          : null,
    });
    return;
  }

  if (request.method !== "POST" || path !== "/calls/start") {
    writeJson(response, 404, {
      error: {
        message: "Use POST /calls/start.",
      },
    });
    return;
  }

  try {
    verifyGatewayAuth(request, config);
    const rawBody = await readBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const input = startCallSchema.parse(body);
    const result = await startCall(input, config);

    writeJson(response, 200, result);
  } catch (error) {
    writeJson(response, 400, {
      error: {
        message:
          error instanceof Error ? error.message : "CTI Gateway request failed.",
      },
      message:
        error instanceof Error ? error.message : "CTI Gateway request failed.",
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      event: "cti_gateway.started",
      mode: config.mode,
      endpoint: `http://${config.host}:${config.port}/calls/start`,
      health: `http://${config.host}:${config.port}/health`,
    }),
  );
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
