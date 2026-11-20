## 1. Selection and checks

- [x] 1.1 Change `selectDiscussions` in `judge.ts` to take the discussions only. Remove the second parameter and the `relatesTo` rule. Verify with unit tests that a discussion that a finding used to link to is now selected, and that the other selection rules are unchanged.
- [x] 1.2 Change the judgment step type in `runChecks` in `checks.ts` to a function with no argument. Change `judgeDiscussions` in `engine.ts` to take no findings. Verify with `tsc`.
- [x] 1.3 Verify with a test of `runChecks` that a `fixed` judgment for a discussion that a remaining finding links to is dropped with `linked_by_finding` and the field `source`. Use a file where the anchor is gone.

## 2. Engine tests

- [x] 2.1 Update the tests that expect no judge run for a linked discussion, in `judge.engine.test.ts` and `engine.test.ts`. List them with a search for `relatesTo` in these files. A test of another selection rule stays valid.
- [x] 2.2 Add an engine test: a file where one finding links to the only open discussion still gets a judge run, and a `fixed` judgment gives an empty `resolved` and one `warn` line with `linked_by_finding`.
- [x] 2.3 Run `UPDATE_GOLDEN=1` for the golden file only if the test fails. Verify that the file stays LF and that `npm test` passes.

## 3. Check and document

- [x] 3.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there.
- [x] 3.2 Run `openspec-sync-specs` for this change to refresh the main spec and `src/core/review/SPEC.md`. Update the section "Discussion judgment" of `docs/how-it-works.md`, and change `docs/review-flow.html` so that the judge has no arrow from the findings. Verify with `openspec validate decouple-judge-from-findings --strict`. (The diagram is on the branch docs/fix-review-flow-arrows and already shows the judge with no arrow from the findings.)
- [x] 3.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Verify that the summary line selects every open discussion from this tool, and that each `linked_by_finding` drop has the field `source`. This task is not an acceptance gate, because the model answers differ between runs.
