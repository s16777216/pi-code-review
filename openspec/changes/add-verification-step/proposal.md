## Why

The three agents of the review find more problems, but they also report more false findings and give some findings a severity that is too high. On a real merge request (MR 32 of `2spc/backend`), 13 findings had the severity `critical` or `high`. One finding was false. Three findings had a severity that the project owner judged to be `medium`. A second look by an independent agent can drop a false finding and correct a severity, so the reader of the review trusts the result more.

## What Changes

- Add a verification step after the deduplication step. A verifier agent checks the findings of one file at a time. The verifier reads the diff of the file and can read other files.
- The verifier gives each finding a verdict (`confirmed`, `rejected`, or `uncertain`), a reviewed severity, and a one-sentence reason.
- The system drops a finding only when its verdict is `rejected`. A finding with the verdict `uncertain` stays.
- The system sets the severity of each kept finding to the reviewed severity. The verifier can raise or lower a severity. The verifier cannot change the summary.
- The step uses the pool of 3 runs and the retry rule of the other runs. When a run fails on its last try, the system keeps the findings of that file as they are and writes a `warn` log line. The review does not fail.
- The step is always on. It has no option and no confidence value.
- The system writes the rejected findings and the verdicts of kept findings to the log only. The findings file and `publish` do not change.
- **BREAKING**: A review makes more model calls (about one more call for each file that has findings), and the severity of a finding can differ from the severity that the agents reported.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-diff-review`: Add the verification step, its input, its verdicts, its effect on the findings, its failure rule, and its log lines. Change the order of the checks, the pool of parallel runs, and the retry rule to include the step.

## Impact

- `src/core/review/engine.ts`: run the verification step after the deduplication step, with the pool and the retry rule.
- `src/core/review/verify.ts` (new): the prompt, the `submit_verdicts` tool, the check of the verdicts, and the application of the verdicts to the findings.
- `src/core/review/fauxFocus.ts` and the tests of the review: the faux provider needs a response for the verification step.
- `README.md`: the cost, the verification step, and the breaking change.
- The golden file `src/core/review/__golden__/review-output.txt` changes, because every review makes more model calls.
- `findings.json`, `publish`, the CLI options, and the configuration do not change.
