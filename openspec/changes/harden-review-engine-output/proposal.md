# Proposal

## Why

The `AgentReviewEngine` loses or misplaces findings in three ways, and the user cannot see it happen.

- The agent counts line numbers by hand from raw diff hunks. A wrong count moves the comment to the wrong line, or the line check discards the finding.
- One finding with a bad field makes `parseFindings` throw. The engine then drops every valid finding in the same response.
- The engine discards a finding that points outside the diff. It writes no log line, so the user cannot tell that a finding existed.

Each fix is small. Together they make the review output more complete and easier to trust before the project designs a larger architecture.

## What Changes

- The review input prints the new-file line number in front of every added and context line of each diff.
- `parseFindings` keeps each valid finding and drops each invalid finding. It logs one `warn` line for each dropped finding.
- The engine logs one `warn` line for each finding that the diff check discards. The line names the file, the line number, and the reason.
- Output that is not valid JSON, or is not a JSON array, is still a review failure. This behavior does not change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`: three requirements change.
  - "Build review input from the review context" now requires line numbers on the diff lines.
  - "Produce structured findings" now keeps valid findings when a sibling finding is invalid.
  - "Validate findings against the diff" now requires a log line for each discarded finding.

## Impact

- Affected code: `src/core/review/prompt.ts`, `src/core/review/findings.ts`, `src/core/review/engine.ts`. A new helper in `src/core/review/diff.ts` may format the numbered lines.
- Affected tests: `prompt.test.ts`, `findings.test.ts`, `engine.test.ts`, `diff.test.ts`.
- `parseFindings` gets an optional logger argument. Existing callers keep working.
- No change to the CLI flags, to `findings.json`, or to the `ReviewEngine` interface.
- No change to the `review-output`, `gitlab-mr-context`, or `debug-logging` capabilities.
