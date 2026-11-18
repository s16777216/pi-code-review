## 1. Judge module

- [x] 1.1 Create `src/core/review/judge.ts` with the system prompt, the statement for review instructions, and `buildJudgeSystemPrompt`. Verify with unit tests that the prompt has the rules for data framing, `not_fixed` on a reply that keeps the problem, a quoted reason, the line and commit rule, and the deleted file rule. Add a test that the review instructions follow the statement and do not change the output format.
- [x] 1.2 Add `groupDiscussionsByFile` and `selectDiscussions` to `judge.ts`. They keep only discussions that are from this tool, not resolved, have an anchor, have no remaining finding with `relatesTo` equal to them, and have a file, and are not in the IDs that the review focus agents declared, also when `checkResolved` later drops that declaration. Verify with unit tests for each selection scenario in the spec.
- [x] 1.3 Add `buildJudgePrompt`. It gives the title, the description, the diff of the file when the change has it, and the numbered discussions with the line, the commit, and the author and body of each note. Verify with unit tests that the notes come from `ReviewDiscussion.notes`, that the prompt has no discussion ID, that the prompt has the commit of each line, that a file the change does not include has no diff, that a null line or commit is stated as not known, and that an omitted diff is stated as omitted.
- [x] 1.4 Add the `submit_judgments` tool and `validateJudgments`. They reject a missing, repeated, or unknown number, an unknown value, and an empty reason. Verify with unit tests for each rejection scenario.

## 2. Engine

- [x] 2.1 Move the check on the size of the first request from `verifyFile` into a shared helper in `engine.ts`. Verify that the existing verification tests and the golden file pass with no change.
- [x] 2.2 Add `judgeFile` and `judgeDiscussions` to `engine.ts`. One run for each file uses `runPool` and `runWithRetries`. A failed run, or a first request that is too large, writes a `warn` line, gives no declaration for the file, and adds no warning to the result. The step reads the discussions through the cached `context.listDiscussions()` and does not fetch them again. Verify with tests that the review does not fail, that the other files are still judged, and that a run that stops with `length` on the retry, or with `aborted`, gives no declaration and a `warn` line and does not fail the review. Also verify that a first request larger than half of the context window makes no model call and gives a `warn` line.
- [x] 2.3 Verify the shared run rules with tests: at most 3 judge runs are active at the same time, and a judge run with a first try that ends with the stop reason `error` is tried again and its retry log line names the file.
- [x] 2.4 Add the optional `judgeDiscussions` step to `runChecks` in `checks.ts`. It runs after `betweenSteps`, receives the remaining findings and the IDs that the review focus agents declared, and returns declarations. `runChecks` appends them after `output.resolved` and keeps the first declaration for each discussion ID. Verify with a test that a declaration of a review focus agent wins and that `betweenSteps` callers are unchanged.
- [x] 2.5 Add a test that the step makes no model call when no discussion is selected, and when `listDiscussions` returns an error object.
- [x] 2.6 Pass the IDs that came from the judge to `checkResolved`. A dropped declaration of such an ID gets the log field `source` with the value `discussion_judgment`. Verify with a test that a `fixed` judgment on an unchanged anchored line is dropped with the reason `anchor_still_present` and that log field. Add a test that a `fixed` judgment on a file that the change deletes is accepted and that `checkResolved` does not read the file.
- [x] 2.7 Call the step from `AgentReviewEngine.review()` after the verification step. Verify with a test that a discussion linked only by a finding that the verification step drops is selected.

## 3. Logging

- [x] 3.1 Write the `info` summary line, one `info` line for each `fixed` judgment, and, with `--debug`, one `debug` line for each judgment. Verify with log-capture tests for the summary (also when a file run fails), the `fixed` line, and the debug lines.
- [x] 3.2 Verify that `findings.json` has no field for a judgment, with a test on the written file.

## 4. Test helpers and golden file

- [x] 4.1 Teach `fauxFocus.ts` to answer a judge run, so that the existing multi-agent tests do not stop on the new step. Verify that `npm test` passes with no change in the existing expectations.
- [x] 4.2 Add an end-to-end engine test with a faux model that gives `fixed`, `not_fixed`, and `uncertain` judgments. Verify that only the `fixed` discussion whose anchor is gone appears in `resolved`, and that the `fixed` discussion whose anchor is still present is dropped with the logged source.
- [x] 4.3 Regenerate `src/core/review/__golden__/review-output.txt` with `UPDATE_GOLDEN=1` only if a prompt in it changed on purpose. Verify that the file stays LF and that `npm test` passes.

## 5. Check and document

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that all four pass. (build and lint pass. test and format:check fail only on causes that exist before this change: the uncommitted `FINDING.md` and CRLF line ends.)
- [x] 5.2 Run `openspec-sync-specs` to refresh `src/core/review/SPEC.md`, and update `docs/how-it-works.md` with the new step. Verify that both files name the discussion judgment step.
- [x] 5.3 Optional smoke test: run `picr review` with `--debug` on a merge request with open discussions from this tool, and do not run `publish`. Verify that the log has the summary line and one judgment for each selected discussion.
