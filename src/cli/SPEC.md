# src/cli

Implements capabilities `review-cli` (central spec: `openspec/specs/review-cli/spec.md`) and `debug-logging` (`openspec/specs/debug-logging/spec.md`).

## Responsibility

The command-line surface: a `review` command that writes a findings file, and a `publish` command that reads it, posts to the host, and exits with a pass/fail code.

## Entry points

- `index.ts`: `main`, `runReviewCommand`, `runPublishCommand`, `runReview`, `runPublish`, `parseReviewCliOptions`, `parsePublishCliOptions`. Exit codes `EXIT_PASS` (0), `EXIT_FAIL` (1, publish only), `EXIT_ERROR` (2).
- `../config.ts`: `loadReviewConfig`, `loadPublishConfig`. `--fail-on` / `FAIL_ON_SEVERITY` accepts `critical`, `high`, `medium`, `low`, `none`; default `high`.
- `../findingsFile.ts`: `writeFindingsFile`, `readFindingsFile` (validates with `validateFinding`).
- `../logger.ts`: `buildLogger`, `silentLogger`. Debug logging is opt-in and redacts secrets.

## Interfaces and dependencies

- `review` never publishes and never exits 1; `publish` never runs the AI review.
- Each command only accepts its own configuration.
- Uses `CodeHost` from `src/providers` and the engine in `src/core/review`.
