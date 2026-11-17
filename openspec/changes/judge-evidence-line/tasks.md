## 1. Judge module

- [ ] 1.1 Add the optional `evidence` to the `submit_judgments` schema as a string or `null`, and to `DiscussionJudgment` in `judge.ts`. `validateJudgments` checks the type, trims a string, and removes a blank value, `null`, a value that is not a string, and the evidence of a judgment that is not `fixed`. It never throws for `evidence`. Verify with unit tests for each of these inputs and for a valid `fixed` evidence.
- [ ] 1.2 Update `JUDGE_SYSTEM_PROMPT` and the tool description. Add the evidence line rules: copy one line of the current file, no line number, not the line of the problem, not a line from a note. Change the sentence "exactly these fields" so that it lists the optional `evidence`. Verify with unit tests that the prompt has the words "evidence", "line number", and "note", and that it lists `evidence` as an optional field.

## 2. Checks

- [ ] 2.1 Add the evidence check to `checkResolved` in `checks.ts` as a second way to pass the anchor check. Trim the file line and the evidence line. The evidence line is valid when it has no line feed, the string length of the trimmed text is at least 8, it equals a whole file line, and it has another anchor than the discussion. Verify with unit tests for each scenario of "Accept a judged declaration by its evidence line": valid line, anchor gone with an invalid evidence line, line not in the file, part of a line, two lines, too short, anchored line, changed indent, CRLF file. Also verify an unreadable file with an evidence line, and a deleted file with an evidence line.
- [ ] 2.2 Change `judgeDiscussions` to return `ResolvedDiscussion & { evidence?: string }` items. In `runChecks`, build a map from ID to evidence for the judge-only declarations, and pass it to `checkResolved` in place of the set `judgedIds`. Strip `evidence` from the result. Verify that the existing `checks.judge.test.ts` tests pass with no change. Verify with a test that an agent and the judge that declare the same `d1` with a present anchor and a valid evidence line give `anchor_still_present` and no `source` field.
- [ ] 2.3 Add the reason `evidence_not_valid` with the log field `evidence`, and the `info` line for an accepted evidence line. Keep `source: 'discussion_judgment'` on each drop of a judge declaration. Add `info` to the logger stubs of the tests. Add it only, and do not change an existing assertion. Verify with log-capture tests for the three lines.

## 3. Engine

- [ ] 3.1 Make `engine.ts` copy the `evidence` of a `fixed` judgment into its declaration. Verify with an engine test that a `fixed` judgment with a valid evidence line, on a file that keeps the anchored line, is in `resolved`.
- [ ] 3.2 Verify with a test that `findings.json` has no field for the evidence line. Verify that the existing judgment tests pass with no change in their expectations.
- [ ] 3.3 Add an end-to-end faux test with four `fixed` judgments: the anchor gone with no evidence, a valid evidence line, an evidence line that is not in the file, and no evidence with the anchor present. Verify that the first two resolve. Verify that the last two drop with `evidence_not_valid` and `anchor_still_present`.

## 4. Check and document

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that each command passes. If a command fails, compare with the base branch and name each failure that already exists there.
- [ ] 4.2 Run `openspec-sync-specs` to refresh `src/core/review/SPEC.md`, and update the section "Discussion judgment" of `docs/how-it-works.md`. Verify that both files name the evidence line.
- [ ] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Verify the `fixed` judgments that the anchor check dropped before. Record how many now resolve, and check that the log has one `info` line for each of them. This task is not an acceptance gate, because the model answers differ between runs.
