## 1. Review agent

- [x] 1.1 Remove `createListDiscussionsTool` and its types from `agent.ts`, and remove the tool from the tools of a review agent run in `engine.ts`. Verify with `tsc` and with a unit test that the tools of a review agent run are `get_file_content` and `submit_review` only.
- [x] 1.2 Remove `relatesTo` from the `submit_review` schema. The tool removes a `relatesTo` of a finding before it validates the finding, and accepts the call. Verify with unit tests that a call with a `relatesTo` is accepted, and that the returned finding has no `relatesTo`.
- [x] 1.3 Remove the paragraph about discussions and the sentence about `relatesTo` from `SYSTEM_PROMPT` in `engine.ts`. Verify with a unit test that the prompt has no sentence about discussions, no `list_discussions`, and no `relatesTo`.

## 2. Checks and verify agent

- [x] 2.1 Remove `checkRelatesTo` and its call from `runChecks` in `checks.ts`. Verify that `checks.judge.test.ts` and the engine tests have no test of the two `warn` lines, and that `tsc` passes.
- [x] 2.2 Remove the field `linkedDiscussion` from the findings list in `buildVerifyAgentPrompt`. Change the default answer of the faux helper in `fauxFocus.ts`: it keeps each finding with `relatesTo` `null` and resolves each declaration. Verify with a unit test that the prompt has no `linkedDiscussion`.

## 3. Tests and golden file

- [x] 3.1 Update the tests that use the discussion tool or a `relatesTo` of a review agent: list them with a search for `list_discussions` and `relatesTo` in `*.test.ts`. A test of the verify agent that sets `relatesTo` stays. A test that needs a `relatesTo` on a finding in the output of a review agent uses a verify agent script instead.
- [x] 3.2 Add the tests of the new requirement: no tool, no prompt text, an ignored `relatesTo`, and a failed verify agent run that leaves a finding with no `relatesTo`.
- [x] 3.3 Run `UPDATE_GOLDEN=1` for the golden file only if the test fails. Verify that the only change is the removed text of the system prompt and of the tool list, that the file stays LF, and that `npm test` passes.

## 4. Check and document

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there.
- [x] 4.2 Run `openspec-sync-specs` for this change to refresh the main spec and `src/core/review/SPEC.md`. Update `docs/how-it-works.md`: change the section "Existing discussions" and the section of the review agents. Verify with `openspec validate remove-discussions-from-review-agent --strict`.
- [x] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Record the number of calls of the review agents, the summary line of the verify agent step, and the findings that the verify agent drops with their reasons. This task is not an acceptance gate, because the model answers differ between runs.
