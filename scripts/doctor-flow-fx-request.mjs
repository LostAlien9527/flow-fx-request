import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_SECRET_PATH = join(homedir(), ".codex", "secrets", "api-secrets.json");

async function readFlowConfig() {
  try {
    const json = JSON.parse(await readFile(process.env.CODEX_API_SECRETS || DEFAULT_SECRET_PATH, "utf8"));
    return json.flow_fx?.accounts?.default || {};
  } catch {
    return {};
  }
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function checkLocalApi(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/generate-image`);
    return response.status === 404 ? "running" : `unexpected_status_${response.status}`;
  } catch {
    return "not_running";
  }
}

function result(name, ok, detail, hint) {
  return { name, ok, detail, hint };
}

async function main() {
  const config = await readFlowConfig();
  const cdpPort = Number(process.env.FLOW_CDP_PORT || config.cdp_port || 9223);
  const apiPort = Number(process.env.FLOW_API_PORT || 8787);
  const checks = [];

  checks.push(result(
    "config.project_id",
    Boolean(config.project_id),
    config.project_id ? "configured" : "missing",
    "Run init-flow-fx-request.mjs, sign in, open a Flow project, then run --configure-current.",
  ));

  let targets = [];
  try {
    await getJson(`http://127.0.0.1:${cdpPort}/json/version`);
    checks.push(result("cdp", true, `running on 127.0.0.1:${cdpPort}`));
    targets = await getJson(`http://127.0.0.1:${cdpPort}/json/list`);
  } catch (error) {
    checks.push(result(
      "cdp",
      false,
      error.message,
      "Run init-flow-fx-request.mjs or init-flow-fx-request.mjs --headless.",
    ));
  }

  const flowPage = targets.find((target) =>
    target.type === "page" && target.url.includes("/tools/flow/project/")
  );
  checks.push(result(
    "flow_page",
    Boolean(flowPage),
    flowPage ? flowPage.url.replace(/\/project\/[0-9a-f-]{36}/, "/project/[project-id]") : "not_found",
    "Open a Flow project in the dedicated CDP browser.",
  ));

  const projectMatches = Boolean(
    flowPage && config.project_id && flowPage.url.includes(`/project/${config.project_id}`),
  );
  checks.push(result(
    "project_match",
    projectMatches,
    projectMatches ? "current Flow page matches configured project_id" : "missing_or_mismatch",
    "Run init-flow-fx-request.mjs --configure-current on the intended Flow project.",
  ));

  const hasRecaptchaFrame = targets.some((target) => target.url.includes("google.com/recaptcha/enterprise/"));
  checks.push(result(
    "recaptcha_runtime",
    hasRecaptchaFrame,
    hasRecaptchaFrame ? "recaptcha iframe present" : "not_seen",
    "Reload the Flow project page after login; if Google challenges, use visible mode.",
  ));

  const apiStatus = await checkLocalApi(apiPort);
  checks.push(result(
    "local_api",
    apiStatus === "running",
    `${apiStatus} on 127.0.0.1:${apiPort}`,
    "Run flow-request-api.mjs --serve.",
  ));

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
