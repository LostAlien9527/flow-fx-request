# Flow FX Request

這是一個非官方的 Codex Skill，用來透過 request 方式呼叫 Google Labs Flow 生成圖片，並支援本機參考圖附件。

這個專案包含一份 Codex Skill，以及幾個本機 Node.js 輔助腳本。它只會使用已登入的專用 Chrome/Edge profile 來刷新 Google Authorization 與 reCAPTCHA token；真正的 Flow 生圖與本機圖片上傳會透過 Node `fetch` 發送 request。

## 重要聲明

- 這不是 Google 官方 API client。
- 本專案與 Google 沒有任何關聯。
- 本專案依賴 Google Labs Flow 網頁內部使用的 private endpoint，可能隨時失效或變更。
- 不要提交瀏覽器 profile、cookie、Authorization header、reCAPTCHA token、已簽名的圖片 URL，或 `%USERPROFILE%\.codex\secrets\api-secrets.json`。

## 登入風險告知

第一次初始化會開啟一個專用 Chrome/Edge/Chromium profile，並要求你在瀏覽器中登入 Google Labs Flow。這個 profile 會保存你的 Google 登入狀態，就像一般瀏覽器登入一樣。請注意：

- 只在你信任的私人電腦上使用。
- 不要把專用 browser profile 複製、分享或提交到 Git。
- 不要在共享電腦、公共電腦、未受信任的遠端主機上登入。
- 不要把 CDP port `9223` 或本機 API port `8787` 暴露到公開網路。
- 如果你懷疑 profile 外洩，請刪除該 profile，並到 Google 帳號安全頁面登出該裝置。
- 本工具不會把 cookie 寫進專案檔案，但登入狀態會存在瀏覽器 profile 內。

## 功能

- 透過 Flow request endpoint 進行文字生圖。
- 透過純 `fetch` 上傳本機參考圖。
- 使用 `references` 保留多附件順序。
- 第一次可視登入後，可改用 headless 背景瀏覽器。
- 提供只綁定 `127.0.0.1` 的本機 API server。
- 提供 doctor 腳本檢查初始化狀態。
- 限制本機上傳目錄、副檔名與檔案大小，避免任意檔案外傳。

## 專案結構

```text
flow-fx-request/
  SKILL.md
  CLAUDE.md
  README.md
  INSTALL.md
  SECURITY.md
  CONTRIBUTING.md
  package.json
  agents/
    openai.yaml
  scripts/
    init-flow-fx-request.mjs
    doctor-flow-fx-request.mjs
    flow-request-api.mjs
    upload-flow-media.mjs
  docs/
    API.md
    TROUBLESHOOTING.md
  .claude/
    commands/
      flow-setup.md
      flow-doctor.md
      flow-serve.md
      flow-generate.md
```

## 快速開始

### Windows

把專案安裝到 Codex skills：

```powershell
git clone https://github.com/YOUR_USERNAME/flow-fx-request.git "$env:USERPROFILE\.codex\skills\flow-fx-request"
cd "$env:USERPROFILE\.codex\skills\flow-fx-request"
```

### macOS

```bash
mkdir -p "$HOME/.codex/skills"
git clone https://github.com/YOUR_USERNAME/flow-fx-request.git "$HOME/.codex/skills/flow-fx-request"
cd "$HOME/.codex/skills/flow-fx-request"
```

第一次初始化：

```bash
npm run setup
```

初始化精靈會打開專用瀏覽器。請在瀏覽器中登入 Google Labs Flow，並開啟或建立一個 Flow project；回到終端機按 Enter 後，精靈會自動儲存 project 設定並執行檢查。

檢查初始化狀態：

```powershell
npm run doctor
```

初始化通過後，啟動本機 API：

```powershell
npm run serve
```

呼叫生圖：

```javascript
await fetch("http://127.0.0.1:8787/generate-image", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    prompt: "A cinematic rainy cafe window background, no people.",
    count: 1,
    aspectRatio: "16:9"
  })
});
```

## 本機參考圖

本機圖片上傳會被限制。傳入本機圖片前，請先設定允許上傳的目錄：

Windows PowerShell：

```powershell
$env:FLOW_ALLOWED_UPLOAD_DIRS = "D:\path\to\images;C:\path\to\workspace"
```

macOS / bash / zsh：

```bash
export FLOW_ALLOWED_UPLOAD_DIRS="/Users/you/Pictures;/Users/you/project"
```

建議使用 `references`，因為它會保留附件順序：

```javascript
await fetch("http://127.0.0.1:8787/generate-image", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    prompt: "Use references[0] for lighting only. Empty scene, no people.",
    count: 1,
    aspectRatio: "16:9",
    references: [
      { label: "attachment-1", path: "D:/path/to/reference.jpeg" }
    ],
    allowedUploadDirs: ["D:/path/to"]
  })
});
```

## Claude Code 使用方式

這個專案支援 Claude Code。Claude Code 會讀取 repo 根目錄的 `CLAUDE.md`，因此只要在 Claude Code 中打開這個 repo，它就能理解初始化、生圖、doctor 檢查與安全限制。

### Claude 初始化

請在 Claude Code 中打開這個 repo，然後要求：

```text
請依照 CLAUDE.md 幫我初始化 Flow FX Request。
```

Claude 應該會執行：

```bash
npm run setup
```

接著你需要在打開的瀏覽器中親自登入 Google Labs Flow，並開啟或建立 Flow project。完成後回到終端機按 Enter。

### Claude 登入風險

初始化會建立或使用專用 Chrome/Edge/Chromium profile。這個 profile 會保存 Google 登入狀態。請注意：

- 只在可信任的私人電腦使用。
- 不要在共享電腦、公共電腦、不可信任遠端主機登入。
- 不要把 browser profile 分享、同步或提交到 Git。
- 不要把 CDP port `9223` 或 API port `8787` 對外公開。
- 如果懷疑外洩，請刪除 profile 並到 Google 帳號安全頁面登出該裝置。

### Claude 常用要求

檢查環境：

```text
請依照 CLAUDE.md 跑 doctor，確認 Flow FX Request 是否可用。
```

啟動 API：

```text
請依照 CLAUDE.md 啟動 Flow FX Request local API。
```

用文字生圖：

```text
請用 Flow FX Request 生成一張 16:9 圖片：雨夜咖啡廳窗邊空景，沒有人物。
```

用參考圖生圖：

```text
請用 Flow FX Request，使用 references[0] 作為氛圍參考，生成無人物空景。圖片路徑是 /Users/you/Pictures/ref.jpeg。
```

使用本機參考圖時，Claude 應先設定或傳入 `allowedUploadDirs`，不要放寬到整個磁碟。

### Claude Slash Commands

本 repo 包含 `.claude/commands/` 範本。如果你的 Claude Code 環境支援專案 slash commands，可直接使用這些命令檔作為操作模板：

- `.claude/commands/flow-setup.md`
- `.claude/commands/flow-doctor.md`
- `.claude/commands/flow-serve.md`
- `.claude/commands/flow-generate.md`

## 文件

- [安裝方式](INSTALL.md)
- [API 說明](docs/API.md)
- [疑難排解](docs/TROUBLESHOOTING.md)
- [安全說明](SECURITY.md)
- [貢獻指南](CONTRIBUTING.md)

## 授權

MIT。請見 [LICENSE](LICENSE)。
