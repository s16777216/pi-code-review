## 1. Carry the review focus to the deduplication step

- [ ] 1.1 Add the optional fields `focus` (internal), `corroboration`, `verdict`, and `confidence` to `Finding` in `src/core/types.ts`. Write a test that `validateFinding` keeps `corroboration`, `verdict`, and `confidence` when they are valid, rejects other values, and does not keep `focus`.
- [ ] 1.2 In `AgentReviewEngine.review()`, set `focus` on each finding that comes from a run, when the engine merges the outputs. Write a test that a finding of the security run has the focus `security` after the merge and after `runChecks`.
- [ ] 1.3 Write a test that the prompts of the deduplication step, the verifier, and the verify agent do not name the focus of a finding. Fix `buildDedupPrompt`, `buildVerifyPrompt`, or the verify agent prompt only if the test fails.

## 2. Corroboration

- [ ] 2.1 In `dedup.ts`, compute the corroboration of the kept finding of each group: the number of distinct focuses in the group. A finding that no group holds, and every finding after a failed step, get `1`. Write tests for the three scenarios of "Record corroboration".
- [ ] 2.2 Remove the `focus` field from each finding at the end of the deduplication step, also when the step fails or makes no model call. Write a test for each of the three cases.

## 3. Confidence

- [ ] 3.1 Add a function that derives the confidence from the corroboration and the verdict, as the table in the spec says. Write a test for all 4 cells and for a missing verdict.
- [ ] 3.2 In `verify.ts`, set `verdict` and `confidence` on each kept finding in `applyVerdicts`. For a file whose verification failed or was skipped, set `confidence` with the verdict `uncertain` and leave `verdict` out. Write tests for both.
- [ ] 3.3 Check that `confidence`, `corroboration`, and `verdict` stay on a finding through the verify agent step (`applyDecisions`) and `runChecks`. Write a test.
- [ ] 3.4 Write `confidence`, `corroboration`, and `verdict` to the findings file, and read them in `findingsFile.ts`. A findings file with no `confidence` reads with no error. Write tests for both.
- [ ] 3.5 Check that `decidePassFail` gives the same result for a finding with any confidence. Write a test with severity `high`, threshold `high`, and the three confidences.

## 4. Comments

- [ ] 4.1 Add the placeholder `${confidence}` to the template filler. A finding with no confidence fills it with `unknown`. Write tests for a custom template and for an older finding.
- [ ] 4.2 Add the line `**Confidence**: ${confidence}` to `src/template/FINDING.md`, between the severity and the reason. Update the golden file and the test of the default comment.

## 5. Check and document

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass.
- [ ] 5.2 Run `review` on merge request 60 with `--debug`, and do not run `publish`. Verify that every finding in the findings file has `confidence` and `corroboration`, that no finding has `focus`, and that no prompt in the debug log names a focus in a finding.
- [ ] 5.3 Run `openspec-sync-specs` to refresh `src/core/review/SPEC.md` and `src/template/SPEC.md`. Ask the user to approve each file first. Verify with `openspec validate record-review-confidence --strict`.

Order: 1 before 2, 2 and 3.1 before 3.2, 3.2 before 3.3, 3.4 before 4, 4.1 before 4.2, and 5 last. Group 4 can go in a separate pull request after group 3.
