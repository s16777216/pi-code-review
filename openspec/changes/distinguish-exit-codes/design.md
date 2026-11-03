# Design

## Context

Facts in the current code (`src/cli/index.ts`):

- `runPublishCommand` returns `0` for a pass and `1` for a failed threshold.
- `runReviewCommand` returns `0`.
- Every error from either command, and from `main` for an unknown command, reaches one `catch` at the entrypoint. That `catch` logs the message and sets `process.exitCode = 1`.
- A discussion that fails to post is logged by the sink. It does not throw, and it does not change the exit code.

See `proposal.md` for the motivation. The project owner decided:

1. Keep `1` for a failed threshold, and use `2` for an error.

## Goals / Non-Goals

**Goals:**
- A CI job can tell a failed review gate from a failed tool by the exit code.

**Non-Goals:**
- Change which conditions are errors. A discussion that fails to post is still logged and does not change the exit code.
- Give each kind of error its own code.

## Decisions

### Decision 1: Code 2 for every error, in both commands

The entrypoint's `catch` sets `process.exitCode = 2`. That one place covers every error: configuration, the findings file, the GitLab and OpenAI APIs, a review failure, and an unknown command.

`review` uses the same code. Its exit code already means only "did the review complete", so moving its error from `1` to `2` does not change its meaning. One rule for both commands is simpler to document and to use in CI: `2` means that the tool failed.

The code is a named constant, `EXIT_ERROR = 2`, next to `EXIT_PASS = 0` and `EXIT_FAIL = 1`.

Alternative: `2` for `publish` only. Then `review` and `publish` would use different codes for the same kind of failure.

### Decision 2: The threshold decision is unchanged

`publish` still publishes every finding first, and then returns `0` or `1` from `decidePassFail`. `--fail-on none` still always returns `0` when no error happens.

## Risks / Trade-offs

- [A CI job checks for code `1` to detect a broken setup] → It must check for `2`. The README states the codes.
- [Code `2` is also what some shells use for a usage error] → That is also an error of the tool, so the meaning is the same.

## Migration Plan

No migration. A job that only checks for a non-zero code behaves as before.

## Open Questions

(none)
