## 1. Review focuses and system prompt

- [ ] 1.1 Add the three review focuses (logic correctness, security, resources and concurrency) with their paragraphs, and add the review focus argument to `buildSystemPrompt`; verify tests show the order (general guidance, scope paragraph, focus paragraph, statement and review instructions, language sentence) and that each paragraph says the focus is not a limit
- [ ] 1.2 Count the largest first request of the three review focuses in `estimateFirstRequest` and in the plan for the batches; verify tests show that the plan is the same for the three review focuses and that a batch fits the budget with the largest focus
- [ ] 1.3 Verify that the system prompt of the three agents of one run scope differs only in the focus paragraph, and that each agent gets the same user prompt and the same review instructions; verify with a faux provider test

## 2. Runs and merge

- [ ] 2.1 Plan one run for each pair of a scope and a review focus, in the order of scope and then focus; verify a test shows 3 runs for a whole change and 6 runs for 2 batches
- [ ] 2.2 Keep one pool of at most 3 runs for all runs; verify a test shows that at most 3 runs are active for a review of 5 batches, and that the 3 runs of one scope run at the same time
- [ ] 2.3 Add the review focus to the retry `warn` line and to the failure message; verify tests show the batch number, the focus, and the cause, and that the failure of one run aborts the active runs
- [ ] 2.4 Merge the findings in the order of scopes and then focuses, and keep the first fixed declaration for each discussion; verify tests cover the order of findings and two review focuses that declare the same discussion
- [ ] 2.5 Write one `info` log line for each review focus with the number of its findings; verify a test with a capturing logger shows three lines with the right numbers

## 3. Checks and deduplication step

- [ ] 3.1 Split `runChecks` in two parts, so the deduplication step can run after the checks on `relatesTo` and the diff line and before the check on the fixed declarations; verify the existing tests for `runChecks` pass without change
- [ ] 3.2 Add `src/core/review/dedup.ts` with the prompt, the `submit_groups` tool, and the check of the groups; verify unit tests cover a valid result, a group with two files, a missing number, a repeated number, an unknown number, and the limit of 5 calls
- [ ] 3.3 Add the function that picks the finding to keep from each group; verify unit tests cover the severity order including `pre_existing`, equal severities, an unchanged summary, and the `relatesTo` of the kept finding and of the first finding of the group
- [ ] 3.4 Send only the findings of files with two or more findings, and do not call the model when no file has two findings; verify tests with a faux provider show no call for findings in different files, one call for two findings in one file, and an input with the four fields only
- [ ] 3.5 Use the retry rule of the other runs for the step, and fail the review that names the step after the last try; verify tests cover a result that is corrected in the same run, a call that fails on every try, and the abort of the review
- [ ] 3.6 Write one `info` log line for the step with the numbers before and after it; verify a test with a capturing logger shows the numbers

## 4. Documentation and final checks

- [ ] 4.1 Add a section to `README.md` on the three review focuses, the deduplication step, the cost, and the breaking change; verify the section uses the terms of the glossary and agrees with the specs
- [ ] 4.2 Regenerate the golden file `src/core/review/__golden__/review-output.txt` from `characterization.test.ts`; verify the file keeps LF line breaks and the test passes
- [ ] 4.3 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all pass for the changed files
