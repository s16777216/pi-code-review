## Context

See `proposal.md` - Why. Today there is no logging at all beyond the final thrown error (`ConfigError`, `GitLabApiError`, `ReviewFailureError`) that `main()` catches and prints. `GitLabClient.request()` (`src/gitlab/client.ts`) and `AgentReviewEngine.review()` (`src/review/engine.ts`) are the two places with anything worth logging: every outbound GitLab call, and the agent's prompt/raw response.

## Goals / Non-Goals

**Goals:**
- A logger that is silent by default and detailed under `--debug`, with no secret ever reaching it regardless of what a call site passes in.
- `pino`/`pino-pretty` usable directly by anyone who installs the published package, not only from source.

**Non-Goals:**
- Log levels beyond on/off (`--debug`). No `--log-level trace|debug|info` ladder — this change only needs a single switch.
- Structured log *files* or shipping logs anywhere (no log aggregation, no `pino` transport beyond `pino-pretty` to stderr). Debug output is for a human watching the terminal.
- Logging inside `GitLabSinkProvider`'s publish calls (creating discussions, the Code Quality report) — out of scope for this change; can be added later the same way if needed.

## Decisions

### Logger construction: one `Logger` built in `main()`, passed down as an optional constructor/options argument
`src/index.ts` builds a single `pino` instance per invocation (`buildLogger(debug: boolean)`), using `pino-pretty` as its transport only when `debug` is true; when `debug` is false, build a `pino` instance at `silent` level (cheapest no-op, avoids an `if (logger)` check at every call site). That instance is threaded through:
- `GitLabClient.create(options)` gains an optional `logger` field on `GitLabClientOptions` (defaults to a silent logger if omitted, so existing call sites/tests are unaffected).
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

## Risks / Trade-offs

- [Risk] A future call site logs a whole options/config object instead of picking specific fields, and that object happens to contain a token under a key name `redact`'s configured paths don't match (e.g. a typo'd header casing). -> Mitigation: `redact`'s paths cover the two secret-bearing shapes that exist today (`PRIVATE-TOKEN` header, `apiKey` field); the existing `index.test.ts` secret-leak test (`runReview never logs the OpenAI API key or the GitLab access token`) gets extended to also run with `--debug`/a real (non-silent) logger capturing output, so a new leak is still caught by a test even if `redact`'s path list is ever incomplete.
- [Risk] `pino-pretty` as a runtime dependency adds install size/transitive dependencies for every user, even the ones who never pass `--debug`. -> Accepted: this was the user's explicit decision (see proposal.md) — consistency of "the installed CLI always supports `--debug`" outweighs the install-size cost for a tool with few dependencies already.
