## 1. Prompt for the review agents

- [x] 1.1 Add the paragraph about the line of a finding to `SYSTEM_PROMPT` in `src/core/review/engine.ts`; verify an engine test shows that `buildSystemPrompt()` holds the four statements (the line of the problem, a line inside the added or changed lines for a changed problem, the line of the unchanged code for an unchanged problem, and not the line that opens the block)
- [x] 1.2 Verify that a finding on a context line of the diff is still kept; verify a test with a finding on a line that is not the line of the problem passes the checks

## 2. Prompt for the verifier

- [x] 2.1 Add the quote rule and the rule to reject a contradicted summary to `VERIFY_SYSTEM_PROMPT` in `src/core/review/verify.ts`; verify `verify.test.ts` shows that the prompt holds both rules and still names the three verdict values
- [x] 2.2 Verify that `submit_verdicts` still accepts a valid verdict whose `reason` has no quote; verify with a unit test in `verify.test.ts`

## 3. Log of every verdict

- [x] 3.1 Write one `debug` log line for each handled finding in `verify()` in `src/core/review/engine.ts`, with the file, the line, the verdict, the reviewed severity, and the reason; verify a test with a capturing logger shows 3 lines for the verdicts `confirmed`, `rejected`, and `uncertain`
- [x] 3.2 Verify that the new lines are `debug` lines only and that the `info` lines of the step do not change; verify the existing tests of the log lines in `verification.test.ts` pass

## 4. Golden file, documentation, and final checks

- [x] 4.1 Regenerate `src/core/review/__golden__/review-output.txt` with `UPDATE_GOLDEN=1`; verify the file keeps LF line breaks and the characterization test passes
- [x] 4.2 Update the verification section and the debug logging section of `README.md`; verify the text uses the terms of the glossary and agrees with the spec
- [x] 4.3 Run `npm run build`, `npm test`, `npm run lint`, and `npx prettier --check --end-of-line auto` on the changed files; verify all pass
- [x] 4.4 Run `review --debug` (not `publish`) on a real merge request and read the `debug` lines of the verdicts; verify each verdict has a reason and report how many reasons hold a quote
