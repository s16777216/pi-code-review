# Proposal

## Why

`review` sends the whole numbered diff in one request. When the merge request is too large for the model's context window, the review fails before the model call (`limit-review-input-size`). A large merge request therefore gets no review at all.

A request that fits only just is also a problem. `pi-ai` caps the answer at the context window minus the input and a 4,096-token margin. A first request that uses most of the window leaves little room for `get_file_content` results and for the answer, so the run is more likely to stop at the token limit.

Giving the agent a tool to read diffs on demand does not solve this. The agent loop keeps every tool result in the transcript, so the input grows to the same size when the agent reads every file. When the agent does not read every file, part of the change gets no review, with no signal.

## What Changes

- When the first request of a single run would use more than half of the context window, `review` splits the changed files into batches. Each batch runs in its own agent, with a first request of at most half of the window.
- Files are packed into batches in path order, so files in the same directory usually share a batch. A file that is larger than one batch is split at its hunk boundaries.
- Each batch's input has the change's title and description, a list of every changed file, and the numbered diffs of its own files. `get_file_content` can still read any changed file.
- The engine keeps only the findings on lines of the batch's own diff. Then it merges the batches' outputs and runs the existing checks once, on the merged output.
- At most 3 batches run at the same time. A review that needs more than 20 batches fails before the first model call.
- A model run that ends with an error is tried again, at most 2 more times. This applies to a single run too.
- When a batch still fails, the other runs are stopped and the review fails. No findings file is written.
- A review with a smaller input runs as one agent, as today.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Modified: "Build review input from the review context" — the input of every run has the title and description, and every changed file's diff is in the input of exactly one run.
  - Modified: "Fail before the model call when the input is too large" — fails only when a batch cannot be built, or when more than 20 batches are needed.
  - Added: "Split a large review into batches".
  - Added: "List every changed file in each batch's input".
  - Added: "Limit parallel batch runs".
  - Added: "Split a file larger than one batch at hunk boundaries".
  - Added: "Keep each batch's findings on its own diff lines".
  - Added: "Run the checks once on the merged output".
  - Added: "Retry a model run that ends with an error".
  - Added: "Fail the review when a batch fails".

## Impact

- Depends on: `limit-review-input-size`, `harden-review-engine-output`, `review-with-existing-discussions`, `publish-into-existing-discussions`, and `resolve-fixed-discussions`. This change modifies requirements that those changes add or modify, so they must be archived first.
- Affected code: `src/core/review/diff.ts` (split hunks), new `src/core/review/batch.ts` (plan the batches), `src/core/review/prompt.ts` (file list and batch note), `src/core/review/engine.ts` (runs, retry, merge, checks).
- Affected tests: `diff.test.ts`, new `batch.test.ts`, `prompt.test.ts`, `engine.test.ts`.
- Affected docs: `README.md`, a new section on large merge requests.
- The findings file format does not change, so `publish` is not affected.
- No new setting: the half-window budget, the 20-batch limit, the 3 parallel runs, and the 2 retries are fixed values.
- A merge request whose first request is between half of the window and the old limit was reviewed in one run. It is now reviewed in batches.
