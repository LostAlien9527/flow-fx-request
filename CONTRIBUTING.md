# 貢獻指南

歡迎貢獻，但請維持這個專案的原則：本機優先、明確、安全。

## 開發

```powershell
git clone https://github.com/YOUR_USERNAME/flow-fx-request.git
cd flow-fx-request
npm run check
```

目前沒有 npm dependencies，腳本只使用 Node 內建能力。

## Pull Request 前請確認

執行：

```powershell
npm run check
```

同時確認：

- 沒有提交 cookie、token、Authorization header、簽名 URL 或 browser profile。
- `SKILL.md` 保持精簡，適合作為 Codex skill 載入。
- endpoint mapping 有變更時，同步更新 `docs/API.md`。
- 安裝流程有變更時，同步更新 `INSTALL.md`。

## 程式風格

- 除非明顯降低風險，否則保持無 dependency。
- 錯誤訊息要明確，不要靜默失敗。
- 不要 log 敏感 header 或 request body。
- local API 必須維持綁定 `127.0.0.1`。
