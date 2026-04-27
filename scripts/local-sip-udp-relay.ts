import dgram from "node:dgram";

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const bindHost =
  getArg("bind-host") || process.env.SIP_UDP_RELAY_BIND_HOST || "0.0.0.0";
const bindPort = parsePort(
  getArg("bind-port") || process.env.SIP_UDP_RELAY_BIND_PORT,
  5060,
);
const targetHost = getArg("target-host") || process.env.SIP_UDP_RELAY_TARGET_HOST;
const targetPort = parsePort(
  getArg("target-port") || process.env.SIP_UDP_RELAY_TARGET_PORT,
  5060,
);

if (!targetHost) {
  throw new Error(
    "SIP_UDP_RELAY_TARGET_HOST or --target-host is required, for example 172.31.186.171.",
  );
}

type Client = {
  address: string;
  port: number;
  updatedAt: number;
};

let lastClient: Client | null = null;
const socket = dgram.createSocket("udp4");

function firstLine(message: Buffer) {
  return message.toString("utf8", 0, Math.min(message.length, 180)).split(/\r?\n/)[0];
}

function isTarget(rinfo: dgram.RemoteInfo) {
  return rinfo.address === targetHost && rinfo.port === targetPort;
}

socket.on("message", (message, rinfo) => {
  if (isTarget(rinfo)) {
    if (!lastClient) {
      console.log(
        JSON.stringify({
          event: "sip_udp_relay.dropped_target_packet",
          from: `${rinfo.address}:${rinfo.port}`,
          firstLine: firstLine(message),
        }),
      );
      return;
    }

    socket.send(message, lastClient.port, lastClient.address);
    console.log(
      JSON.stringify({
        event: "sip_udp_relay.target_to_client",
        from: `${rinfo.address}:${rinfo.port}`,
        to: `${lastClient.address}:${lastClient.port}`,
        firstLine: firstLine(message),
      }),
    );
    return;
  }

  lastClient = {
    address: rinfo.address,
    port: rinfo.port,
    updatedAt: Date.now(),
  };
  socket.send(message, targetPort, targetHost);
  console.log(
    JSON.stringify({
      event: "sip_udp_relay.client_to_target",
      from: `${rinfo.address}:${rinfo.port}`,
      to: `${targetHost}:${targetPort}`,
      firstLine: firstLine(message),
    }),
  );
});

socket.on("error", (error) => {
  console.error(
    JSON.stringify({
      event: "sip_udp_relay.failed",
      message: error.message,
    }),
  );
  process.exitCode = 1;
});

socket.bind(bindPort, bindHost, () => {
  console.log(
    JSON.stringify({
      event: "sip_udp_relay.started",
      bind: `${bindHost}:${bindPort}`,
      target: `${targetHost}:${targetPort}`,
    }),
  );
});
