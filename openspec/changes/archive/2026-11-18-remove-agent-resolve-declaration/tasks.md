## 1. Review agent

- [x] 1.1 Remove the `resolved` field and its validation from `createSubmitReviewTool` in `agent.ts`. Change the tool description and the rejection texts so that they name findings only. Verify with unit tests that the parameters have only `findings`, and that a call with a `resolved` array and one valid finding is accepted and gives no declaration.
- [x] 1.2 Remove the paragraph about declaring a discussion fixed from `SYSTEM_PROMPT` in `engine.ts`. Change the output description so that `submit_review` has one field. Verify with a unit test that the prompt has no sentence about declaring a discussion fixed and no `resolved` field.
- [x] 1.3 Remove `resolved` from `ParsedReviewOutput` in `findings.ts`. Keep `validateResolvedDiscussion`, because `findingsFile.ts` uses it. Verify with `tsc` and with the tests of `findingsFile.ts`.

## 2. Checks and judge

- [x] 2.1 Change `selectDiscussions` in `judge.ts` to take the discussions and the findings only. Verify with unit tests that a discussion that was once declared by an agent is now selected, and that the other selection rules are unchanged.
- [x] 2.2 Change `runChecks` in `checks.ts` to take the findings and the judgment step. The step takes the remaining findings only. Remove `declaredIds`, the merge of declarations, and the code that marks the IDs that come only from the judge. Give the evidence line and the `source` field to each judge declaration. Verify that `checks.judge.test.ts` has no test that uses an agent declaration, and that the tests for evidence lines and for `source` pass.
- [x] 2.3 Change `review()` in `engine.ts`: remove `resolvedById` and call the judgment step with the remaining findings. Verify with an engine test that a review with no judge declaration returns an empty `resolved`, and that a `fixed` judgment still resolves a discussion whose anchor is gone.

## 3. Tests and golden file

- [x] 3.1 Update the test helpers in `fauxFocus.ts` and the tests that use agent declarations. List them with a search for `resolved` in `*.test.ts`. A test that checks the behavior of the check on declarations uses a judge declaration. A test that only passes `resolved: []` stays valid, so leave it.
- [x] 3.2 Add the tests of the new requirement: no declaration field in the tool, no declaration sentence in the prompt, an ignored `resolved` array, and the judge as the only source.
- [x] 3.3 Regenerate `src/core/review/__golden__/review-output.txt` with `UPDATE_GOLDEN=1`. Verify that the only change is the removed text of the system prompt, that the file stays LF, and that `npm test` passes.

## 4. Check and document

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that each command passes. If a command fails, compare with the base branch and name each failure that already exists there.
- [x] 4.2 Archive `judge-evidence-line` first. Then run `openspec-sync-specs` for this change to refresh the main spec and `src/core/review/SPEC.md`. Update `docs/how-it-works.md`: remove the declaration from the review agents section and the rule about agent declarations from the discussion judgment section. Verify with `openspec validate remove-agent-resolve-declaration --strict`, which must show no archive warning.
- [x] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Verify that the log shows no `resolved` from a review agent, that the summary line of the judgment step selects every open discussion without a finding link, and that a judge declaration still resolves.
