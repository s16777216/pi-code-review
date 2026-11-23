## 1. The rule in the judge prompt

- [x] 1.1 Rewrite the `not_fixed` and `uncertain` lines of `JUDGE_SYSTEM_PROMPT` in `judge.ts` as in Decisions 1 and 2. Keep the rule for a statement that the judge cannot check, for a case where no person decided that the problem stays.
- [x] 1.2 Update the tests of the prompt in `judge.test.ts` for the 7 scenarios of the delta spec. Verify that they pass.

## 2. The rule in the verify agent prompt

- [x] 2.1 Rewrite the `keep_open` paragraph of `VERIFY_AGENT_SYSTEM_PROMPT` in `verifyAgent.ts` with the same words as in 1.1.
- [x] 2.2 Update the tests of the prompt in `verifyAgent.test.ts` for the 8 scenarios of the delta spec. Verify that they pass.

## 3. Check and document

- [x] 3.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass. Run `UPDATE_GOLDEN=1` for the golden file only if that test fails because of the prompt text. The golden test can also fail by chance (the `INFOS` line has no sort), so run it again before you update the file.
- [x] 3.2 Run `openspec-sync-specs` for this change to refresh the main spec. Update the sentences about the judge and the verify agent in `docs/how-it-works.md`. Verify with `openspec validate keep-open-by-last-statement --strict`.

## 4. Test with the real model

- [x] 4.1 Run the judge on merge request 60 with whole-file runs, 8 times each, for `show.vue` line 590, `show.vue` line 652, `AttachmentUpload.vue` line 239, and `squad.vue` line 506. Record the counts. Expected: line 590 and line 239 never give `fixed`, and line 652 always gives `fixed`.
- [x] 4.2 Change the notes of `show.vue` line 652 in memory: the author declines first, and a later note says that the fix is done. Run the judge 8 times. Record the counts. Expected: `fixed`.
- [x] 4.3 Run `picr review` with `--debug` on merge request 60 one time, and do not run `publish`. Record the final decision for the four discussions of 4.1. These tests are not an acceptance gate, because the model answers differ between runs.

  Result of 4.1 and 4.2 (merge request 60, whole-file runs, 8 runs each unless noted): `show.vue` 590: 8 of 8 `not_fixed`. `show.vue` 652: 8 of 8 `fixed`. `AttachmentUpload.vue` 239: 24 of 24 `not_fixed` (8 and 16 runs). `squad.vue` 506: 8 of 8 `not_fixed`. 4.2: 8 of 8 `fixed`. A control case (decline, then a reply "fixed", code unchanged): 8 of 8 `not_fixed`. A first version with the rule as an extra sentence gave `fixed` for 239 in 9 of 24 runs. This led to Decision 5.

  Result of 4.3 (full run on merge request 60, no publish): the judge gave `not_fixed` for 590 and 506, `fixed` for 652, and `fixed` for 239. The verify agent resolved 652 and kept 239 open. 8 discussions were declared fixed, 7 were resolved, and 1 stayed open. No `warn` line.
