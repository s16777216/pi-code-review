## 1. Type and validation

- [x] 1.1 Add `endLine?: number` to `Finding` in `src/core/types.ts`. Make `validateFinding` reject an `endLine` that is not an integer or is less than `line`. Verify with new tests in `findings.test.ts` for a valid range, `endLine` equal to `line`, `endLine` less than `line`, and a non-integer `endLine`.
- [x] 1.2 Add the optional integer `endLine` to the `submit_review` schema in `agent.ts`. Verify with a test: a call with `line` 30 and `endLine` 20 is rejected, and no finding of that call is kept.
- [x] 1.3 Make `src/findingsFile.ts` read `endLine` through `validateStoredFinding`. Verify with tests: a file with `endLine` reads it, a file without `endLine` is valid, and a bad `endLine` stops `publish` with an error that names the index and the field.

## 2. Diff check, batch check, and anchor

- [x] 2.1 Add `rangeCheck(path, line, endLine)` to `ChangeSet`. Verify with tests in `changedFile.test.ts`: a range from a context line to a line outside the hunk is `ok`, a range fully outside the hunks is `line_not_in_diff`, and a single line gives the same result as `lineCheck`.
- [x] 2.2 Use `rangeCheck` in `runChecks` (`checks.ts`), and add `endLine` to the `warn` line of a discarded finding. Verify with an engine test for the two range scenarios of "Validate findings against the diff".
- [x] 2.3 Use the same range test in the batch filter (`batch.ts`). Verify with a test: a range that starts in part 1 and ends in part 2 is kept, and a range with no line in the batch's diff is dropped with `outside_batch`.
- [x] 2.4 Compute the anchor from the first visible line of the range. Verify with tests: a range that starts outside the diff uses the first visible line, and a single-line finding keeps its old anchor.

## 3. Prompts and later steps

- [x] 3.1 Make `get_file_content` return `<number> | <text>` for each line, and apply the 100,000-character limit to the numbered text. Verify with tests in `agent.test.ts` for the numbers and for the cut.
- [x] 3.2 Rewrite the line paragraph of `src/template/system/REVIEW.md` for ranges, as in "Tell the agent which line to report". Verify with the prompt test that checks each statement of that requirement.
- [x] 3.3 Show `endLine` in the input of the deduplication step, the verifier, and the verify agent. Verify with tests that each input holds the end line of a range finding, and that `applyVerdicts` and the verify agent keep `line` and `endLine`.
- [x] 3.4 Regenerate the golden file with `UPDATE_GOLDEN=1`. Verify that only the prompt texts and the numbered file content change.

## 4. Publish

- [x] 4.1 Add a method to `ChangeSet` that gives the old-file line of any new-file line, also outside the hunks. Verify with tests for a line before the first hunk, between two hunks, and after the last hunk.
- [x] 4.2 Send `position.line_range` from the GitLab client for a finding with `endLine`, with the position on `endLine`. Verify with client tests for the request body: `line_code`, `type`, `old_line`, and `new_line` of both ends.
- [x] 4.3 Group findings by `file`, `line`, and `endLine` in `publisher.ts`. Verify with a test: two findings on one line with different end lines give two discussions.
- [x] 4.4 Write the known limit in `docs/`: GitLab shows old-file numbers in the label of a range on unchanged lines. Verify that the page names the limit.

## 5. Check

- [x] 5.1 Run `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, and `npx tsc --noEmit`. Verify that all pass.
- [x] 5.2 Run `review` on MR 64 of project 10 with `--debug`, two times, and do not run `publish`. Record the `line` and the `endLine` of each finding about the race. Verify that the findings file is valid.
- [x] 5.3 Run `publish` of one range finding on MR 63 only after the user approves it. Verify in the GitLab page that the comment shows the range, then delete the comment.
- [x] 5.4 Run `openspec-sync-specs` to refresh the local `SPEC.md` files in the design. Ask the user to approve each file first.

Order: group 1 before groups 2 and 3, 2.1 before 2.2 and 2.3, 4.1 before 4.2, and group 5 last.

## Notes

- 5.2 result (2026-11-26, model `nemotron-3-ultra-550b-a55b`): run 1 reported the race finding as `line` 547, `endLine` 653 (`high`, confirmed), instead of line 553 before this change. Run 2 reported no finding. Two more runs with an extra prompt rule ("Use the smallest range that holds the problem") also reported no finding, so the rule was removed. Both findings files of the final prompt are valid. The missing findings are a variance of the model on MR 64, not a result of the range check.
