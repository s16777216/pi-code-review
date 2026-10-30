## 1. Logger construction

- [ ] 1.1 Add `pino` and `pino-pretty` to `package.json`'s `dependencies` (not `devDependencies`), and verify `npm install` succeeds and both appear under `dependencies` in the lockfile
- [ ] 1.2 Add a `buildLogger(debug: boolean): Logger` helper (new file, e.g. `src/logger.ts`) that returns a silent `pino` instance when `debug` is false, and a `pino-pretty`-transported instance at `debug` level when true, with `redact.paths` covering `*.headers["PRIVATE-TOKEN"]` and `*.apiKey`, and verify with a unit test that a logged object containing either key logs `[REDACTED]` instead of the real value

## 2. Thread the logger through

- [ ] 2.1 Add an optional `logger` field to `GitLabClientOptions` (default to a silent logger when omitted) and log `{ method, url, status }` at debug level in `GitLabClient.request()` after the response resolves, and verify with a fake logger in a test that a `GitLabClient` call logs method/url/status and never logs headers
- [ ] 2.2 Add an optional `logger` field to `AgentReviewEngineOptions` (default to a silent logger when omitted) and log the built prompt and the agent's raw response text at debug level in `AgentReviewEngine.review()`, and verify with a fake logger in a test that both log lines appear and neither contains `apiKey`'s value

## 3. CLI wiring

- [ ] 3.1 Add `--debug` to both `parseReviewCliOptions` and `parsePublishCliOptions` (and read the `DEBUG` env var as a fallback, CLI flag wins), and verify with a CLI-parsing test that `--debug` is accepted by both commands and absent by default
- [ ] 3.2 Wire `runReviewCommand`/`runPublishCommand` to build a logger via `buildLogger()` and pass it to `GitLabClient.create()` and `AgentReviewEngine`'s options, and verify manually (`node dist/index.js review --debug ...`) that debug output appears on stderr and stdout/exit code/findings file are unchanged compared to the same run without `--debug`

## 4. Secret-leak regression coverage

- [ ] 4.1 Extend the existing `runReview never logs the OpenAI API key or the GitLab access token` test (`src/index.test.ts`) to also run with `--debug`/a non-silent logger capturing output, and verify it still asserts the secret value never appears in that captured output

## 5. Docs

- [ ] 5.1 Document `--debug`/`DEBUG` in `README.md`'s Configuration tables and add a short note on the redaction guarantee, and verify by re-reading the rendered table against `parseReviewCliOptions`/`parsePublishCliOptions`'s actual flags

## 6. Verification

- [ ] 6.1 Run `npm run build && npm test` and confirm all tests pass with no regressions
- [ ] 6.2 Run `openspec validate add-debug-logging --strict` and confirm it passes
