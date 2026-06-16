# 疑難排解

先跑 doctor：

```powershell
npm run doctor
```

如果是第一次安裝，建議先跑互動式初始化：

```powershell
npm run setup
```

## 登入安全提醒

初始化需要你在專用 browser profile 裡登入 Google Labs Flow。這個 profile 會保存登入狀態。請只在可信任的私人電腦上使用；不要在公共電腦、共享電腦或不可信任的遠端主機上登入。

如果你想完全重跑初始化，請先刪除：

- Windows: `%LOCALAPPDATA%\CodexFlowSnifferProfile`
- macOS: `~/Library/Application Support/CodexFlowSnifferProfile`
- shared config 裡的 `flow_fx` 設定

刪除後再執行 `npm run setup`。

## `config.project_id` 缺失

請在專用瀏覽器中開啟 Flow project，然後執行：

```powershell
npm run setup
```

## `cdp` 沒有啟動

啟動可視模式：

```powershell
npm run init
```

或在已登入後啟動 headless：

```powershell
npm run headless
```

## `flow_page` 找不到

CDP 瀏覽器有開，但目前頁面不是 Flow project。請開啟類似：

```text
https://labs.google/fx/zh/tools/flow/project/<project-id>
```

然後執行：

或在已開啟正確 project 後執行 `npm run configure`。

## `project_match` 失敗

目前 Flow 頁面與已設定的 project id 不一致。請開啟你要使用的 project，然後執行：

```powershell
npm run configure
```

## `recaptcha_runtime` 沒看到

重新整理 Flow 頁面。如果 Google 要求驗證，請使用可視模式：

```powershell
npm run init
```

## 本機 API 沒有啟動

啟動：

```powershell
npm run serve
```

## 參考圖被拒絕

檔案必須符合：

- 位於 `FLOW_ALLOWED_UPLOAD_DIRS`、request 的 `allowedUploadDirs`，或目前工作目錄底下。
- 副檔名是 `.jpg`、`.jpeg`、`.png`、`.webp`。
- 小於 `FLOW_MAX_UPLOAD_BYTES`。

範例：

Windows PowerShell：

```powershell
$env:FLOW_ALLOWED_UPLOAD_DIRS = "D:\path\to\images"
```

macOS / bash / zsh：

```bash
export FLOW_ALLOWED_UPLOAD_DIRS="/Users/you/Pictures"
```

## 中文檔名變成 `????`

Windows PowerShell 用 `Invoke-RestMethod -Body` 傳 JSON 時，可能把中文路徑編碼錯誤。建議使用 Node `fetch`，或明確傳 UTF-8 bytes。

## macOS 找不到瀏覽器

請確認 Chrome、Edge 或 Chromium 安裝在標準位置：

```text
/Applications/Google Chrome.app
/Applications/Microsoft Edge.app
/Applications/Chromium.app
```

如果裝在其他位置，請先把 app 移到標準位置，或用 `FLOW_CHROME_PROFILE` 指定 profile 後再執行 `npm run setup`。

## Private Endpoint 改版

本專案依賴 Flow 內部 endpoint。如果 Flow UI 更新後突然失效：

1. 先確認可視模式登入仍正常。
2. 執行 `npm run doctor`。
3. 必要時使用診斷用 upload helper 檢查 upload request 形狀。
4. 更新 `SKILL.md` 與 `docs/API.md` 的 endpoint mapping。
