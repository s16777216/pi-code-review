## Context

`AgentReviewEngine.review()` in `src/core/review/engine.ts` runs three agents on each run scope, merges the output, and calls `runChecks` with a step function. The step function runs the deduplication step and then the verification step. `runWithRetries` and `runOnce` run any step through a `RunSpec<T>`. They retry only a final message with the stop reason `error`. A final message with `length` or `aborted` throws `ReviewFailureError` at once.

`runReview` in `src/cli/index.ts` calls `changeRequest.load()` and then `engine.review()`. An error from either call leaves `runReviewCommand` and exits with code 2. No file is written. `GitLabClient.request` in `src/providers/gitlab/client.ts` calls `fetch` once, and every method (read and write) uses it. `Publisher.publishUnreviewedNote` keeps one note with the marker `UNREVIEWED_MARKER`.

The model client `pi-ai` has the stream options `timeoutMs` and `maxRetries`. Its OpenAI client defaults the timeout to 10 minutes. Its `maxRetries` is 0 when unset. `pi-ai` also caps the answer of a call at the context window minus the estimated input minus 4096 tokens.

See `proposal.md` for the motivation and the files in `specs/` for the requirements.

## Goals / Non-Goals

**Goals:**
- Make a large review fail less often, without a result that looks complete when it is not.
- Show a failed review, and a degraded step, on the merge request.
- Keep an old findings file from reaching `publish` after a failed run.

**Non-Goals:**
- A partial review after a failed review run. The review stays all or nothing.
- A retry of a write request to GitLab.
- A fix for a verifier request that is too large. The step still skips that file with a warning.
- A setting for the number of tries or for the wait time.

## Decisions

### Decision 1: Keep the number of tries, and pass only the timeout to `pi-ai`

The engine gets the option `timeoutMs`. `streamFn` adds it to the stream options. The system does not set `maxRetries`, so it stays 0. The 3 tries of `runWithRetries` then cover everything, including a failure during the stream. A retry in `pi-ai` would multiply the tries and the waits.

Alternative: set `maxRetries` in `pi-ai` and lower our tries. This does not cover a stream that fails after it started, or a run with no accepted submission.

The timeout setting follows `--max-tokens`: the flag wins over the variable, and no value means no setting. A call that exceeds the timeout ends with the stop reason `error`, so it is retried like any other error. An unset value leaves the 10 minutes of the client.

### Decision 2: The retry for the token limit is a second outcome of a run

`runOnce` returns `{ cut: true }` for the stop reason `length`, in place of a throw. `runWithRetries` handles it. On the first `cut` it starts the run again with `createAgent` called with a model whose `maxTokens` is twice the setting. A second `cut` throws the `ReviewFailureError` with category `output_cut` and the existing message. The retry does not use a try of the loop, so an error after a cut still has its 3 tries.

`createAgent` of `RunSpec` gets a `maxTokens` argument. The review, deduplication, and verification specs all pass it to the `Agent` through the model. `pi-ai` caps the doubled value, so the engine does not compute a cap. If the cap equals the first limit, the retry fails again. This costs one call.

Alternative: a larger default for `--max-tokens`. A larger default helps only the case of this one model, and it can make the first answer take longer. The doubling is a fix that costs nothing when no run is cut.

### Decision 3: A warning is data in the result, and the step functions write it

`ReviewResult` gets `warnings: ReviewWarning[]`. A `ReviewWarning` is `{ code, file? }`. The engine creates an array in `review()` and passes it to `deduplicate` and `verify`. The code that already writes the `warn` log line for a degraded case also pushes the warning, so the log and the list cannot differ. The code `verification_skipped` replaces the current `warn` that says the request is too large. `verifyFile` gives the code `verification_failed` for a run that fails.

`deduplicate` catches `ReviewFailureError` from `runWithRetries` and returns the findings as they were. It does not catch other errors. A programming error must still stop the review.

### Decision 4: A review failure carries a category

`ReviewFailureError` gets an optional field `category` with the default `other`. The places that throw set it: `runWithRetries` and `runOnce` set `model_failed` or `output_cut`, and `batch.ts` sets `too_large`. A failure of a validation throws `ReviewFailureError` without a category, so it reads as `other`. A run that ends with no accepted submission after 3 tries is `model_failed`.

`runReview` catches an error from `engine.review()` only. It reads the category from a `ReviewFailureError` and uses `other` for any other error. It logs the full error at `error` level, builds the findings file with `failed: { category }`, and returns it. `runReviewCommand` writes the file, and returns `EXIT_ERROR`. An error from `changeRequest.load()` is not caught, because there are no `diffRefs` and no `source` yet. The catch must not hide an error in `loadReviewConfig`, or in `openChangeRequest`, for the same reason.

The category type is a union in `src/core/types.ts`, so `findingsFile.ts` and `publisher.ts` use the same names.

### Decision 5: `failed` and `warnings` are fields of the findings file

`FindingsFile` gets `warnings: ReviewWarning[]` and an optional `failed: { category }`. `writeFindingsFile` always writes `warnings`. It writes `failed` only for a failed review. `readFindingsFile` reads a missing `warnings` as an empty list and a missing `failed` as no failure. It validates the category and the codes, and rejects a warning of the code `verification_failed` or `verification_skipped` with no `file`, as the spec says.

A separate `error.json` was considered. It needs a second file, a rule for which file `publish` reads, and a rule to delete the file that is not current. One file has none of these problems.

`runReviewCommand` deletes the file at the output path with `rm(path, { force: true })`. It does this after the check for a merge request pipeline, and before it reads the settings and calls the host. Because of this, any later failure, also one before `diffRefs` exist, leaves no file.

### Decision 6: The unreviewed note becomes the review status comment, with the same marker

The marker stays `<!-- pi-code-review unreviewed -->`, in `marker.ts`. A comment that an older version posted is still found and updated. The body for the old cases stays the same, character by character: the list of files too large, and the sentence "Every changed file was reviewed in the latest review." Only the new cases add text.

`Publisher.publish` gets one argument object for the status: `{ failed, warnings, unreviewedFiles }`. `publishUnreviewedNote` becomes `publishStatusNote`. `formatUnreviewedBody` takes the three parts. The texts for the categories and the codes are constants in one module, so a template change in the future has one place to go. The texts are fixed. They hold only the paths of the files from the findings file.

The rule to post: post when the file has a failure, a warning, or a file too large. Without these, post only to update an existing comment. This is the rule in the spec, and it equals the old rule with two more inputs.

The templates in `src/template` do not change. The status comment does not use them, as before.

### Decision 7: `publish` handles a failed file as an empty review plus the comment

For a file with `failed`, `findings` and `resolved` are empty, so `Publisher.publish` posts no discussion and resolves none. It still posts the status comment. `runPublish` returns `false` (fail) when `failed` is set, so the exit code is 1. The existing severity-threshold decision does not change for a file without `failed`.

A review that failed is not a pass. If `publish` returned a pass, a CI job could show green for a merge request that no one reviewed. Exit code 2 is for an error of the tool itself, and `publish` did its job, so it uses 1.

### Decision 8: The GitLab retry is in `request`, for `GET` only

`GitLabClient.request` loops up to 3 times for `GET`. It retries when `fetch` throws, or when the status is 429 or 500 or more. It does not retry any other status. It waits 2 and 4 seconds. The client gets an optional `sleep` function so the test does not wait. For a method other than `GET`, `request` calls `fetch` once, as now.

The retry log line holds the method, the path (not the full URL with the query), the try number, and the cause. It never holds the headers.

An alternative was to retry each method separately. `request` is the one place that all calls pass, so the rule cannot be missed by a new method. A `Retry-After` header is not read. The fixed wait is simple and the numbers are small.

## Risks / Trade-offs

- [The error `fetch timed out waiting for response headers` may come from the Node fetch layer, not from the client timeout] → The `--timeout` setting then does not help for that error. Task 6.2 checks which layer throws it with a local test server. If the setting is not enough, a follow-up change sets the header timeout of the fetch dispatcher.
- [A doubled `--max-tokens` can be capped by `pi-ai` to the same value] → The retry fails the same way and costs one call. The failure message still names the settings.
- [`review` now exits with code 2 and writes a file] → The proposal marks this as BREAKING. The README says that a script must read the exit code, not the existence of the file.
- [`publish` exits with code 1 for a failed review] → A job that ran `publish` after a failed `review` fails with 1 and not 2. Both are non-zero. The README states it.
- [A degraded step shows only as a comment] → The log still has the details. The warning list is in the findings file, so a script can read it.
- [Deleting the old file at the start of `review`] → A person who ran `review` to check the old file with `publish` later loses it when a new run fails. This is the point: a stale result must not be published.

## Migration Plan

No data migration. An older findings file is valid for the new `publish`. A new findings file has extra fields that an older `publish` ignores, because unknown fields are ignored. An older `publish` then treats a failed file as an empty review and exits 0. Update `review` and `publish` together.

Rollback: revert the change. A comment with the new text stays on the merge request until the next run of the older version updates it.

## Open Questions

- Answered by task 6.2: the Node fetch layer throws `fetch timed out waiting for response headers`. The `undici` error code is `UND_ERR_HEADERS_TIMEOUT`, and the OpenAI SDK turns it into a message that says so. The default of Node is about 5 minutes. The `--timeout` setting does not lift this limit. It works for a value below 5 minutes. A model that sends no response headers for more than 5 minutes needs a follow-up change: a `fetch` with an `undici` dispatcher that has a larger `headersTimeout`, passed in the stream options. That needs a new dependency on `undici`, so this change does not do it.

## Pending local documentation

Done: `openspec-sync-specs` refreshed all five folder guides below from the implemented code, with the approval of the user.

The folder guides:
- `src/core/review/SPEC.md` (`ai-diff-review`): warnings, failure category, retry for the token limit.
- `src/cli/SPEC.md` (`review-cli`): the failure file, the deleted old file, the exit codes.
- `src/SPEC.md`: the findings file fields.
- `src/core/publish/SPEC.md` (`review-output`): the review status comment.
- `src/providers/gitlab/SPEC.md` (`gitlab-mr-context`): the retry of a read request.
