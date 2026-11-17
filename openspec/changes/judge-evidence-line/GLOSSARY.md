# Glossary

## ai-diff-review

- **evidence line** — judge 對一則 `fixed` 判斷所引用的一行現行檔案內容,用來證明修正存在。程式只驗證該行是檔案中的整行(比對時兩邊去除前後空白)、為單行、至少 8 字元,且錨點與討論的錨點不同。Aliases: 證據行。
