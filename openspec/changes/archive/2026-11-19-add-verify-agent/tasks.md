## 1. The verify agent module

- [x] 1.1 Create `src/core/review/verifyAgent.ts` with the system prompt, a function that picks the files to run, and `buildVerifyAgentPrompt`. The prompt has the three numbered lists and no discussion ID. Verify with unit tests: the lists, the replies of people, the evidence line, the `relatesTo` hint as a number, no ID, the notes framed as information, and the review instructions appended.
- [x] 1.2 Add the `submit_decisions` tool and `validateDecisions` in the same file. Reject a missing, repeated, or unknown number, an unknown decision, an empty reason, a `relatesTo` that is not in the file, a `drop` with a `relatesTo`, and a resolved discussion that a kept finding links to. Verify with a unit test for each rejection and one for a valid call.
- [x] 1.3 Add `applyDecisions`. It keeps or drops each finding and sets or removes `relatesTo`. It adds a `resolved` entry for each `resolve`. Verify with unit tests for each scenario of "Apply the decisions of the verify agent".

## 2. Engine and checks

- [x] 2.1 In `engine.ts`, add the verify agent step after the judgment step. Group by file, run the files in `runPool`, use the retry rules of the judge, and use the failure rule: keep the findings, resolve nothing, write one `warn` line. Skip a file with no discussion, and a file with nothing to decide. Verify with engine tests that use the faux provider for each scenario of "Decide the final result with the verify agent" and "Keep the earlier result when a verify agent run fails".
- [x] 2.2 Change `runChecks` in `checks.ts` so that the result comes from the verify agent step. Run `checkResolved` on each resolved discussion for the log only, with the fields `source` and `comparison`. Verify with tests that the `resolved` list does not change when the code check rejects, and that the `warn` line has both fields.
- [x] 2.3 Add the `info` summary line and the `debug` line for each decision. Verify with log-capture tests for the scenarios of "Log the verify agent step".

## 3. Test helpers and existing tests

- [x] 3.1 Add a helper to `fauxFocus.ts` that answers a verify agent call. The default answer keeps each finding with the discussion that its hint names, and resolves each declaration. Verify that the existing tests that do not care about the step keep their expectations.
- [x] 3.2 Update the tests that run a whole review with discussions: `judge.engine.test.ts`, `engine.test.ts`, `verification.test.ts`, and `characterization.test.ts`. Change an expectation only when the new step changes the result or the number of model calls. Update the golden file with `UPDATE_GOLDEN=1`. Verify that the file stays LF and that `npm test` passes.

## 4. Check and document

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there.
- [x] 4.2 Run `openspec-sync-specs` for this change to refresh the main spec and `src/core/review/SPEC.md`. Update the section "Discussion judgment" of `docs/how-it-works.md` and add a section for the verify agent. Verify with `openspec validate add-verify-agent --strict`.
- [x] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Record the summary line of the step, the number of dropped findings with their reasons, the number of resolved discussions, and each `warn` line with the field `comparison`. This task is not an acceptance gate, because the model answers differ between runs.
