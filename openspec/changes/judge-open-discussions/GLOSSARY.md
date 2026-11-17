# Glossary

## ai-diff-review

- **discussion judgment step** — 三個 review focus 的輸出合併、驗證步驟之後,由獨立 judge 逐檔判斷本工具開的未解決討論是否已修好的步驟。Aliases: 討論判斷步驟、討論判斷。
- **judge** — 執行討論判斷步驟的 agent,每次處理一個檔案的未解決討論。Aliases: 判斷 agent。
- **judgment** — judge 對一則討論的判斷:`fixed`、`not_fixed`、`uncertain`。只有 `fixed` 會轉成已修正宣告。Aliases: 判斷結果。
