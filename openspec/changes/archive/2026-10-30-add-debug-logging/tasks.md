## 1. Logger construction

- [x] 1.1 Add `pino` and `pino-pretty` to `package.json`'s `dependencies` (not `devDependencies`), and verify `npm install` succeeds and both appear under `dependencies` in the lockfile
- [x] 1.2 Add a `buildLogger(debug: boolean): Logger` helper (new file, e.g. `src/logger.ts`) that returns a silent `pino` instance when `debug` is false, and a `pino-pretty`-transported instance at `debug` level when true, with `redact.paths` covering `*.headers["PRIVATE-TOKEN"]` and `*.apiKey`, and verify with a unit test that a logged object containing either key logs `[REDACTED]` instead of the real value

## 2. Thread the logger through

- [x] 2.1 Add an optional `logger` field to `GitLabClientOptions` (default to a silent logger when omitted) and log `{ method, url, status }` at debug level in `GitLabClient.request()` after the response resolves, and verify with a fake logger in a test that a `GitLabClient` call logs method/url/status and never logs headers
- [x] 2.2 Add an optional `logger` field to `AgentReviewEngineOptions` (default to a silent logger when omitted) and log the built prompt and the agent's raw response text at debug level in `AgentReviewEngine.review()`, and verify with a fake logger in a test that both log lines appear and neither contains `apiKey`'s value

## 3. CLI wiring

- [x] 3.1 Add `--debug` to both `parseReviewCliOptions` and `parsePublishCliOptions` (and read the `DEBUG` env var as a fallback, CLI flag wins), and verify with a CLI-parsing test that `--debug` is accepted by both commands and absent by default
- [x] 3.2 Wire `runReviewCommand`/`runPublishCommand` to build a logger via `buildLogger()` and pass it to `GitLabClient.create()` and `AgentReviewEngine`'s options, and verify manually (`node dist/index.js review --debug ...`) that debug output appears on stderr and stdout/exit code/findings file are unchanged compared to the same run without `--debug`

## 4. Secret-leak regression coverage

- [x] 4.1 Extend the existing `runReview never logs the OpenAI API key or the GitLab access token` test (`src/index.test.ts`) to also run with `--debug`/a non-silent logger capturing output, and verify it still asserts the secret value never appears in that captured output

## 5. Docs

- [x] 5.1 Document `--debug`/`DEBUG` in `README.md`'s Configuration tables and add a short note on the redaction guarantee, and verify by re-reading the rendered table against `parseReviewCliOptions`/`parsePublishCliOptions`'s actual flags

## 6. Verification

- [x] 6.1 Run `npm run build && npm test` and confirm all tests pass with no regressions — 84/84 passing
- [x] 6.2 Run `openspec validate add-debug-logging --strict` and confirm it passes

## 7. Unify all logging on `pino` (pulled forward mid-change, per user request)

- [x] 7.1 Change `buildLogger(debug)` to always render through `pino-pretty` (no more `silent`-when-`!debug` branch): level `info` by default, `debug` when `--debug`/`DEBUG` is set. Add a separate `silentLogger()` export in `src/logger.ts` for library classes' constructor defaults (`GitLabClient`, `AgentReviewEngine`, `GitLabSinkProvider`) when no logger is injected, so existing tests that construct those directly stay silent.
- [x] 7.2 Replace every `console.log('[pi-code-review] ...')` progress message in `src/index.ts` (`runReview`, `runPublish`, `runReviewCommand`, `runPublishCommand`) with `logger.info(...)` on the same logger already threaded through for `--debug`, dropping the now-redundant `[pi-code-review]` text prefix (`pino-pretty` already shows time/level/pid), and verify `npm run build && npm test` still passes
- [x] 7.3 Replace the top-level uncaught-error handler's `console.error('[pi-code-review] ...')` with `buildLogger(false).error(...)`, and verify manually (`node dist/index.js bogus`) that the error still prints and the process still exits 1
- [x] 7.4 Add an optional `logger` field to `GitLabSinkProviderOptions` (default `silentLogger()`) and replace its default per-finding failure handler's bare `console.error(...)` with `this.logger.error({ file, line, error }, 'failed to post discussion')`, keeping the existing injectable `onDiscussionError` override unchanged, and verify with a new test (`src/gitlab/sinkProvider.test.ts`) that a fake logger receives the error object when no override is given
- [x] 7.5 Verify manually (`node dist/index.js review` with no MR env vars, and `node dist/index.js bogus`) that normal (non-`--debug`) output now shows `info`/`error`-level lines via `pino-pretty`, and that `npm run build && npm test` passes with no regressions (89/89)
- [x] 7.6 Update `design.md`'s Goals/Non-Goals and add a "Migrating the existing progress/error output to `pino`" Decision section, plus a matching Risks/Trade-offs entry for the stdout→stderr behavior change
