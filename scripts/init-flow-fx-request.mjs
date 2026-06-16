import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CDP_PORT = Number(process.env.FLOW_CDP_PORT || 9223);
const SECRETS_PATH = join(homedir(), ".codex", "secrets", "api-secrets.json");
const DEFAULT_URL = "https://labs.google/fx/zh/tools/flow";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function defaultProfileDir() {
  if (process.env.FLOW_CHROME_PROFILE) return process.env.FLOW_CHROME_PROFILE;
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "CodexFlowSnifferProfile");
  }
  return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "CodexFlowSnifferProfile");
}

const PROFILE_DIR = defaultProfileDir();

const args = new Set(process.argv.slice(2));
const HEADLESS = args.has("--headless");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findBrowser() {
  const candidates = process.platform === "darwin"
    ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        join(homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        join(homedir(), "Applications", "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"),
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ]
    : [
        join(process.env.LOCALAPPDATA || "", "ms-playwright", "chromium-1223", "chrome-win64", "chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ];
  for (const candidate of candidates) {
    if (candidate && await exists(candidate)) return candidate;
  }
  throw new Error("Could not find Chrome, Edge, or Playwright Chromium.");
}

async function cdpJson(path) {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}${path}`);
  if (!response.ok) throw new Error(`CDP ${path} failed: ${response.status}`);
  return response.json();
}

async function isCdpRunning() {
  try {
    await cdpJson("/json/version");
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser() {
  if (await isCdpRunning()) {
    console.log(`CDP already running on 127.0.0.1:${CDP_PORT}`);
    return;
  }

  await mkdir(PROFILE_DIR, { recursive: true });
  const browser = await findBrowser();
  const urlArgIndex = process.argv.indexOf("--url");
  let url = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : "";
  if (!url && HEADLESS) {
    const store = await readSecrets();
    const projectId = store.flow_fx?.accounts?.default?.project_id;
    url = projectId
      ? `https://labs.google/fx/zh/tools/flow/project/${projectId}`
      : DEFAULT_URL;
  }
  if (!url) url = DEFAULT_URL;

  const browserArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
  ];
  if (HEADLESS) {
    browserArgs.push("--headless=new", "--disable-gpu");
  }
  browserArgs.push(url);

  const child = spawn(browser, browserArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: HEADLESS,
  });
  child.unref();
  console.log(`Launched ${HEADLESS ? "headless " : ""}browser: ${browser}`);
  console.log(`Profile: ${PROFILE_DIR}`);
  if (!HEADLESS) {
    console.log(`Open Flow and sign in, then open or create a Flow project.`);
  }
}

async function readSecrets() {
  try {
    return JSON.parse(await readFile(SECRETS_PATH, "utf8"));
  } catch {
    return {};
  }
}

function setNested(object, dottedKey, value) {
  const parts = dottedKey.split(".");
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = String(value);
}

async function writeFlowConfig(config) {
  const store = await readSecrets();
  if (!store.flow_fx || typeof store.flow_fx !== "object") store.flow_fx = {};
  for (const [key, value] of Object.entries(config)) {
    setNested(store.flow_fx, `accounts.default.${key}`, value);
  }
  await mkdir(join(homedir(), ".codex", "secrets"), { recursive: true });
  await writeFile(SECRETS_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  console.log(`Updated non-secret Flow config in ${SECRETS_PATH}`);
}

async function configureCurrentProject() {
  const targets = await cdpJson("/json/list");
  const page = targets.find((target) =>
    target.type === "page" && /\/tools\/flow\/project\/[0-9a-f-]{36}/.test(target.url)
  );
  if (!page) {
    throw new Error("No Flow project page found. Open a Flow project in the CDP browser first.");
  }
  const projectId = page.url.match(/\/project\/([0-9a-f-]{36})/)?.[1];
  if (!projectId) throw new Error(`Could not parse project id from ${page.url}`);
  await writeFlowConfig({
    cdp_port: CDP_PORT,
    chrome_profile: PROFILE_DIR,
    project_id: projectId,
    model_name: "NARWHAL",
  });
  console.log(`Configured Flow project id: ${projectId}`);
}

async function main() {
  if (args.has("--configure-current")) {
    await configureCurrentProject();
    return;
  }

  await launchBrowser();
  console.log("");
  if (HEADLESS) {
    console.log("Headless CDP browser is ready. Start the local API if needed:");
    console.log(`node "${join(SCRIPT_DIR, "flow-request-api.mjs")}" --serve`);
  } else {
    console.log("After login and project open, run:");
    console.log(`node "${join(SCRIPT_DIR, "init-flow-fx-request.mjs")}" --configure-current`);
    console.log("");
    console.log("For future runs without a visible browser, close this visible browser and run:");
    console.log(`node "${join(SCRIPT_DIR, "init-flow-fx-request.mjs")}" --headless`);
    console.log("");
    console.log("Then start the local API:");
    console.log(`node "${join(SCRIPT_DIR, "flow-request-api.mjs")}" --serve`);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
