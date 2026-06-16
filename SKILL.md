---
name: flow-fx-request
description: Generate images through a local Google Labs Flow request wrapper. Use when the user asks to call Flow, Flow FX, Nano Banana in Flow, request-based Flow image generation, reference-image generation, local image attachments, or wants to avoid browser UI automation for Flow generation.
---

# Flow FX Request

Use the bundled scripts in this skill:

- `scripts/init-flow-fx-request.mjs`
- `scripts/setup-flow-fx-request.mjs`
- `scripts/doctor-flow-fx-request.mjs`
- `scripts/flow-request-api.mjs`
- `scripts/upload-flow-media.mjs` for diagnostics only

The wrapper sends Flow requests with Node `fetch`. It uses a logged-in dedicated browser profile only to refresh Google `Authorization` and reCAPTCHA tokens. Do not print or store raw cookies, Authorization headers, or reCAPTCHA tokens.

This depends on private Google Labs Flow endpoints. If Flow changes its frontend/API, rerun diagnostics and capture a fresh request before assuming the wrapper is broken.

## Login Risk Notice

The setup flow opens a dedicated Chrome/Edge/Chromium profile and asks the user to sign in to Google Labs Flow. That browser profile stores the user's Google login state. Treat it as sensitive:

- Use it only on a trusted private computer.
- Do not copy, share, sync, or commit the dedicated browser profile.
- Do not expose CDP port `9223` or local API port `8787` to a public network.
- Do not use this on shared, public, or untrusted remote machines.
- If the profile may be compromised, delete it and sign out from the Google account security page.

## Runtime Requirements

- Node.js 22+ or another runtime with built-in `fetch` and `WebSocket`.
- Dedicated Chrome/Edge/Chromium profile logged in to Flow.
- CDP available on `127.0.0.1:9223` unless `FLOW_CDP_PORT` is set.
- Config stored at `%USERPROFILE%\.codex\secrets\api-secrets.json` on Windows or `~/.codex/secrets/api-secrets.json` on macOS, service `flow_fx.accounts.default`.

Relevant environment variables:

- `FLOW_CDP_PORT`: CDP port, default `9223`
- `FLOW_API_PORT`: local API port, default `8787`
- `FLOW_OUTPUT_DIR`: output folder for generated images
- `FLOW_ALLOWED_UPLOAD_DIRS`: semicolon-separated directories allowed for `referenceImagePaths`
- `FLOW_MAX_UPLOAD_BYTES`: max local upload size, default `20971520`
- `FLOW_AUTH_CACHE_MS`: Authorization cache duration, default `120000`

## Initialization

For first-time setup, prefer the interactive setup script:

Windows:

```powershell
$FlowSkill = "$env:USERPROFILE\.codex\skills\flow-fx-request"
node "$FlowSkill\scripts\setup-flow-fx-request.mjs"
```

macOS:

```bash
FlowSkill="$HOME/.codex/skills/flow-fx-request"
node "$FlowSkill/scripts/setup-flow-fx-request.mjs"
```

The setup script launches a visible browser, waits for the user to sign in and open a Flow project, saves non-secret config, and runs doctor.

For manual setup, resolve the skill directory first, then run commands against `scripts/`.

Windows:

```powershell
$FlowSkill = "$env:USERPROFILE\.codex\skills\flow-fx-request"
node "$FlowSkill\scripts\init-flow-fx-request.mjs"
```

macOS:

```bash
FlowSkill="$HOME/.codex/skills/flow-fx-request"
node "$FlowSkill/scripts/init-flow-fx-request.mjs"
```

In the visible browser, sign in to Google Labs Flow and open or create a Flow project. Then save non-secret config:

```powershell
node "$FlowSkill\scripts\init-flow-fx-request.mjs" --configure-current
```

For future runs without a visible browser:

```powershell
node "$FlowSkill\scripts\init-flow-fx-request.mjs" --headless
```

Then start the local API:

```powershell
node "$FlowSkill\scripts\flow-request-api.mjs" --serve
```

Only the first login should need a visible browser. If Google asks for verification, rerun visible mode.

## Health Check

Before generating, or when a request fails, run:

```powershell
node "$FlowSkill\scripts\doctor-flow-fx-request.mjs"
```

The doctor checks config, CDP, the current Flow project page, reCAPTCHA runtime, project id match, and local API status. It does not print cookies or tokens.

## Generate With CLI

Text only:

```powershell
node "$FlowSkill\scripts\flow-request-api.mjs" --prompt "PROMPT" --count 1
```

Existing Flow media id:

```powershell
node "$FlowSkill\scripts\flow-request-api.mjs" `
  --prompt "Use the reference image lighting, but create a new scene" `
  --reference-media-id "581d6121-5ff2-42d9-8fd5-9651de869067"
```

Local reference image:

Windows:

```powershell
$env:FLOW_ALLOWED_UPLOAD_DIRS = "D:\path\to\images;C:\path\to\workspace"
node "$FlowSkill\scripts\flow-request-api.mjs" `
  --prompt "Use the reference image atmosphere, but generate an empty scene with no people" `
  --count 1 `
  --reference-image "D:\path\to\image.jpeg"
```

macOS:

```bash
export FLOW_ALLOWED_UPLOAD_DIRS="/Users/you/Pictures;/Users/you/project"
node "$FlowSkill/scripts/flow-request-api.mjs" \
  --prompt "Use the reference image atmosphere, but generate an empty scene with no people" \
  --count 1 \
  --reference-image "/Users/you/Pictures/image.jpeg"
```

The default output folder is `FLOW_OUTPUT_DIR`, or `04_素材\flow-generated` under the current working directory.

## Local API

Start the server:

```powershell
node "$FlowSkill\scripts\flow-request-api.mjs" --serve
```

Recommended request shape:

```javascript
await fetch("http://127.0.0.1:8787/generate-image", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    prompt: "Use references[0] for rainy cafe lighting only. Empty scene, no people.",
    count: 1,
    aspectRatio: "16:9",
    references: [
      { label: "attachment-1", path: "D:/path/to/image.jpeg" },
      { label: "attachment-2", mediaId: "581d6121-5ff2-42d9-8fd5-9651de869067" }
    ],
    allowedUploadDirs: ["D:/path/to"]
  })
});
```

Supported fields:

- `prompt`: required
- `count`: `1` to `4`
- `aspectRatio`: `16:9`, `4:3`, `1:1`, `3:4`, `9:16`
- `references`: ordered array of `{ label, path }` or `{ label, mediaId }`; prefer this for multi-attachment prompts
- `referenceImagePaths`: shortcut array of local image paths
- `referenceMediaIds`: shortcut array of existing Flow media ids
- `allowedUploadDirs`: per-request allowed roots for local image uploads
- `maxUploadBytes`: per-request upload size cap
- `outDir`: output directory

The response includes ordered `attachments`, so prompts can consistently refer to `references[0]`, `references[1]`, attachment 1, or attachment 2. Avoid mixing `references`, `referenceImagePaths`, and `referenceMediaIds` in the same request unless ordering does not matter.

PowerShell callers must send UTF-8 JSON bytes when paths contain Chinese characters. Plain Windows PowerShell `Invoke-RestMethod -Body` may replace filenames with `????`; Node `fetch` is preferred for those cases.

## Upload Safety

Direct local file upload is allowed only for image files with `.jpg`, `.jpeg`, `.png`, or `.webp`. Files must be under `FLOW_ALLOWED_UPLOAD_DIRS`, `allowedUploadDirs`, or the current working directory, and must fit within `FLOW_MAX_UPLOAD_BYTES`.

The diagnostic paste helper can capture upload request shape:

```powershell
node "$FlowSkill\scripts\upload-flow-media.mjs" "D:\path\to\image.jpeg" --capture
```

It must not be used as the normal upload path. Normal local image upload should go through `references` or `referenceImagePaths`.

## Endpoint Mapping

Image generation:

- Endpoint: `https://aisandbox-pa.googleapis.com/v1/projects/{projectId}/flowMedia:batchGenerateImages`
- Method: `POST`
- Header: `Authorization: Bearer ...`
- Header: `Content-Type: text/plain;charset=UTF-8`
- Body model: `imageModelName: "NARWHAL"`
- Body prompt: `structuredPrompt.parts[].text`
- Body token: `clientContext.recaptchaContext.token`
- Body reference images: `requests[].imageInputs[]`
- Response image URL: `media[].image.generatedImage.fifeUrl`

Local upload:

- Endpoint: `https://aisandbox-pa.googleapis.com/v1/flow/uploadImage`
- Method: `POST`
- Header: `Authorization: Bearer ...`
- Header: `Content-Type: text/plain;charset=UTF-8`
- Body context: `clientContext.projectId`
- Body image: `imageBytes` base64
- Response media id: `media.name`

Reference image shape:

```json
{
  "imageInputType": "IMAGE_INPUT_TYPE_REFERENCE",
  "name": "581d6121-5ff2-42d9-8fd5-9651de869067"
}
```
