## Why

When `review` or `publish` fails or behaves unexpectedly (a GitLab API error, an unexpected AI response), there is currently no way to see what request was sent, what came back, or what the agent produced before parsing — the only visible output is the final error message. A `--debug` flag that logs that detail, without ever risking a leaked secret, makes diagnosing those failures possible without adding any new secret-handling risk.

## What Changes

- Add a `--debug` CLI flag (and `DEBUG` environment variable, flag wins, consistent with every other setting) accepted by both `review` and `publish`. Off by default.
- Introduce `pino` as the logging library, with `pino-pretty` as a regular (non-dev) dependency — `--debug` output must be human-readable for a person running the CLI directly, not only developers, so `pino-pretty` ships to every installer, not just this repo's own `devDependencies`.
- Use pino's built-in `redact` option to guarantee `GITLAB_TOKEN`/`OPENAI_API_KEY` and the `PRIVATE-TOKEN` header are never printed, including in debug output. This is enforced by `redact`, not by remembering to omit a field at each call site.
- When `--debug` is on, log: each GitLab API call's method, URL, and response status (never headers or body), and the AI agent's prompt and raw response before `parseFindings` runs.
- `--debug` does not change exit codes, stdout's existing output, or the findings file's contents — it only adds stderr log lines.

## Capabilities

### New Capabilities
- `debug-logging`: The `--debug` flag/`DEBUG` env var, what gets logged under it, and the guarantee that logging never includes a secret.

### Modified Capabilities
(none — `review-cli`, `gitlab-mr-context`, and `ai-diff-review`'s existing requirements are unaffected; `--debug` is purely additive observability, not a change to any of their SHALL statements.)

## Impact

- `src/index.ts`: both `parseReviewCliOptions`/`parseReviewCliOptions` gain `--debug`; `runReviewCommand`/`runPublishCommand` construct a pino logger and pass it down.
- `src/gitlab/client.ts`: `GitLabClient.request()` logs method/URL/status when a logger is present.
- `src/review/engine.ts` (or wherever the agent call lives): logs the built prompt and the raw agent response when a logger is present.
- New dependencies: `pino`, `pino-pretty` (both regular `dependencies`, not `devDependencies`).
- `README.md`: document `--debug`/`DEBUG`, and the redaction guarantee.
