# 安全說明

## 適用範圍

本專案只設計給本機、自有帳號的自動化使用。

本機 API 只綁定 `127.0.0.1`，不應暴露到公開網路。

## 登入與 Profile 風險

初始化流程會建立或使用一個專用 Chrome/Edge/Chromium profile，並讓使用者在該 profile 中登入 Google Labs Flow。這代表：

- profile 內會保存 Google 登入狀態。
- 任何能讀取或控制該 profile 的人，可能能以該登入狀態使用 Flow。
- 任何能連到 CDP port 的程式，都可能控制該瀏覽器工作階段。
- 任何能連到本機 API port 的程式，都可能要求它讀取允許目錄內的圖片並送往 Flow。

安全建議：

- 只在你信任的私人電腦上登入。
- 不要在共享電腦、公共電腦或未受信任的遠端主機上使用。
- 不要將 CDP port `9223` 或 API port `8787` 綁定到 `0.0.0.0` 或透過 tunnel 對外公開。
- 不要複製、同步、上傳或分享專用 browser profile。
- 使用完畢後，如有疑慮，刪除 profile 並到 Google 帳號安全頁面登出該裝置。

## 絕對不要提交

請勿提交：

- Google cookies
- Authorization headers
- reCAPTCHA tokens
- Windows: `%USERPROFILE%\.codex\secrets\api-secrets.json`
- macOS: `~/.codex/secrets/api-secrets.json`
- Chrome/Edge browser profile
- Flow 生成的簽名 URL
- 不打算公開的生成圖片

## 本機檔案上傳保護

本機參考圖上傳受到以下限制：

- 允許副檔名：`.jpg`、`.jpeg`、`.png`、`.webp`
- 允許目錄：`FLOW_ALLOWED_UPLOAD_DIRS`、request 的 `allowedUploadDirs`，或目前工作目錄
- 檔案大小上限：`FLOW_MAX_UPLOAD_BYTES`

請保留這些限制，不要把 local API 暴露到 localhost 以外。

## 回報問題

請在 GitHub issue 提供：

- 使用的命令
- 已移除敏感資訊的錯誤輸出
- `npm run doctor` 的輸出
- 作業系統與 Node 版本

不要貼上 cookie、token、簽名 URL 或私人媒體。
