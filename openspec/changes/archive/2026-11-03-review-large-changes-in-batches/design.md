# Design

## Context

Facts in the current code:

- `buildReviewPrompt` puts the title, the description, and the numbered diff of every changed file into one user prompt.
- `assertInputFits` estimates the first request with `pi-ai`'s `estimateContextTokens`. It fails the review when the answer room is less than 4,096 tokens, after a 4,096-token margin.
- `AgentReviewEngine.review` runs one `Agent`, parses its output, and then runs fixed checks in one function: `checkRelatesTo`, the diff line check, the anchor, and `checkResolved`.
- `ReviewContext.listDiscussions` is fetched once per review and cached. `get_file_content` and `list_discussions` are new tool objects for each run, with their own call limits.
- `pi-agent-core`'s `Agent` has `abort()`. Separate `Agent` objects share no state.
- In an end-to-end run on gitlab.com, one model call failed with `Request timed out`, and the same call passed when it was run again.

See `proposal.md` for the motivation. The project owner decided:

1. Do not move the diff into a tool.
2. Review a large merge request in batches, with a fixed merge, not with a coordinating agent.

## Goals / Non-Goals

**Goals:**
- Review a merge request that is too large for one run.
- Put every changed line into the input of exactly one run.
- Keep the existing checks and their results, by running them once on the merged output.
- Keep a small merge request on the current path.

**Non-Goals:**
- Find problems that need two files from different batches. A later change can add a cross-file pass.
- Make the batch limits configurable. Fixed values are enough until real runs show a need.
- Handle the `too_large` and `collapsed` fields of GitLab's diff API. That is a separate problem of the GitLab adapter.
- Remove duplicate findings inside one agent's output. That is not new with batches.
- Change the findings file or `publish`.

## Decisions

### Decision 1: The batch budget is half of the context window

The budget for the estimated first request of one run is `floor(contextWindow / 2)`. A review runs as one agent when the full first request is within the budget. Otherwise, it runs in batches.

The other half is for tool results and the answer. With the defaults (128,000-token window, 32,000 answer tokens), a batch at the budget still leaves about 28,000 tokens for tool results.

The same budget decides both cases. A first request between half of the window and the old limit used to run as one agent. It now runs in batches. That request left little room for tool results, so it was more likely to stop at the token limit.

Alternative: batch only when one run would fail the current check. This keeps the old behavior for more merge requests, but those runs keep the risk above.

### Decision 2: Pack files in path order

The planner sorts the changed files by path. It adds files to the current batch while the batch's estimated first request stays within the budget. When the next file does not fit, it starts a new batch. The result is the same for the same input.

Files in the same directory are next to each other in path order, so they usually share a batch.

The estimate uses `estimateContextTokens` on the batch's real first request: the system prompt, the tools, and the batch's user prompt. The size check therefore agrees with `assertInputFits`.

Alternative: optimal bin packing. It can save a batch in some cases. It also scatters a directory's files over batches, and it is harder to explain.

### Decision 3: Split a large file at hunk boundaries

When one file does not fit an empty batch, the planner splits its diff text at the `@@` headers. It packs the hunks in order, as in Decision 2. Each part becomes its own item, shown as `### <path> (part <k> of <n>)`.

`numberDiffHunks` prints absolute new-file line numbers from each `@@` header, so a part keeps the right numbers.

When one hunk does not fit an empty batch, the review fails before the first model call. The error names the file and the hunk's first new-file line. A cut hunk would hide changed code with no signal.

### Decision 4: Each batch's input

The user prompt of a batch has, in this order:

1. The title and the description, as today.
2. A list of every changed file: its path, whether it is added, deleted, or renamed, and its count of added and removed lines. The files of this batch are marked.
3. The numbered diffs of this batch's items.

In batch mode, the system prompt gets one more paragraph. It says that the change is split into `<n>` parts, that this run sees part `<k>`, that the agent reports only problems on its own diff lines, and that it can read any changed file with `get_file_content`. A single run keeps today's system prompt.

`get_file_content` already accepts any path in the context's changed files. That is the main way for a batch to see code in other batches.

### Decision 5: Keep each batch's findings on its own lines

After a batch's output is parsed, the engine keeps a finding only when its line is an added or context line in that batch's items. It checks with `checkNewFileLine` on the batch's items, so a part of a split file counts only its own hunks. Every other finding is dropped with a `warn` line that has the reason `outside_batch`.

Two batches therefore never report on the same line.

### Decision 6: Merge first, then run the checks once

The engine is split into two steps:

1. Runs: each run produces the parsed raw output, `{ findings, resolved }`.
2. Checks: on the merged output, the existing order: `checkRelatesTo`, the diff line check, the anchor, and `checkResolved`.

The merge joins the findings in batch order. It joins the fixed declarations in batch order and keeps the first one for each discussion ID. `checkResolved` then sees every finding of the review, so a declaration that a finding in another batch links to is dropped, as in a single run.

A single run uses the same two steps with one batch.

### Decision 7: At most 20 batches, at most 3 at a time

The planner fails the review before the first model call when it needs more than 20 batches. The error gives the number of batches and the context window. This puts a ceiling on the cost of one review.

At most 3 runs are active at the same time. The rest wait in batch order. This keeps the load on the model endpoint low.

Alternative: run every batch at the same time. Many endpoints limit requests per minute, and their errors then fail the review.

### Decision 8: Retry a run that ends with an error

When a run's final message has the stop reason `error`, the engine starts that run again with a new `Agent` and new tools, at most 2 more times. It waits 2 seconds before the first retry and 4 seconds before the second. Each retry writes one `warn` line with the batch number, the attempt, and the error message.

The stop reasons `length` and `aborted`, and output that cannot be parsed, are not retried. A retry with the same input is likely to give the same result.

With batches, one failed call fails the whole review, so the chance of a failure grows with the number of batches. The retry also helps a single run.

### Decision 9: One failed batch fails the review

When a run still fails after its retries, the engine calls `abort()` on the active runs, starts no more runs, and throws `ReviewFailureError` with the batch number and the cause. `review` exits with code 1 and writes no findings file.

Alternative: keep the results of the other batches. The findings of the failed batch would then be missing, and `publish` could decide pass for a change that has a problem.

### Decision 10: Logging

`review` writes one `info` line with the number of batches when it splits. Under `--debug`, each batch's prompt and response is logged as today, with the field `batch: <k>`. A single run logs as today, with no `batch` field.

## Risks / Trade-offs

- [A problem that needs files from two batches is missed] → Path order keeps a directory together, and `get_file_content` can read any file. A later change can add a cross-file pass.
- [Batches cost more tokens than one run] → Each batch sends the system prompt, the tools, and the file list again. Only a merge request over half of the window pays this.
- [A batch with only a part of a file misses context from the other parts] → The agent can read the whole file with `get_file_content`.
- [The estimate is wrong for some models] → The budget leaves half of the window free, and the existing `length` check catches the rest.
- [Retries hide a real outage for up to 6 seconds per run] → Each retry is logged, and the review still fails after the last retry.

## Migration Plan

No migration. No setting, file format, or command changes. A merge request that fits half of the window is reviewed as today.

## Open Questions

(none)
