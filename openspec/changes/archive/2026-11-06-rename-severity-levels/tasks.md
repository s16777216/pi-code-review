## 1. Core type & logic

- [x] 1.1 Change `Severity` in `src/core/types.ts` to `'critical' | 'high' | 'medium' | 'low' | 'pre_existing'`, and verify `npm run build` has no type errors
- [x] 1.2 Update `SEVERITY_RANK` in `src/core/passFail.ts` to `{ pre_existing: 0, low: 1, medium: 2, high: 3, critical: 4 }` with an updated doc comment, and update `src/core/passFail.test.ts` literals so each assertion still exercises the same rank relationship (e.g. "below threshold passes" uses `low`, "meets threshold fails" uses `high`/`critical`, `pre_existing` never blocks); verify `npm test -- passFail` passes
- [x] 1.3 Update `VALID_SEVERITIES` in `src/core/review/findings.ts` to the 5 new literals, and update `src/core/review/findings.test.ts` and `src/findingsFile.test.ts` literals; verify those test files pass

## 2. Config

- [x] 2.1 Update `VALID_FAIL_ON_SEVERITY` in `src/config.ts` to `['critical', 'high', 'medium', 'low', 'none']` and change the default threshold from `'important'` to `'high'`; update `src/config.test.ts` literals and defaults; verify `npm test -- config` passes

## 3. Agent prompt & schema

- [x] 3.1 Update the `SubmitReviewParams` TypeBox union in `src/core/review/agent.ts` to the 5 new literals; update `src/core/review/agent.test.ts` literals; verify that test file passes
- [x] 3.2 Rewrite the severity section of `SYSTEM_PROMPT` in `src/core/review/engine.ts` with the critical/high/medium/low/pre_existing rubric from design.md, and update the enumerated literal list near the `submit_review` instructions; verify `npm run build` passes (prompt is a string, so this is a visual review, not a type check)

## 4. Tests using literal findings

- [x] 4.1 Update literal `'important'`/`'nit'` findings in `src/core/review/engine.test.ts`, `src/core/review/scope.test.ts`, `src/core/publish/publisher.test.ts`, `src/core/review/characterization.fixtures.ts`, `src/cli/index.test.ts`, `src/cli/index.cli.test.ts` to the new literals, preserving each test's original intent (which level is "below default threshold" vs "meets it"); verify `npm test` passes for each touched file

## 5. Golden fixture

- [x] 5.1 After tasks 1-4 land, regenerate `src/core/review/__golden__/review-output.txt` by rerunning `characterization.test.ts`'s `renderAll()` and overwriting the file with its output; diff against the previous version to confirm only the expected severity/prompt text changed; verify `npm test -- characterization` passes

## 6. Docs & housekeeping

- [x] 6.1 Check off the "important、nit 改成 critical、high、medium、low" line in `TODO.md`
- [x] 6.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check` (per `openspec/VERIFY.md`) and confirm all pass
- [x] 6.3 Run `openspec archive rename-severity-levels` to fold the delta specs into `openspec/specs/**` and move this change under `openspec/changes/archive/`
