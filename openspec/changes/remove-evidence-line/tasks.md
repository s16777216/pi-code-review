## 0. Gate

- [ ] 0.1 Check the gate of Decision 1 in `design.md`. A person reads each `warn` line with the field `comparison` of at least 3 reviews on real merge requests, and judges each resolve of the verify agent. Record the number of reviews, the number of lines, and the result in this task. Do not start task group 1 when any resolve is judged wrong.

## 1. Judge and verify agent

- [ ] 1.1 Remove the `evidence` field from `judge.ts`: the schema, the type, the validation, the sentence in `JUDGE_SYSTEM_PROMPT`, and the tool description. `validateJudgments` removes an `evidence` that a model sends and does not throw. Verify with unit tests that a call with an `evidence` is accepted and that the judgment has no `evidence`, and that the prompt has no sentence about an evidence line.
- [ ] 1.2 Remove the evidence line from `verifyAgent.ts`: the field `evidence` of `DeclarationInput`, the field `evidenceLine` in the prompt, and the words about the evidence line in the system prompt. Verify with unit tests that the prompt of a declaration has the reason and no `evidenceLine`.
- [ ] 1.3 Change `judgeDiscussions` in `engine.ts` to return declarations with the discussion ID and the reason only, and remove the type `JudgedDeclaration`. Verify with `tsc`.

## 2. Checks

- [ ] 2.1 Remove `checkResolved`, `evidenceProblem`, `normalizeLine`, `MIN_EVIDENCE_LENGTH`, and the rejection types from `checks.ts`. `runChecks` returns the result of the verify agent, and it no longer takes `context`. Change its callers. Verify that `tsc` passes and that no `warn` line with the field `comparison` is written.
- [ ] 2.2 Add an engine test: the verify agent resolves a discussion whose anchored line is still in the file, and the result has the entry, with no `warn` line and no file read by the system for the check.

## 3. Tests and golden file

- [ ] 3.1 Remove the tests of the evidence line and of the code check in `checks.judge.test.ts`, `judge.test.ts`, `judge.engine.test.ts`, and `engine.test.ts`. List them with a search for `evidence` and `comparison`. Update a test that only used the code check as a means to another end.
- [ ] 3.2 Update the faux helpers if they send or read an evidence line. Run `UPDATE_GOLDEN=1` for the golden file only if the test fails. Verify that the file stays LF and that `npm test` passes.

## 4. Check and document

- [ ] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that build, test, and lint pass. If `format:check` fails, compare with `master` and name each failure that already exists there.
- [ ] 4.2 Run `openspec-sync-specs` for this change to refresh the main spec and `src/core/review/SPEC.md`. Update `docs/how-it-works.md` and `docs/review-flow.html`. Remove the term `evidence line` from `openspec/GLOSSARY.md`. Verify with `openspec validate remove-evidence-line --strict`.
- [ ] 4.3 Smoke test: run `picr review` with `--debug` on merge request 60, and do not run `publish`. Record the summary lines of the judgment step and of the verify agent step. This task is not an acceptance gate, because the model answers differ between runs.
