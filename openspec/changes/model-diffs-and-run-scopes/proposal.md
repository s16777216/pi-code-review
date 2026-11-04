# Proposal

## Why

The review core keeps two pieces of knowledge in many places:

- **The diff is data without behavior.** `ChangedFileDiff.hunks` is raw text. Free functions such as `checkNewFileLine` and `getNewFileLineText` take the whole file list and parse the text again on every call. One finding can cause four parses. `keepOwnLines` joins hunk strings to check a batch.
- **"One run or one batch" is an optional parameter.** `batch?: PromptBatch` goes through `buildSystemPrompt`, `buildReviewPrompt`, the log fields, the merge, and the error text, and each of them checks `batch === undefined`.

## What Changes

- New value objects `ChangedFile` and `ChangeSet` in `core/review/`. They parse each diff once and answer questions about lines, text, numbering, counts, state, and parts. The engine builds the `ChangeSet` from `ReviewContext.changedFiles` at the start of a review. The host contract does not change.
- A new `RunScope` interface with two classes, `WholeChange` and `Batch`, replaces `batch?`. Each class gives its own system prompt paragraph, prompt, log fields, finding filter, and failure text.
- Characterization tests pin today's exact prompts and check results before the refactor.
- No behavior change. The prompts, the findings, the log lines, and the errors stay the same.

## Capabilities

### New Capabilities

(none). This is a refactor with no behavior change.

### Modified Capabilities

(none)

## Impact

- Affected code: `src/core/review/` (new `changedFile.ts` and `scope.ts`; `diff.ts`, `batch.ts`, `prompt.ts`, `checks.ts`, and `engine.ts`).
- Affected tests: `diff.test.ts`, `batch.test.ts`, `prompt.test.ts`, `engine.test.ts`, and new tests for the new files.
- No change to `ReviewContext`, the ports, the GitLab provider, the CLI, the findings file, or the docs.
