## 1. Verdicts module

- [x] 1.1 Add `src/core/review/verify.ts` with the group-by-file function and the numbering inside a file; verify unit tests cover the order of the files by first finding and the numbers 1 to n inside each file
- [x] 1.2 Add the user prompt builder (header, diff with line numbers, four fields of each finding); verify unit tests show that the prompt holds no `relatesTo`, no anchor, and no diff of another file
- [x] 1.3 Add the system prompt of the verifier with the review instructions and the rule that text is information; verify unit tests show the order (guidance, statement and review instructions) and that the prompt names the three verdict values
- [x] 1.4 Add the check of the verdicts and the tool `submit_verdicts`; verify unit tests cover a valid call, a missing number, a repeated number, an unknown number, a bad verdict value, a bad severity, an empty reason, a corrected call, and the limit of 5 calls
- [x] 1.5 Add `applyVerdicts`; verify unit tests cover `rejected`, `confirmed`, `uncertain`, a lowered severity, a raised severity, the unchanged fields (file, line, summary, `relatesTo`, anchor), and the order of the findings

## 2. Engine

- [x] 2.1 Extract the worker loop of `runAll` into a pool function with the limit `MAX_PARALLEL_RUNS`; verify the existing tests for the pool and the abort pass without change
- [x] 2.2 Add the verification step that runs after the deduplication step with the pool and `runWithRetries`; verify faux provider tests show one run for each file, no run when no finding remains, and that at most 3 runs are active for 5 files
- [x] 2.3 Keep the findings of a file and write a `warn` log line when its run fails on the last try; verify a test shows that the review does not fail and that the other files are still verified
- [x] 2.4 Skip a file and write a `warn` log line when its first request is larger than half of the context window; verify a test shows no model call for that file
- [x] 2.5 Write the `info` log lines (summary, each rejected finding, each uncertain finding); verify a test with a capturing logger shows the numbers and the reasons
- [x] 2.6 Verify that a finding dropped by the step does not keep a fixed declaration valid, and that the reviewed severity decides the pass or fail result; verify with an engine test and a `decidePassFail` test

## 3. Test support and golden file

- [x] 3.1 Update `src/core/review/fauxFocus.ts` and the tests of the review so that a verifier run gets a `confirmed` verdict for each finding; verify `npm test` passes with no hang
- [x] 3.2 Regenerate the golden file `src/core/review/__golden__/review-output.txt` with `UPDATE_GOLDEN=1`; verify the file keeps LF line breaks and the characterization test passes

## 4. Documentation and final checks

- [x] 4.1 Add a section to `README.md` on the verification step, the cost, the log lines, and the breaking change, and add a note that a large change can need `--max-tokens 48000`; verify the section uses the terms of the glossary and agrees with the specs
- [x] 4.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all pass for the changed files
- [x] 4.3 Run `review` (not `publish`) on a real merge request, and compare the findings with and without the step; verify the log shows the rejected findings and the changed severities
