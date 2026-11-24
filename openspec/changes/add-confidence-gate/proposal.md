## Why

The pass or fail result of `publish` depends only on severity. A finding that one agent reports and the verifier doubts can fail a merge request in the same way as a finding that all agents report and the verifier confirms. A team that wants a stricter gate has no way to say "fail only when I am also sure". Severity (the impact of a problem if it is real) and confidence (how sure the tool is that it is real) are two different things, and the tool gives only the first.

## What Changes

- Add a **confidence** to each finding: `high`, `medium`, or `low`. The system derives it from two facts that it already has or can keep: the **corroboration** (how many distinct review focuses found the same problem, from the deduplication groups) and the **verdict** of the verifier.
- Write `confidence`, `corroboration`, and `verdict` to the findings file.
- Add a second gate setting: `FAIL_ON_CONFIDENCE` (flag `--fail-on-confidence`), values `low`, `medium`, `high`, default `low`. `publish` fails when a finding meets `FAIL_ON_SEVERITY` **and** `FAIL_ON_CONFIDENCE`. The default `low` keeps today's result.
- Show the confidence in the comment (new placeholder `${confidence}` and a line in the built-in template), and count in the review status comment and in the log the findings that the confidence threshold let pass.
- Carry the review focus of each finding from the review step to the deduplication step. Today the focus is lost when the engine merges the outputs.
- **No change of severity.** Confidence never raises or lowers a severity. Every finding is still posted.
- Out of scope: more than one verifier, scores, dropping findings of low severity and low confidence, a new default for `FAIL_ON_CONFIDENCE`. See Open Questions in `design.md`.

## Capabilities

### New Capabilities

- `review-gate`: how severity and confidence are kept apart, how corroboration and confidence are derived, and how the gate uses both.

### Modified Capabilities

- `review-cli`: the exit code of `publish` uses the confidence threshold too, and `publish` (not `review`) accepts the new setting.
- `review-output`: the finding template has the placeholder `${confidence}`, and the review status comment can hold the count of the findings that the confidence threshold let pass.

## Impact

- Code: `src/core/types.ts` (the `Finding` type), `src/core/review/engine.ts` (the merge of the focus outputs), `dedup.ts` (corroboration), `verify.ts` (verdict and confidence), `findings.ts` and `src/findingsFile.ts` (the new fields), `src/core/passFail.ts`, `src/config.ts`, `src/cli/index.ts` (the gate and the setting), the publish code that renders comments and the status comment, and `src/template/FINDING.md`.
- Tests: the golden file and the tests of the steps and of `passFail` change or grow.
- Docs: `src/core/review/SPEC.md`, `src/template/SPEC.md`, and the `README` setting list.
- Compatibility: a findings file from an older `review` has no confidence. `publish` reads it as `high`, so the gate does not change for it.
- Risk: see `design.md`. The main risk is that a real security finding gets confidence `medium` at most, because the three focuses split by domain.
