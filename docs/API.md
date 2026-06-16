# API 說明

先啟動本機 server：

```powershell
npm run serve
```

預設 endpoint：

```text
POST http://127.0.0.1:8787/generate-image
```

如果要改 port：

```powershell
$env:FLOW_API_PORT = "8788"
```

## Request Body

```json
{
  "prompt": "A cinematic rainy cafe window background, no people.",
  "count": 1,
  "aspectRatio": "16:9",
  "references": [
    { "label": "attachment-1", "path": "D:/path/to/image.jpeg" },
    { "label": "attachment-2", "mediaId": "581d6121-5ff2-42d9-8fd5-9651de869067" }
  ],
  "allowedUploadDirs": ["D:/path/to"],
  "outDir": "D:/path/to/outputs"
}
```

## 欄位

- `prompt`：必填字串。
- `count`：可選，`1` 到 `4`，預設 `1`。
- `aspectRatio`：可選。支援 `16:9`、`4:3`、`1:1`、`3:4`、`9:16`。
- `references`：建議使用的有序附件陣列，可放 `{ label, path }` 或 `{ label, mediaId }`。
- `referenceImagePaths`：本機圖片路徑陣列捷徑。
- `referenceMediaIds`：既有 Flow media id 陣列捷徑。
- `allowedUploadDirs`：這次 request 允許讀取與上傳的本機根目錄。
- `maxUploadBytes`：這次 request 的上傳大小上限。
- `outDir`：輸出圖片儲存目錄。

當附件順序重要時，請優先使用 `references`，不要混用 `references`、`referenceImagePaths`、`referenceMediaIds`。

## Response Body

```json
{
  "attachments": [
    {
      "label": "attachment-1",
      "file": "D:/path/to/image.jpeg",
      "mediaId": "uploaded-flow-media-id",
      "workflowId": "uploaded-flow-workflow-id"
    }
  ],
  "images": [
    {
      "mediaId": "generated-flow-media-id",
      "workflowId": "generated-flow-workflow-id",
      "seed": 123456,
      "prompt": "A cinematic rainy cafe window background, no people.",
      "fifeUrl": "https://flow-content.google/...",
      "file": "D:/path/to/outputs/generated-flow-media-id.png"
    }
  ]
}
```

`fifeUrl` 是暫時性的簽名 URL，請不要提交到公開 repo。

## 環境變數

- `FLOW_CDP_PORT`：CDP port，預設 `9223`。
- `FLOW_API_PORT`：本機 API port，預設 `8787`。
- `FLOW_OUTPUT_DIR`：生成圖片輸出目錄。
- `FLOW_ALLOWED_UPLOAD_DIRS`：允許上傳的本機目錄，可用分號分隔多個路徑。Windows 與 macOS 都使用分號分隔。
- `FLOW_MAX_UPLOAD_BYTES`：本機上傳大小上限，預設 `20971520`。
- `FLOW_AUTH_CACHE_MS`：Authorization cache 時間，預設 `120000`。

## Flow Endpoint 對應

圖片生成：

- Endpoint：`https://aisandbox-pa.googleapis.com/v1/projects/{projectId}/flowMedia:batchGenerateImages`
- Method：`POST`
- Content type：`text/plain;charset=UTF-8`
- Prompt：`requests[].structuredPrompt.parts[].text`
- 參考圖：`requests[].imageInputs[]`
- 圖片 URL：`media[].image.generatedImage.fifeUrl`

本機圖片上傳：

- Endpoint：`https://aisandbox-pa.googleapis.com/v1/flow/uploadImage`
- Method：`POST`
- Content type：`text/plain;charset=UTF-8`
- 圖片欄位：`imageBytes` base64
- 回傳 media id：`media.name`
