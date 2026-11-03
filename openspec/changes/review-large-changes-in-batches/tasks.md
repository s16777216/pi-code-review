# Tasks

## 0. Prerequisite

- [ ] 0.1 Archive `limit-review-input-size`, `harden-review-engine-output`, `review-with-existing-discussions`, `publish-into-existing-discussions`, and `resolve-fixed-discussions`. Verify that `openspec/specs/ai-diff-review/spec.md` has "Fail before the model call when the input is too large" and the numbered version of "Build review input from the review context".

## 1. Split hunks

- [ ] 1.1 Add `splitHunks(diffText)` to `diff.ts`. It returns one diff text for each `@@` header, and drops text before the first header.
- [ ] 1.2 Add tests in `diff.test.ts` for: one hunk, three hunks, a "\ No newline" marker inside a hunk, and the line break at the end of the text. Verify that `numberDiffHunks` on each part prints the same numbers as on the full text. Verify with `npm test`.

## 2. Plan the batches

- [ ] 2.1 Add `src/core/review/batch.ts`. `planBatches(files, fits)` takes the changed files and a function that says whether a list of items fits the budget. It returns the batches (Decisions 2 and 3), or throws `ReviewFailureError` for a hunk that does not fit, or for more than 20 batches (Decision 7).
- [ ] 2.2 Add `src/core/review/batch.test.ts` with a `fits` function that counts lines, for: everything in one batch, path order, a file split into parts, a hunk that does not fit, and 21 batches. Verify with `npm test`.

## 3. Batch input

- [ ] 3.1 In `prompt.ts`, let `buildReviewPrompt` take an optional batch: its items and its number, and the number of batches. With a batch, add the file list (Decision 4) and use `### <path> (part <k> of <n>)` for a part. Without a batch, the output does not change.
- [ ] 3.2 In `engine.ts`, let `buildSystemPrompt` add the batch paragraph (Decision 4) only in batch mode.
- [ ] 3.3 Add tests in `prompt.test.ts` and `engine.test.ts` for: the single-run prompt does not change, the file list marks the batch's files, a part's heading, and the batch paragraph. Verify with `npm test`.

## 4. Runs, merge, and checks

- [ ] 4.1 Split `AgentReviewEngine.review` into a function that runs one agent and returns the parsed raw output, and a function that runs the checks on one merged output (Decision 6).
- [ ] 4.2 Estimate the full first request with `estimateContextTokens`. Run one agent when it fits half of the window, and otherwise plan the batches (Decision 1). Remove the old answer-room check, which `planBatches` replaces.
- [ ] 4.3 In batch mode, drop findings outside the batch's items with the reason `outside_batch` (Decision 5).
- [ ] 4.4 Merge the outputs in batch order, keep the first declaration for each discussion ID, and run the checks once (Decision 6).
- [ ] 4.5 Run at most 3 batches at the same time (Decision 7).
- [ ] 4.6 Retry a run that ends with `error`, at most 3 tries, with waits of 2 and 4 seconds that tests can replace (Decision 8).
- [ ] 4.7 When a run fails after its last try, abort the active runs, start no more runs, and throw `ReviewFailureError` with the batch number (Decision 9).
- [ ] 4.8 Log the number of batches at `info`, and add `batch` to the debug prompt and response lines in batch mode (Decision 10).
- [ ] 4.9 Add tests in `engine.test.ts` with the faux provider for: a small change runs once with the same prompt as before, a large change runs in batches, a finding outside its batch is dropped, a declaration in batch 1 linked by a finding in batch 2 is dropped, a duplicate declaration is merged, at most 3 active runs, a retry that passes, no retry for `length`, and a failed batch that aborts the rest and writes no output. Verify with `npm test`.

## 5. Docs

- [ ] 5.1 Add a "Large merge requests" section to `README.md`: when `review` splits, the fixed limits, the retry, and the cross-file limit. Verify that the section names the half-window budget, 20 batches, 3 parallel runs, and 2 retries.

## 6. Integration check

- [ ] 6.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 6.2 Run `openspec validate review-large-changes-in-batches --strict`. Verify that it reports no errors.
- [ ] 6.3 Run `review --debug` on a test merge request with `--context-window` and `--max-tokens` set low enough to need 3 batches. Verify that the log shows 3 batches, that every changed line is in one batch prompt, and that `publish` posts the findings.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
