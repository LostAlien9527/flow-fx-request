const CDP_PORT = Number(process.env.FLOW_CDP_PORT || 9223);
const fileHint = process.argv[2];
const SHOULD_CAPTURE = process.argv.includes("--capture");

if (!fileHint) {
  console.error("Usage: node upload-flow-media.mjs <image-path-or-filename-substring>");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveFile(hint) {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  try {
    const stat = await fs.stat(hint);
    if (stat.isFile()) return hint;
  } catch {}

  const candidates = [
    process.env.FLOW_DOWNLOADS_DIR,
    "D:/System/Downloads",
    path.join(os.homedir(), "Downloads"),
  ].filter(Boolean);
  const normalizedHint = hint.replace(/\\/g, "/").split("/").pop();
  for (const downloads of candidates) {
    try {
      const names = await fs.readdir(downloads);
      const name = names.find((item) => item === normalizedHint)
        || names.find((item) => item.includes(normalizedHint));
      if (name) return path.join(downloads, name);
    } catch {}
  }
  throw new Error(`File not found: ${hint}`);
}

async function getFlowPageTarget() {
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((response) => response.json());
  const page = targets.find((target) =>
    target.type === "page" && target.url.includes("/tools/flow/project/")
  );
  if (!page) throw new Error(`No Flow project page found on CDP port ${CDP_PORT}`);
  return page;
}

async function main() {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const filePath = await resolveFile(fileHint);
  const fileName = path.basename(filePath);
  const bytes = await fs.readFile(filePath);
  const base64 = Buffer.from(bytes).toString("base64");

  const target = await getFlowPageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const requests = new Map();
  const uploadRequests = new Map();
  let uploadedMediaId = "";
  let uploadedWorkflowId = "";

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }

    if (message.method === "Network.requestWillBeSent") {
      const { requestId, request } = message.params;
      if (/uploadImage|media\.getMediaUrlRedirect/i.test(request.url)) {
        requests.set(requestId, request);
      }
      if (/\/v1\/flow\/uploadImage/.test(request.url)) {
        let postData = request.postData;
        try {
          const body = await send("Network.getRequestPostData", { requestId });
          postData = body.result?.postData || postData;
        } catch {}
        uploadRequests.set(requestId, { ...request, postData });
      }
    }

    if (message.method === "Network.responseReceived") {
      const request = requests.get(message.params.requestId);
      if (!request || !/json|text/.test(message.params.response.mimeType || "")) return;
      try {
        const bodyResult = await send("Network.getResponseBody", {
          requestId: message.params.requestId,
        });
        const rawBody = bodyResult.result?.body || "";
        if (!rawBody.trim()) return;
        const body = JSON.parse(rawBody);
        if (body.media?.name) uploadedMediaId = body.media.name;
        if (body.workflow?.name) uploadedWorkflowId = body.workflow.name;
      } catch {}
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  await send("Network.enable", { maxPostDataSize: 8 * 1024 * 1024 });
  await send("Runtime.enable");

  const script = `(() => {
    const base64 = ${JSON.stringify(base64)};
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: "image/jpeg" });
    const item = { kind: "file", type: "image/jpeg", getAsFile: () => file };
    const clipboardData = { items: [item], files: [file], types: ["Files"] };
    const textbox = [...document.querySelectorAll("[role=textbox],[contenteditable=true]")].at(-1);
    textbox?.focus();
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    textbox?.dispatchEvent(event);
    return { fileName: file.name, size: file.size, focused: document.activeElement === textbox };
  })()`;

  const pasteResult = await send("Runtime.evaluate", {
    expression: script,
    returnByValue: true,
  });
  console.error(JSON.stringify(pasteResult.result?.result?.value || {}, null, 2));

  const startedAt = Date.now();
  while (!uploadedMediaId && Date.now() - startedAt < Number(process.env.FLOW_UPLOAD_WAIT_MS || 60000)) {
    await sleep(1000);
  }
  ws.close();

  if (!uploadedMediaId) throw new Error("Upload did not return a Flow media id");

  if (SHOULD_CAPTURE) {
    const redactedHeaders = (headers = {}) => Object.fromEntries(
      Object.entries(headers).map(([key, value]) =>
        /authorization|cookie|x-goog-authuser/i.test(key) ? [key, "[REDACTED]"] : [key, value],
      ),
    );
    const postDataKeys = (postData) => {
      try {
        return postData ? Object.keys(JSON.parse(postData)) : [];
      } catch {
        return [];
      }
    };
    const upload = [...uploadRequests.values()].at(-1);
    console.error(JSON.stringify({
      uploadRequest: upload
        ? {
            url: upload.url,
            method: upload.method,
            headers: redactedHeaders(upload.headers),
            postDataLength: upload.postData?.length || 0,
            postDataKeys: postDataKeys(upload.postData),
          }
        : undefined,
    }, null, 2));
  }

  console.log(JSON.stringify({
    file: filePath,
    mediaId: uploadedMediaId,
    workflowId: uploadedWorkflowId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
