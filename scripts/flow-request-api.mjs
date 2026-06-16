import { createServer } from "node:http";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";

const BASE_URL = "https://aisandbox-pa.googleapis.com";
const RECAPTCHA_SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";
const DEFAULT_SECRET_PATH = join(homedir(), ".codex", "secrets", "api-secrets.json");
const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
let cachedAuthorization;
let cachedAuthorizationExpiresAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readFlowConfig() {
  try {
    const json = JSON.parse(await readFile(process.env.CODEX_API_SECRETS || DEFAULT_SECRET_PATH, "utf8"));
    return json.flow_fx?.accounts?.default || {};
  } catch {
    return {};
  }
}

async function getFlowTarget(cdpPort) {
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
  const target = targets.find(
    (item) => item.type === "page" && item.url.includes("/tools/flow/project/"),
  );
  if (!target) throw new Error(`No logged-in Flow page found on CDP port ${cdpPort}`);
  return target;
}

async function withCdpPage(cdpPort, callback) {
  const target = await getFlowTarget(cdpPort);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const events = new EventTarget();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method) {
      events.dispatchEvent(new MessageEvent(message.method, { data: message.params }));
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  try {
    return await callback({ send, events, target });
  } finally {
    ws.close();
  }
}

async function getAuthorization(cdpPort) {
  if (cachedAuthorization && Date.now() < cachedAuthorizationExpiresAt) {
    return cachedAuthorization;
  }

  return withCdpPage(cdpPort, async ({ send, events }) => {
    await send("Network.enable", { maxPostDataSize: 64 * 1024 });

    const authPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for Flow Authorization header")), 20000);
      events.addEventListener("Network.requestWillBeSent", (event) => {
        const request = event.data.request;
        const auth = request.headers.Authorization || request.headers.authorization;
        if (request.url.includes("aisandbox-pa.googleapis.com") && auth) {
          clearTimeout(timeout);
          cachedAuthorization = auth;
          cachedAuthorizationExpiresAt = Date.now() + Number(process.env.FLOW_AUTH_CACHE_MS || 120000);
          resolve(auth);
        }
      });
    });

    await send("Runtime.evaluate", {
      expression: "location.reload()",
      returnByValue: true,
    });

    return authPromise;
  });
}

async function getRecaptchaToken(cdpPort) {
  return withCdpPage(cdpPort, async ({ send }) => {
    await send("Runtime.enable");
    const result = await send("Runtime.evaluate", {
      expression: `new Promise((resolve, reject) => {
        const run = () => globalThis.grecaptcha.enterprise
          .execute(${JSON.stringify(RECAPTCHA_SITE_KEY)}, { action: "IMAGE_GENERATION" })
          .then(resolve, reject);
        if (globalThis.grecaptcha?.enterprise?.ready) {
          globalThis.grecaptcha.enterprise.ready(run);
        } else {
          reject(new Error("grecaptcha.enterprise is not ready"));
        }
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    const token = result.result?.result?.value;
    if (!token) throw new Error(result.result?.exceptionDetails?.text || "Failed to get reCAPTCHA token");
    return token;
  });
}

function aspectRatioToFlow(value = "16:9") {
  const map = {
    "16:9": "IMAGE_ASPECT_RATIO_LANDSCAPE",
    "4:3": "IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE",
    "1:1": "IMAGE_ASPECT_RATIO_SQUARE",
    "3:4": "IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR",
    "9:16": "IMAGE_ASPECT_RATIO_PORTRAIT",
  };
  return map[value] || value;
}

function normalizeReferenceMediaIds(options) {
  const raw = options.referenceMediaIds || options.references || options.imageInputs || [];
  const ids = Array.isArray(raw) ? raw : [raw];
  return ids
    .map((item) => {
      if (!item) return undefined;
      if (typeof item === "string") return item.replace(/^fe_id_/, "");
      return item.mediaId || item.name || item.imageId;
    })
    .filter(Boolean);
}

const toArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

function allowedUploadRoots(options) {
  const raw = process.env.FLOW_ALLOWED_UPLOAD_DIRS
    || options.allowedUploadDirs
    || options.allowedUploadDir
    || process.cwd();
  return toArray(raw)
    .flatMap((item) => String(item).split(";"))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolve(item));
}

async function assertUploadAllowed(options, filePath) {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`Reference image is not a file: ${filePath}`);

  const maxBytes = Number(process.env.FLOW_MAX_UPLOAD_BYTES || options.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES);
  if (fileStat.size > maxBytes) {
    throw new Error(`Reference image is too large: ${fileStat.size} bytes exceeds ${maxBytes}`);
  }

  const extension = extname(filePath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported reference image extension: ${extension || "(none)"}`);
  }

  const resolvedFile = await realpath(filePath);
  const roots = await Promise.all(allowedUploadRoots(options).map(async (root) => {
    try {
      return await realpath(root);
    } catch {
      return resolve(root);
    }
  }));
  const allowed = roots.some((root) => {
    const comparableRoot = process.platform === "win32" ? root.toLowerCase() : root;
    const comparableFile = process.platform === "win32" ? resolvedFile.toLowerCase() : resolvedFile;
    const prefix = comparableRoot.endsWith(sep) ? comparableRoot : `${comparableRoot}${sep}`;
    return comparableFile === comparableRoot || comparableFile.startsWith(prefix);
  });
  if (!allowed) {
    throw new Error(`Reference image is outside allowed upload dirs. Set FLOW_ALLOWED_UPLOAD_DIRS to allow it: ${filePath}`);
  }
}

async function uploadImageFetch(options, filePath, label) {
  const { projectId, cdpPort } = options;
  await assertUploadAllowed(options, filePath);
  const authorization = await getAuthorization(cdpPort);
  const bytes = await readFile(filePath);
  const body = {
    clientContext: {
      projectId,
      tool: "PINHOLE",
    },
    imageBytes: Buffer.from(bytes).toString("base64"),
  };

  let response = await fetch(`${BASE_URL}/v1/flow/uploadImage`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Referer: "https://labs.google/",
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    cachedAuthorization = undefined;
    cachedAuthorizationExpiresAt = 0;
    const refreshedAuthorization = await getAuthorization(cdpPort);
    response = await fetch(`${BASE_URL}/v1/flow/uploadImage`, {
      method: "POST",
      headers: {
        Authorization: refreshedAuthorization,
        Referer: "https://labs.google/",
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Flow upload failed ${response.status}: ${text.slice(0, 1000)}`);
  }

  const result = JSON.parse(text);
  const mediaId = result.media?.name || result.mediaId || result.name;
  if (!mediaId) throw new Error("Flow upload response did not include media id");

  return {
    label,
    file: filePath,
    mediaId,
    workflowId: result.workflow?.name || result.workflowId,
    width: result.media?.width,
    height: result.media?.height,
  };
}

async function resolveReferenceInputs(options) {
  const attachments = [];

  const addMediaId = (mediaId, label) => {
    if (!mediaId) return;
    attachments.push({ label, mediaId: String(mediaId).replace(/^fe_id_/, "") });
  };

  const addReferenceItem = async (item, label) => {
    if (!item) return;
    if (typeof item === "string") {
      addMediaId(item, label);
      return;
    }
    const filePath = item.path || item.file;
    if (filePath) {
      attachments.push(await uploadImageFetch(options, filePath, item.label || label));
      return;
    }
    addMediaId(item.mediaId || item.name || item.imageId, item.label || label);
  };

  for (const [index, mediaId] of toArray(options.referenceMediaIds).entries()) {
    addMediaId(mediaId, `referenceMediaIds[${index}]`);
  }

  for (const [index, filePath] of toArray(options.referenceImagePaths).entries()) {
    attachments.push(await uploadImageFetch(options, filePath, `referenceImagePaths[${index}]`));
  }

  for (const [index, item] of toArray(options.references).entries()) {
    await addReferenceItem(item, `references[${index}]`);
  }

  for (const [index, item] of toArray(options.imageInputs).entries()) {
    await addReferenceItem(item, `imageInputs[${index}]`);
  }

  return {
    attachments,
    referenceMediaIds: attachments.map((item) => item.mediaId),
  };
}

function buildRequestBody(options) {
  const { prompt, projectId, sessionId, recaptchaToken, aspectRatio, modelName, seed } = options;
  const clientContext = {
    recaptchaContext: {
      token: recaptchaToken,
      applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB",
    },
    projectId,
    tool: "PINHOLE",
    sessionId,
  };
  const imageInputs = normalizeReferenceMediaIds(options).map((mediaId) => ({
    imageInputType: "IMAGE_INPUT_TYPE_REFERENCE",
    name: mediaId,
  }));

  return {
    clientContext,
    mediaGenerationContext: { batchId: randomUUID() },
    useNewMedia: true,
    requests: [
      {
        clientContext,
        imageModelName: modelName,
        imageAspectRatio: aspectRatioToFlow(aspectRatio),
        structuredPrompt: { parts: [{ text: prompt }] },
        seed,
        imageInputs,
      },
    ],
  };
}

async function generateOneImage(options) {
  const { prompt, projectId, sessionId, cdpPort, aspectRatio, modelName } = options;
  let authorization = await getAuthorization(cdpPort);
  const recaptchaToken = await getRecaptchaToken(cdpPort);

  const seed = Math.floor(Math.random() * 1_000_000);
  const body = buildRequestBody({
    ...options,
    prompt,
    projectId,
    sessionId,
    recaptchaToken,
    aspectRatio,
    modelName,
    seed,
  });

  let response = await fetch(`${BASE_URL}/v1/projects/${projectId}/flowMedia:batchGenerateImages`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      Referer: "https://labs.google/",
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    cachedAuthorization = undefined;
    cachedAuthorizationExpiresAt = 0;
    authorization = await getAuthorization(cdpPort);
    response = await fetch(`${BASE_URL}/v1/projects/${projectId}/flowMedia:batchGenerateImages`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        Referer: "https://labs.google/",
        "Content-Type": "text/plain;charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      },
      body: JSON.stringify(body),
    });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Flow generate failed ${response.status}: ${text.slice(0, 1000)}`);
  }
  return JSON.parse(text);
}

async function downloadImage(url, outDir, mediaId) {
  await mkdir(outDir, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image download failed ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const file = join(outDir, `${mediaId}.png`);
  await writeFile(file, bytes);
  return file;
}

async function generateImages(options) {
  const count = Math.max(1, Math.min(Number(options.count || 1), 4));
  const references = await resolveReferenceInputs(options);
  const generationOptions = {
    ...options,
    referenceMediaIds: references.referenceMediaIds,
    references: undefined,
    imageInputs: undefined,
    referenceImagePaths: undefined,
  };
  const outputs = [];
  for (let index = 0; index < count; index += 1) {
    const result = await generateOneImage(generationOptions);
    const generated = result.media?.[0]?.image?.generatedImage;
    if (!generated?.fifeUrl) throw new Error("Flow response did not include fifeUrl");
    const file = options.outDir
      ? await downloadImage(generated.fifeUrl, options.outDir, generated.mediaId)
      : undefined;
    outputs.push({
      mediaId: generated.mediaId,
      workflowId: generated.workflowId,
      seed: generated.seed,
      prompt: generated.prompt,
      fifeUrl: generated.fifeUrl,
      file,
    });
    await sleep(250);
  }
  return { attachments: references.attachments, images: outputs };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function serve(config) {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/generate-image") {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      const body = await readJsonBody(request);
      const result = await generateImages({ ...config, ...body });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(result, null, 2));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }, null, 2));
    }
  });
  const port = Number(process.env.FLOW_API_PORT || 8787);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Flow request API listening on http://127.0.0.1:${port}`);
  });
}

async function main() {
  const config = await readFlowConfig();
  const options = {
    cdpPort: Number(process.env.FLOW_CDP_PORT || config.cdp_port || 9223),
    projectId: process.env.FLOW_PROJECT_ID || config.project_id,
    sessionId: process.env.FLOW_SESSION_ID || config.session_id || `;${Date.now()}`,
    modelName: process.env.FLOW_MODEL_NAME || config.model_name || "NARWHAL",
    aspectRatio: process.env.FLOW_ASPECT_RATIO || "16:9",
    outDir: process.env.FLOW_OUTPUT_DIR || join(process.cwd(), "04_\u7d20\u6750", "flow-generated"),
  };

  if (!options.projectId) throw new Error("Missing flow_fx.accounts.default.project_id");

  if (process.argv.includes("--serve")) {
    await serve(options);
    return;
  }

  const promptIndex = process.argv.indexOf("--prompt");
  const prompt = promptIndex >= 0 ? process.argv[promptIndex + 1] : undefined;
  if (!prompt) throw new Error("Usage: node flow-request-api.mjs --prompt \"...\"");
  const countIndex = process.argv.indexOf("--count");
  const count = countIndex >= 0 ? Number(process.argv[countIndex + 1]) : 1;
  const referenceMediaIds = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--reference-media-id") {
      referenceMediaIds.push(process.argv[index + 1]);
    }
  }
  const referenceImagePaths = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === "--reference-image") {
      referenceImagePaths.push(process.argv[index + 1]);
    }
  }
  const result = await generateImages({ ...options, prompt, count, referenceMediaIds, referenceImagePaths });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
