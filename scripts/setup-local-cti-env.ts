import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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

async function main() {
  const targetPath = repoPath(getArg("env") ?? "runtime/cti/local.env");
  const templatePath = repoPath(
    getArg("template") ?? "deploy/cti/local-cti.env.example",
  );
  const force = getFlag("force");

  if (existsSync(targetPath) && !force) {
    console.log(
      JSON.stringify({
        event: "cti_local_env.exists",
        path: targetPath,
        message: "Use --force to overwrite.",
      }),
    );
    return;
  }

  const template = await readFile(templatePath, "utf8");
  const secret = crypto.randomBytes(24).toString("hex");
  const content = template.replaceAll("__LOCAL_CTI_SECRET__", secret);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, "utf8");

  console.log(
    JSON.stringify({
      event: "cti_local_env.created",
      path: targetPath,
      next: [
        "npm run cti:dev:local",
        "npm run cti:check:local",
        "Fill CTI_SIP_USERNAME / CTI_SIP_PASSWORD before switching CTI_GATEWAY_MODE=FREESWITCH_ESL.",
      ],
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "cti_local_env.failed",
      message:
        error instanceof Error ? error.message : "Failed to create local CTI env.",
    }),
  );
  process.exitCode = 1;
});
