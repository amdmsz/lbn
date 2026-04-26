import http from "node:http";
import { Readable } from "node:stream";

function parseArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ||
    process.env[`LOCAL_ASR_${name.toUpperCase()}`]?.trim() ||
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
  });
  response.end(JSON.stringify(payload));
}

async function parseMultipartRequest(request: http.IncomingMessage) {
  const webRequest = new Request("http://local-asr-smoke/transcribe", {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: Readable.toWeb(request) as ReadableStream<Uint8Array>,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return webRequest.formData();
}

const host = parseArg("host", "127.0.0.1");
const port = Number.parseInt(parseArg("port", "8787"), 10);

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, {
      ok: true,
      service: "local-asr-smoke",
    });
    return;
  }

  if (request.method !== "POST") {
    writeJson(response, 405, {
      error: {
        message: "Only POST is supported.",
      },
    });
    return;
  }

  try {
    const form = await parseMultipartRequest(request);
    const file = form.get("file");
    const model = String(form.get("model") || "local-asr-smoke");
    const storageKey = String(form.get("storageKey") || "");
    const contextRaw = String(form.get("context") || "{}");
    const bytes =
      file instanceof File ? Buffer.byteLength(Buffer.from(await file.arrayBuffer())) : 0;

    writeJson(response, 200, {
      text: `SMOKE_ASR_OK model=${model} fileBytes=${bytes} storageKey=${storageKey}`,
      model,
      bytes,
      storageKey,
      context: JSON.parse(contextRaw),
    });
  } catch (error) {
    writeJson(response, 400, {
      error: {
        message:
          error instanceof Error ? error.message : "Failed to parse ASR request.",
      },
    });
  }
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      event: "local_asr_smoke.started",
      endpoint: `http://${host}:${port}/transcribe`,
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
