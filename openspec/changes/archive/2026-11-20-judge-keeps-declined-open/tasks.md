## 1. The rule in the prompt

- [x] 1.1 Extend the `not_fixed` sentence in `JUDGE_SYSTEM_PROMPT` in `judge.ts` with the decision to defer. Verify with a unit test in `judge.test.ts`.
- [x] 1.2 Add the rule for `uncertain` for a statement that the judge cannot check. Verify with a unit test that the prompt names it.
- [x] 1.3 Verify with a unit test that the prompt still gives `fixed` when the code changed to fix the problem.

## 2. Check and document

- [x] 2.1 Run `npm run build`, `npm test`, and `npm run lint`. Verify that all pass. Run `UPDATE_GOLDEN=1` for the golden file only if the test fails.
- [x] 2.2 Run `openspec-sync-specs` for this change. Add one sentence to the section "Final decisions" of `docs/how-it-works.md`. Verify with `openspec validate judge-keeps-declined-open --strict`.
- [x] 2.3 Smoke test: run `picr review` with `--debug` on merge request 60 two times, and do not run `publish`. Record the judgment of the judge for `show.vue` line 590 and `squad.vue` line 506, and the final decision of the verify agent. This task is not an acceptance gate.

  Result (merge request 60, two runs): `show.vue` 590 and `AttachmentUpload.vue` 239 got `not_fixed` from the judge in both runs, so neither reached the verify agent. `squad.vue` 506 got `fixed` in run 1 (the reason cites code and the claim of the author about the backend) and the verify agent resolved it. In run 2 it got `not_fixed` (the author did not accept the finding), so it stayed open. Rule followed in 5 of 6 cases; the `uncertain` rule was not exercised.
