# Proposal

## Why

The system prompt is in English, so the model writes every finding summary in English. A team that works in another language, for example Traditional Chinese, gets review comments in a language that some members read more slowly. `TODO.md` lists this as "review 支援設定輸出語言".

## What Changes

- New optional setting for the `review` command: `--language` / `REVIEW_LANGUAGE`. The value is a free-text language name, for example `Traditional Chinese` or `zh-TW`.
- When the setting is given, the system prompt tells the model to write each finding summary in that language.
- When the setting is not given, the system prompt does not change. The output stays as it is today.
- JSON field names and severity values stay in English. The parser and `publish` depend on them.
- The `publish` command does not accept the setting. The severity label in each comment, for example `**[important]**`, stays in English.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`: Added "Write finding summaries in the configured language".
- `review-cli`: Modified "Each command accepts only the configuration it needs", so that `publish` rejects the language flag.

## Impact

- Affected code: `src/config.ts` (new optional setting), `src/cli/index.ts` (new `review` flag), `src/core/review/engine.ts` (new engine option and system prompt sentence).
- Affected tests: `config.test.ts`, `src/cli/index.cli.test.ts`, `engine.test.ts`.
- Affected docs: the configuration table in `README.md`, and the item in `TODO.md`.
- No change to `findings.json` or to the comment format.
