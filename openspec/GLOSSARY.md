# Glossary

## core

- **ExampleTerm** — Definition of example domain term. Aliases: alias1, alias2.

## ai-diff-review

- **review instructions** — 專案負責人寫的審查重點與規則文字,附加到 review 的系統提示詞。Aliases: 額外指示、審查指示。
- **instructions source** — review instructions 的來源,共四種:`--instructions` 路徑、`--instructions-text` 字串、`REVIEW_INSTRUCTIONS_FILE` 路徑、`REVIEW_INSTRUCTIONS` 字串。Aliases: 指示來源。
- **review focus** — 一次 agent 執行的審查重點,內建 3 種:邏輯正確性、安全性、資源與並行。Aliases: 審查焦點、焦點。
- **deduplication step** — 合併各執行的 finding 後,由一次模型呼叫判斷哪些 finding 是同一個問題的步驟。Aliases: 去重步驟、去重。
- **verification step** — 去重後,由獨立 verifier 逐檔複核 finding、判決並重評嚴重度的步驟。Aliases: 驗證階段、驗證。
- **verifier** — 執行驗證步驟的 agent,每次處理一個檔案的 findings。Aliases: 驗證 agent。
- **verdict** — verifier 對一條 finding 的判決:`confirmed`、`rejected`、`uncertain`。Aliases: 判決。
