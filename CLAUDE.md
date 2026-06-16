# CLAUDE.md

這份文件給 Claude Code 使用。專案本體是一個非官方 Google Labs Flow request wrapper，並同時可作為 Codex skill 使用。

## 基本原則

- 回答與文件維護優先使用繁體中文。
- 不要讀取、輸出、提交或要求使用者貼上 cookie、Authorization header、reCAPTCHA token、Google 帳號資料、signed image URL，或 `~/.codex/secrets/api-secrets.json` / `%USERPROFILE%\.codex\secrets\api-secrets.json` 的完整內容。
- 不要把 CDP port `9223` 或 local API port `8787` 對外公開。
- 不要修改安全限制來允許任意本機檔案上傳。
- 這是非官方 private endpoint wrapper；Flow 前端或 endpoint 變更時，應先跑 doctor，再判斷是否需要重新逆向。

## 常用命令

檢查腳本語法：

```bash
npm run check
```

第一次互動初始化：

```bash
npm run setup
```

檢查本機狀態：

```bash
npm run doctor
```

啟動 local API：

```bash
npm run serve
```

headless 啟動已登入 profile：

```bash
npm run headless
```

## Claude Code 操作建議

使用者要求初始化時：

1. 先提醒登入風險：專用 browser profile 會保存 Google 登入狀態，只能在可信任私人電腦使用。
2. 執行 `npm run setup`。
3. 請使用者在打開的瀏覽器中登入 Google Labs Flow，開啟或建立 Flow project。
4. 使用者完成後，setup 會偵測 project id、寫入非機密設定並跑 doctor。

使用者要求生圖時：

1. 先確認 `npm run doctor` 是否通過。
2. 若要用本機參考圖，確認 `FLOW_ALLOWED_UPLOAD_DIRS` 或 request `allowedUploadDirs` 只包含必要目錄。
3. 優先使用 local API `POST http://127.0.0.1:8787/generate-image`。
4. 不要在回覆中貼出 `fifeUrl` 的完整 signed URL，除非使用者明確要求並理解風險。

## Windows / macOS 路徑

Windows skill 位置：

```powershell
$env:USERPROFILE\.codex\skills\flow-fx-request
```

macOS skill 位置：

```bash
$HOME/.codex/skills/flow-fx-request
```

Windows profile 預設位置：

```text
%LOCALAPPDATA%\CodexFlowSnifferProfile
```

macOS profile 預設位置：

```text
~/Library/Application Support/CodexFlowSnifferProfile
```

## 驗證

修改任何腳本後至少執行：

```bash
npm run check
```

修改 `SKILL.md` 後，如果本機有 Codex skill validator，也執行：

```bash
python ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
```

在 Windows 上 validator 可能位於：

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" .
```
