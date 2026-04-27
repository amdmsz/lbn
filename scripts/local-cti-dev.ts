import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
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

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npmRunInvocation(script: string) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", npmCommand(), "run", script],
    };
  }

  return {
    command: npmCommand(),
    args: ["run", script],
  };
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

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CTI_GATEWAY_ENV_FILE: envPath,
  };

  return childEnv;
}

function spawnNpmScript(
  script: string,
  env: NodeJS.ProcessEnv,
  label: string,
): ChildProcess {
  const invocation = npmRunInvocation(script);
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    console.log(
      JSON.stringify({
        event: "cti_local_dev.child_exit",
        label,
        code,
        signal,
      }),
    );
  });

  return child;
}

function stop(children: ChildProcess[]) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

async function main() {
  const envPath = repoPath(getArg("env") ?? "runtime/cti/local.env");
  const gatewayOnly = getFlag("gateway-only");
  const webOnly = getFlag("web-only");
  const env = loadEnv(envPath);
  const children: ChildProcess[] = [];

  if (!webOnly) {
    children.push(spawnNpmScript("cti-gateway", env, "cti"));
  }

  if (!gatewayOnly) {
    children.push(spawnNpmScript("dev", env, "web"));
  }

  console.log(
    JSON.stringify({
      event: "cti_local_dev.started",
      envPath,
      web: !gatewayOnly,
      gateway: !webOnly,
      gatewayEndpoint: `${env.OUTBOUND_CALL_GATEWAY_BASE_URL ?? "http://127.0.0.1:8790"}${env.OUTBOUND_CALL_START_PATH ?? "/calls/start"}`,
      webUrl: "http://127.0.0.1:3000",
    }),
  );

  process.on("SIGINT", () => {
    stop(children);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop(children);
    process.exit(0);
  });
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "cti_local_dev.failed",
      message:
        error instanceof Error ? error.message : "Failed to start local CTI dev.",
    }),
  );
  process.exitCode = 1;
});
