# src/cli

Implements capabilities `review-cli` (central spec: `openspec/specs/review-cli/spec.md`) and `debug-logging` (`openspec/specs/debug-logging/spec.md`).

## Responsibility

The command-line surface: a `review` command that writes a findings file (and deletes the old one first), and a `publish` command that reads it, posts to the host, and exits with a pass/fail code.

## Entry points

- `index.ts`: `main`, `runReviewCommand`, `runPublishCommand`, `runReview`, `runPublish`, `parseReviewCliOptions`, `parsePublishCliOptions`. Exit codes `EXIT_PASS` (0), `EXIT_FAIL` (1, publish only), `EXIT_ERROR` (2). `runReview` returns a file with `failed` when the engine fails, and `review` then exits with `EXIT_ERROR`.
- `../config.ts`: `loadReviewConfig`, `loadPublishConfig`. `--timeout` / `OPENAI_TIMEOUT_MS` sets the model request timeout. `--fail-on` / `FAIL_ON_SEVERITY` accepts `critical`, `high`, `medium`, `low`, `none`; default `high`.
- `../findingsFile.ts`: `writeFindingsFile`, `readFindingsFile` (validates with `validateFinding`). The file holds `diffRefs` (the host snapshot) and `source` (the host name, project ID and merge request IID that `review` read); the file also has `warnings`, and `failed` for a failed review. `diffRefs` and `source` are checked by the host's `parseSnapshot` and `parseSource`.
- `../logger.ts`: `buildLogger`, `silentLogger`. Debug logging is opt-in and redacts secrets.

## Interfaces and dependencies

- `review` never publishes and never exits 1; `publish` never runs the AI review, and exits 1 for a findings file with `failed`.
- Each command only accepts its own configuration. The host declares separate flags (`reviewFlags`, `publishFlags`).
- `publish` takes its target from the findings file `source`. It has no `--project-id` or `--mr` flag and ignores `CI_PROJECT_ID` and `CI_MERGE_REQUEST_IID`. A file without a valid `source` stops it before any API call.
- Uses `CodeHost` from `src/providers` and the engine in `src/core/review`.
