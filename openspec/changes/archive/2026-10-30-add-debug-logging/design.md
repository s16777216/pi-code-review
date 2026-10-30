## Context

See `proposal.md` - Why. Today there is no logging at all beyond the final thrown error (`ConfigError`, `GitLabApiError`, `ReviewFailureError`) that `main()` catches and prints. `GitLabClient.request()` (`src/gitlab/client.ts`) and `AgentReviewEngine.review()` (`src/review/engine.ts`) are the two places with anything worth logging: every outbound GitLab call, and the agent's prompt/raw response.

## Goals / Non-Goals

**Goals:**
- A logger that shows normal progress by default and request/response detail under `--debug`, with no secret ever reaching it regardless of what a call site passes in.
- `pino`/`pino-pretty` usable directly by anyone who installs the published package, not only from source.
- Every log line the CLI produces — not just `--debug` diagnostics, but the existing `[pi-code-review] ...` progress messages and error output too — goes through the same `pino` instance. `--debug` is a verbosity level on one logging path, not a second, separate one. (Expanded from this change's original, narrower scope after the user asked for logging to be unified; see the "Migrating the existing progress/error output to `pino`" decision below.)

**Non-Goals:**
- Log levels beyond `info`/`debug`. No `--log-level trace|warn` ladder — this change only needs the two levels `--debug` switches between.
- Structured log *files* or shipping logs anywhere (no log aggregation, no `pino` transport beyond `pino-pretty` to stderr). Log output is for a human watching the terminal.
- Splitting output across stdout and stderr by level. Every log line — progress, debug detail, and errors alike — goes to stderr (see that same decision below); nothing is written to the tool's stdout.

## Decisions

### Logger construction: one `Logger` built per command, passed down as an optional constructor/options argument
`src/index.ts` builds a single `pino` instance per invocation, via `buildLogger(debug: boolean)`: level `info` by default, raised to `debug` when `--debug`/`DEBUG` is set, always rendered through `pino-pretty` to stderr. There is no `silent` branch in `buildLogger()` any more — `info` is the floor, since the CLI always has *some* progress output to show. A separate `silentLogger()` export (also in `src/logger.ts`) exists only as the fallback default for library classes' constructor options (`GitLabClient`, `AgentReviewEngine`, `GitLabSinkProvider`) when no logger is injected at all — mainly so unit tests that construct those classes directly don't need to pass one and don't print anything when they don't. The CLI itself always passes a real `buildLogger()` instance; `silentLogger()` never appears on that path.

That instance is threaded through:
- `GitLabClient.create(options)` gains an optional `logger` field on `GitLabClientOptions` (defaults to `silentLogger()` if omitted, so existing call sites/tests are unaffected).
- `AgentReviewEngineOptions` gains an optional `logger` field, same default.

Alternative considered: a module-level singleton logger (`import { logger } from './logger.ts'`) configured once via a side-effecting call. Rejected — it would make `GitLabClient` and `AgentReviewEngine`'s tests implicitly depend on global mutable state instead of an injected dependency, breaking the existing pattern (both already take everything they need through their options object, which is what lets tests use fakes with no network).

### Redaction: `pino`'s `redact` option, not per-call-site care
```ts
pino({
  redact: {
    paths: ['*.headers["PRIVATE-TOKEN"]', '*.apiKey'],
    censor: '[REDACTED]',
  },
});
```
`redact` inspects the object passed to the log call and masks matching paths regardless of what the call site logs, so a future call site that logs an options object containing a token is still safe — the mitigation lives in one place (the logger's construction), not in every call site's discipline. This is the reason to pick `pino` over a hand-rolled `console.error` wrapper: the guarantee is structural, not a convention someone has to remember.

Log calls themselves still try to pass only the safe fields (method/URL/status; prompt/response text) rather than whole options objects, as defense in depth — `redact` is the backstop, not the only line of defense.

### `pino-pretty` ships as a `dependency`, not a `devDependency`
Per the user's explicit decision: `--debug` is a feature of the published CLI (`@s16777216/pi-code-review`), used by whoever installs it, not only by people developing this repo. A `devDependency` would make `--debug` throw a "cannot find module 'pino-pretty'" error for every real installer. `pino` itself already has to be a regular dependency since it runs unconditionally (even the silent logger is a `pino` instance); `pino-pretty` follows the same reasoning because `--debug` is reachable by anyone running the published binary.

### What gets logged, and where
- `GitLabClient.request()` (`src/gitlab/client.ts`): one `logger.debug({ method, url, status }, 'gitlab request')` after the `fetch` call resolves (status available whether or not the response is ok), using the already-destructured `method`/`url` rather than the raw request/response objects — no headers object ever reaches the logger, so there is nothing for `redact` to need to catch here in the normal path.
- `AgentReviewEngine.review()` (`src/review/engine.ts`): one `logger.debug({ prompt }, 'review prompt')` right after `buildReviewPrompt(context)`, and one `logger.debug({ response: text }, 'review response')` right after extracting `text` from the last assistant message, before `parseFindings(text)` runs. `apiKey` (in `AgentReviewEngineOptions`) is never passed to a log call at all — redact's `*.apiKey` path is defense in depth only, matching the pattern above.
- A `logger.debug({ stopReason, usage, contentBlockTypes }, 'review final assistant message')` call right before the text extraction above, added after diagnosing a real intermittent failure (see the `fix: raise default maxTokens...` commit): the final assistant message sometimes carried only a `thinking` content block and no `text` block, and this line is what made that visible without reading `pi-agent-core`/`pi-ai` internals directly. Kept as a permanent part of `--debug`'s output, not a one-off debugging aid.

### Migrating the existing progress/error output to `pino`
Before this change, `src/index.ts` had its own ad hoc output: `console.log('[pi-code-review] ...')` for progress (fetching the MR, running the review, publish result, etc.) and `console.error('[pi-code-review] ...')` for the top-level uncaught-error handler; separately, `GitLabSinkProvider`'s default per-finding publish-failure handler used a bare `console.error(...)` with no prefix at all. Three different places, two different conventions, none of them going through the new `pino` logger that `--debug` introduced.

Decision: route all of it through the same `buildLogger()` instance instead.
- The progress messages become `logger.info(...)` calls in `runReview()`/`runPublish()`/`runReviewCommand()`/`runPublishCommand()`. The `[pi-code-review]` text prefix is dropped — `pino-pretty`'s own `[time] LEVEL (pid): message` format already identifies where a line came from, and a second, redundant prefix added no information.
- The top-level uncaught-error handler becomes `buildLogger(false).error(...)`. It runs outside any command's parsed options (an error here can come from argument parsing itself failing), so it cannot know whether `--debug` was requested; this does not matter for an `error`-level line, since `error` prints at both the `info` and `debug` level thresholds.
- `GitLabSinkProvider` gains an optional `logger` field on `GitLabSinkProviderOptions` (defaulting to `silentLogger()`, same pattern as `GitLabClient`/`AgentReviewEngine`). Its default per-finding failure handler (used whenever a caller doesn't supply its own `onDiscussionError`) becomes `this.logger.error({ file, line, error }, 'failed to post discussion')`. The injectable `onDiscussionError` override itself is unchanged — tests that need to assert on a specific failure still use it instead of parsing log output.
- Effect on verbosity: `buildLogger()`'s default level is `info` (not `silent`) now, specifically so these progress/error messages are visible without `--debug`. `--debug` raises the same logger to `debug`, additionally showing the GitLab-request and AI-prompt/response lines from the "What gets logged, and where" decision above. One logger, one verbosity knob.
- Effect on destination: every one of these messages now goes to stderr (via `pino-pretty`'s `destination: 2`), where the GitLab-request/prompt/response debug lines already went. Before this change, the progress messages were on stdout. This is a visible behavior change — accepted because the tool has no stdout-based data contract to preserve (findings go to a JSON *file*, not stdout; nothing pipes this CLI's stdout today) — see the matching entry in Risks / Trade-offs.

## Risks / Trade-offs

- [Risk] A future call site logs a whole options/config object instead of picking specific fields, and that object happens to contain a token under a key name `redact`'s configured paths don't match (e.g. a typo'd header casing). -> Mitigation: `redact`'s paths cover the two secret-bearing shapes that exist today (`PRIVATE-TOKEN` header, `apiKey` field); the existing `index.test.ts` secret-leak test (`runReview never logs the OpenAI API key or the GitLab access token`) gets extended to also run with `--debug`/a real (non-silent) logger capturing output, so a new leak is still caught by a test even if `redact`'s path list is ever incomplete.
- [Risk] `pino-pretty` as a runtime dependency adds install size/transitive dependencies for every user, even the ones who never pass `--debug`. -> Accepted: this was the user's explicit decision (see proposal.md) — consistency of "the installed CLI always supports `--debug`" outweighs the install-size cost for a tool with few dependencies already.
- [Risk] Moving the progress messages from stdout to stderr (see "Migrating the existing progress/error output to `pino`" above) breaks a CI job or local script that captured this tool's stdout expecting those lines. -> Accepted: this tool has never had a stdout-based contract — findings go to a JSON file (`--out`/`--from`), not stdout — so there is nothing today that this can break. A person watching the terminal interactively sees the same lines either way.
