# Tasks

## 1. Number the diff lines in the review input

- [ ] 1.1 Add `numberDiffHunks(hunks)` to `src/core/review/diff.ts`. Add tests in `diff.test.ts` for a context line, an added line, a removed line, and a second hunk. Verify with `npm test`.
- [ ] 1.2 Use `numberDiffHunks` in `buildReviewPrompt` (`prompt.ts`). Update `prompt.test.ts` to check that the new-file line numbers appear and that removed lines have none. Verify with `npm test`.
- [ ] 1.3 Add one sentence to `SYSTEM_PROMPT` in `engine.ts`. The sentence says the number before `|` is the new-file line number, is not code, and goes in `line`. Add a test in `engine.test.ts` that the system prompt contains it. Verify with `npm test`.

## 2. Keep valid findings when one finding is invalid

- [ ] 2.1 Change `parseFindings` in `findings.ts` to take an optional `logger`. Make it skip an invalid element and log one `warn` line with the element index and the reason. Keep the throw for non-JSON text and for a non-array value.
- [ ] 2.2 Update `findings.test.ts`. Replace the two tests that expect a throw for one bad finding. Add tests for: two valid and one invalid element, all elements invalid, and a `warn` log call for each drop. Keep the tests for non-JSON text and a JSON object. Verify with `npm test`.
- [ ] 2.3 Pass the engine's logger to `parseFindings` in `engine.ts`. Add a test in `engine.test.ts` where the faux agent returns one bad finding and one good finding. Verify that the engine returns the good finding.

## 3. Log each discarded finding

- [ ] 3.1 Add `checkNewFileLine(files, path, line)` to `diff.ts`. It returns `'ok'`, `'file_not_changed'`, or `'line_not_in_diff'`. Make `isValidNewFileLine` call it. Add tests in `diff.test.ts` for all three results. Verify with `npm test`.
- [ ] 3.2 Use `checkNewFileLine` in `engine.ts`. Log one `warn` line with `file`, `line`, and `reason` for each discarded finding. Add tests in `engine.test.ts` for an unchanged file and for a line outside the diff. Verify that the log call happens and that the finding is not returned.

## 4. Integration check

- [ ] 4.1 Run `npm run build` and `npm test`, as `openspec/VERIFY.md` requires. Verify that both commands exit with code 0.
- [ ] 4.2 Run `openspec validate harden-review-engine-output --strict`. Verify that the command reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
