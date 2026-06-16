# 安裝方式

以下提供 Windows PowerShell 與 macOS bash/zsh 流程。腳本本身是純 Node.js，透過 Chrome/Edge/Chromium CDP 工作。

## 1. 需求

- Node.js 22 或更新版本。
- Git。
- Chrome、Edge 或 Chromium。
- 可使用 Google Labs Flow 的 Google 帳號。
- 支援本機 skills 的 Codex。

確認 Node 與 Git：

```powershell
node --version
git --version
```

## 2. 安裝成 Codex Skill

### Windows

把 repo clone 到 Codex skills 目錄：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
git clone https://github.com/YOUR_USERNAME/flow-fx-request.git "$env:USERPROFILE\.codex\skills\flow-fx-request"
cd "$env:USERPROFILE\.codex\skills\flow-fx-request"
```

### macOS

把 repo clone 到 Codex skills 目錄：

```bash
mkdir -p "$HOME/.codex/skills"
git clone https://github.com/YOUR_USERNAME/flow-fx-request.git "$HOME/.codex/skills/flow-fx-request"
cd "$HOME/.codex/skills/flow-fx-request"
```

如果你是從本機資料夾安裝：

```powershell
Copy-Item -Recurse -Force "D:\AI 專案\flow-fx-request" "$env:USERPROFILE\.codex\skills\flow-fx-request"
cd "$env:USERPROFILE\.codex\skills\flow-fx-request"
```

## 3. 第一次初始化

建議使用互動式 setup：

```powershell
npm run setup
```

### 登入風險告知

`npm run setup` 會開啟專用 Chrome/Edge/Chromium profile，讓你登入 Google Labs Flow。這個 profile 會保存你的 Google 登入狀態。請只在你信任的私人電腦上使用，不要在共享電腦、公共電腦或未受信任的遠端主機上登入。

請不要：

- 提交或分享 browser profile。
- 提交 `%USERPROFILE%\.codex\secrets\api-secrets.json` 或 `~/.codex/secrets/api-secrets.json`。
- 把 CDP port `9223` 或 API port `8787` 對外公開。
- 把 cookie、Authorization header、reCAPTCHA token 貼到 issue、log 或文件。

如果要重置登入狀態，請關閉相關瀏覽器行程，刪除專用 profile，並重新執行 `npm run setup`。

這個精靈會：

1. 啟動專用 CDP 瀏覽器。
2. 等你登入 Google Labs Flow 並開啟 Flow project。
3. 自動偵測 project id。
4. 寫入非機密設定。
5. 執行 doctor 檢查。

你仍然需要在瀏覽器中親自登入 Google，因為 Google 帳號狀態不能也不應該被包進 skill。

### 手動初始化

如果你想分步執行，也可以用手動流程。

啟動專用 CDP 瀏覽器：

```powershell
npm run init
```

在瀏覽器中：

1. 登入 Google。
2. 開啟 Google Labs Flow。
3. 開啟或建立一個 Flow project。

手動儲存目前 Flow project id：

```powershell
npm run configure
```

這只會把非機密設定寫入：

```text
Windows: %USERPROFILE%\.codex\secrets\api-secrets.json
macOS: ~/.codex/secrets/api-secrets.json
```

不要把這個檔案提交到 Git。

## 4. 背景執行

第一次登入並完成設定後，可以改用 headless：

```powershell
npm run headless
```

接著啟動本機 API：

```powershell
npm run serve
```

## 5. 檢查安裝

```powershell
npm run doctor
```

理想結果會看到：

```json
{
  "ok": true
}
```

如果有任何檢查失敗，請看 [疑難排解](docs/TROUBLESHOOTING.md)。

## 6. 生圖

CLI：

```powershell
npm run generate -- --prompt "A cinematic rainy cafe window background, no people." --count 1
```

HTTP API：

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

## 7. 使用參考圖

先允許可上傳的本機目錄：

Windows PowerShell：

```powershell
$env:FLOW_ALLOWED_UPLOAD_DIRS = "D:\path\to\images"
```

macOS / bash / zsh：

```bash
export FLOW_ALLOWED_UPLOAD_DIRS="/Users/you/Pictures"
```

再發送 request：

```javascript
await fetch("http://127.0.0.1:8787/generate-image", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    prompt: "Use references[0] for mood only. Empty scene, no people.",
    count: 1,
    references: [
      { label: "attachment-1", path: "D:/path/to/image.jpeg" }
    ],
    allowedUploadDirs: ["D:/path/to/images"]
  })
});
```

如果檔名含中文，建議用 Node `fetch`。Windows PowerShell 直接用 `Invoke-RestMethod -Body` 時，可能把中文檔名編碼成 `????`。

## 8. macOS 預設路徑

macOS 會優先尋找：

```text
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge
/Applications/Chromium.app/Contents/MacOS/Chromium
```

macOS 專用 browser profile 預設放在：

```text
~/Library/Application Support/CodexFlowSnifferProfile
```

如果要指定自己的瀏覽器 profile 路徑：

```bash
export FLOW_CHROME_PROFILE="$HOME/Library/Application Support/MyFlowProfile"
npm run setup
```
