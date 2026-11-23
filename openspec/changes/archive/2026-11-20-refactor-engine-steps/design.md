## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `RunLimit`, `runPool`, and three constants are exported from `engine.ts`. Only `sharedLimit.test.ts` imports them from outside the file.
- `verifyFile`, `judgeFile`, and `decideFile` share these actions: build the prompt, build the agent with `get_file_content` and one submit tool, call `oversizedFirstRequest`, call `runWithRetries`, and catch `ReviewFailureError`.
- The three methods differ in the prompt, the system prompt, the submit tool, the name of the tool, the `step` field of the log, the text of the two `warn` lines, and the warning code. Only `verifyFile` records a warning (`verification_skipped` and `verification_failed`).
- `verifyFile` also returns `null` when the file is not in the change. `judgeFile` and `decideFile` look up a deleted file by its old path.

## Goals / Non-Goals

**Goals:**
- Make `engine.ts` shorter and easier to read.
- Keep one copy of the flow of a run for one file.

**Non-Goals:**
- Change the behavior, a log line, a prompt, a warning code, or a test result.
- Move the methods of each step to the files of the steps. This is a later change.
- Change `runWithRetries`, `runOnce`, or the deduplication step.

## Decisions

### Decision 1: `runPool.ts` holds the pool

`RunLimit`, `runPool`, `MAX_PARALLEL_RUNS`, `REVIEW_PRIORITY`, and `STEP_PRIORITY` move as they are. `engine.ts` does not re-export them. `sharedLimit.test.ts` imports them from `runPool.ts`.

Alternative: keep a re-export in `engine.ts`. A re-export hides the real place of the code, so this change does not add one.

### Decision 2: One private method for one run of one file

The method `runForFile<T>` takes the agent builder, the prompt, the name of the tool, the `step` name, the file, the text of the two `warn` lines, and two optional callbacks, one for a skipped run and one for a failed run. It returns the result or `null`.

`verifyFile` passes callbacks that push `verification_skipped` and `verification_failed`. The other two methods pass no callback.

Each method keeps the work that is only its own: the lookup of the file, the prompt, the agent builder, and the use of the result (`applyVerdicts` for `verifyFile`).

Alternative: a class for each step. This adds more structure than the three methods need.

## Risks / Trade-offs

- A log line or warning code changes by mistake → The tests of the three steps check the warnings. `engine.stepWarns.test.ts` pins the `warn` lines of the three steps. It passes before the change and MUST pass after it, with no edit.
- The helper has many parameters → It has one object parameter with named fields. This is easier to read than the repeated code.

## Migration Plan

No data migration. To roll back, revert the commit.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (add `runPool.ts` to the entry points, with the approval of the user).

## Open Questions

- Whether to move the methods of each step to their own files. A later change decides this after this one.
