import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function xmlEscape(value: string | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderTemplate(template: string) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    xmlEscape(process.env[key]),
  );
}

async function main() {
  const envPath = repoPath(getArg("env") ?? "runtime/cti/local.env");
  const templatePath = repoPath(
    getArg("template") ?? "deploy/freeswitch/lbn-provider-gateway.xml.template",
  );
  const outputPath = repoPath(
    getArg("output") ?? "runtime/cti/freeswitch/lbn-provider-gateway.xml",
  );

  loadEnv(envPath);

  const template = await readFile(templatePath, "utf8");
  const rendered = renderTemplate(template);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, "utf8");

  console.log(
    JSON.stringify({
      event: "freeswitch_gateway_config.rendered",
      outputPath,
      gatewayName: process.env.CTI_SIP_GATEWAY_NAME,
      copyTo:
        "FreeSWITCH conf/sip_profiles/external/<gateway-name>.xml, then run reloadxml and sofia profile external rescan.",
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "freeswitch_gateway_config.failed",
      message:
        error instanceof Error
          ? error.message
          : "Failed to render FreeSWITCH gateway config.",
    }),
  );
  process.exitCode = 1;
});
