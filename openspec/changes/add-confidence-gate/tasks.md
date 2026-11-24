## 1. Carry the review focus to the deduplication step

- [ ] 1.1 Add the optional fields `focus` (internal), `corroboration`, `verdict`, and `confidence` to `Finding` in `src/core/types.ts`. Write a test that `validateFinding` keeps `corroboration`, `verdict`, and `confidence` when they are valid, and rejects other values.
- [ ] 1.2 In `AgentReviewEngine.review()`, set `focus` on each finding that comes from a run, when the engine merges the outputs. Write a test that a finding of the security run has the focus `security` after the merge and after `runChecks`.
- [ ] 1.3 Write a test that the prompts of the deduplication step and the verifier do not contain the focus of a finding. Fix `buildDedupPrompt` and `buildVerifyPrompt` only if the test fails.

## 2. Corroboration

- [ ] 2.1 In `dedup.ts`, compute the corroboration of the kept finding of each group: the number of distinct focuses in the group. Findings that no group holds, and a failed step, give `1`. Write tests for the three scenarios of "Record corroboration".
- [ ] 2.2 Remove the `focus` field from each finding at the end of the deduplication step, so it never reaches a later prompt or the findings file. Write a test.

## 3. Confidence

- [ ] 3.1 Add a function that derives the confidence from the corroboration and the verdict, as the table in the spec says. Write a test for all 4 cells and for a missing verdict.
- [ ] 3.2 In `verify.ts`, set `verdict` and `confidence` on each kept finding in `applyVerdicts`. For a file whose verification failed or was skipped, set `confidence` with the verdict `uncertain` and leave `verdict` out. Write tests for both.
- [ ] 3.3 Check that `confidence`, `corroboration`, and `verdict` stay on a finding through the verify agent step (`applyDecisions`) and `runChecks`. Write a test.
- [ ] 3.4 Write `confidence`, `corroboration`, and `verdict` to the findings file, and read them in `findingsFile.ts`. A findings file with no `confidence` reads as `high`. Write tests for both.

## 4. The gate

- [ ] 4.1 Add `failOnConfidence` to the configuration of `publish` (`FAIL_ON_CONFIDENCE`, `--fail-on-confidence`, default `low`). An invalid value stops `publish` with exit code 2 before it posts. The `review` command MUST reject the flag. Write tests.
- [ ] 4.2 Change `decidePassFail` to use both thresholds, as "Gate on severity and confidence together" says. Keep the existing tests unchanged with the default. Write tests for the four scenarios of that requirement.
- [ ] 4.3 In `publish`, count the findings that meet the severity threshold but not the confidence threshold. Write the count to the `info` log line of the result.

## 5. Comments

- [ ] 5.1 Add the placeholder `${confidence}` to the template filler and a `**Confidence**: ${confidence}` line to `src/template/FINDING.md`. Update the golden file and the test of the default comment.
- [ ] 5.2 Add the count line to the review status comment and create the comment when the count is more than 0. Write tests for the scenarios of "Keep one review status comment".

## 6. Check and document

- [ ] 6.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass.
- [ ] 6.2 Run `picr review` on merge request 60 with `--debug`, and do not run `publish`. Verify that the findings file has `confidence` and `corroboration` for each finding, and that no prompt in the debug log has a focus name in a finding.
- [ ] 6.3 Run `openspec-sync-specs` to refresh `src/core/review/SPEC.md`, `src/template/SPEC.md`, and the `README` setting list. Ask the user to approve each file first. Verify with `openspec validate add-confidence-gate --strict`.

Order: 1 before 2, 2 and 3.1 before 3.2, 3.4 before 4.1, 4.2 before 4.3 and 5, and 6 last. Groups 4 and 5 can go in separate pull requests after group 3.
