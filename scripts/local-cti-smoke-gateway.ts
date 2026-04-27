import http from "node:http";

function parseArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ||
    process.env[`LOCAL_CTI_${name.toUpperCase().replaceAll("-", "_")}`]?.trim() ||
    fallback
  );
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

const host = parseArg("host", "127.0.0.1");
const port = Number.parseInt(parseArg("port", "8790"), 10);
const startPath = parseArg("start-path", "/calls/start");
const initialStatus = parseArg("status", "PROVIDER_ACCEPTED").toUpperCase();

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, {
      ok: true,
      service: "local-cti-smoke-gateway",
      startPath,
    });
    return;
  }

  if (request.method !== "POST" || request.url?.split("?")[0] !== startPath) {
    writeJson(response, 404, {
      error: {
        message: "Use POST on the configured CTI start path.",
      },
      startPath,
    });
    return;
  }

  try {
    const rawBody = await readBody(request);
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const sessionId =
      typeof payload.sessionId === "string" && payload.sessionId.trim()
        ? payload.sessionId.trim()
        : `smoke_${Date.now()}`;

    writeJson(response, 200, {
      providerCallId: `cti_smoke_${sessionId}`,
      providerTraceId: `cti_trace_${sessionId}`,
      status: initialStatus,
      accepted: true,
      echo: {
        sessionId,
        callRecordId: payload.callRecordId,
        seatNo: payload.seatNo,
        codec: payload.codec,
        recordOnServer: payload.recordOnServer,
      },
    });
  } catch (error) {
    writeJson(response, 400, {
      error: {
        message:
          error instanceof Error
            ? error.message
            : "Failed to parse CTI start request.",
      },
    });
  }
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      event: "local_cti_smoke_gateway.started",
      endpoint: `http://${host}:${port}${startPath}`,
      health: `http://${host}:${port}/health`,
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
