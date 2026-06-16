import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
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
  throw new Error("Could not find Chrome, Edge, or Chromium.");
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

async function launchVisibleBrowser() {
  if (await isCdpRunning()) {
    console.log(`CDP already running on 127.0.0.1:${CDP_PORT}`);
    return;
  }

  await mkdir(PROFILE_DIR, { recursive: true });
  const browser = await findBrowser();
  const child = spawn(browser, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    DEFAULT_URL,
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  console.log(`Launched browser: ${browser}`);
  console.log(`Profile: ${PROFILE_DIR}`);
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
}

async function findFlowProjectPage() {
  const targets = await cdpJson("/json/list");
  return targets.find((target) =>
    target.type === "page" && /\/tools\/flow\/project\/[0-9a-f-]{36}/.test(target.url)
  );
}

async function waitForFlowProjectPage() {
  console.log("");
  console.log("Sign in to Google Labs Flow in the opened browser, then open or create a Flow project.");
  console.log("Return to this terminal and press Enter when the Flow project page is open.");

  const rl = createInterface({ input, output });
  try {
    for (;;) {
      await rl.question("");
      try {
        const page = await findFlowProjectPage();
        if (page) return page;
      } catch {}
      console.log("Flow project page not detected yet. Open a URL containing /tools/flow/project/<project-id>, then press Enter again.");
    }
  } finally {
    rl.close();
  }
}

async function runDoctor() {
  const child = spawn(process.execPath, [join(SCRIPT_DIR, "doctor-flow-fx-request.mjs")], {
    stdio: "inherit",
    windowsHide: false,
  });
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code || 0));
  });
}

async function main() {
  console.log("Flow FX Request setup");
  console.log("");
  console.log("This setup will:");
  console.log("1. Launch a dedicated browser profile.");
  console.log("2. Wait for you to sign in and open a Flow project.");
  console.log("3. Save non-secret project config.");
  console.log("4. Run doctor checks.");
  console.log("");

  await launchVisibleBrowser();
  const page = await waitForFlowProjectPage();
  const projectId = page.url.match(/\/project\/([0-9a-f-]{36})/)?.[1];
  if (!projectId) throw new Error(`Could not parse project id from URL: ${page.url}`);

  await writeFlowConfig({
    cdp_port: CDP_PORT,
    chrome_profile: PROFILE_DIR,
    project_id: projectId,
    model_name: "NARWHAL",
  });

  console.log("");
  console.log(`Saved Flow project id: ${projectId}`);
  console.log(`Config file: ${SECRETS_PATH}`);
  console.log("");
  console.log("Running doctor checks:");
  const doctorCode = await runDoctor();

  console.log("");
  if (doctorCode === 0) {
    console.log("Setup complete. Start the API with:");
    console.log("npm run serve");
    console.log("");
    console.log("For future hidden runtime, use:");
    console.log("npm run headless");
  } else {
    console.log("Setup saved config, but doctor did not fully pass. Fix the checks above, then run npm run doctor.");
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
