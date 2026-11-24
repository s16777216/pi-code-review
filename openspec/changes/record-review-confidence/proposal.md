## Why

A finding has a severity (the impact of the problem if it is real) and nothing else. The tool has no way to say how sure it is that the problem is real. A finding that one agent reports and the verifier doubts looks the same as a finding that all agents report and the verifier confirms.

The tool already has the data for a first answer: how many review focuses found the same problem, and the verdict of the verifier. This change keeps that data, derives a **confidence** from it, and shows it. It does not use the confidence to decide pass or fail. Today no value of a confidence threshold is safe to set (see `design.md`, Decision 6). The data that this change records is what a later change needs to find a safe value.

## What Changes

- Carry the review focus of each finding from the review step to the deduplication step. Today the focus is lost when the engine merges the outputs.
- Record the **corroboration** of each finding: the number of distinct review focuses in its deduplication group.
- Derive a **confidence** (`high`, `medium`, or `low`) from the corroboration and the verdict of the verifier.
- Write `corroboration`, `verdict`, and `confidence` to the findings file.
- Show the confidence in the comment: a new placeholder `${confidence}`, and a line in the built-in finding template.
- **No change of severity, and no change of the pass or fail result.** `publish` decides pass or fail from severity alone, as before. The review status comment does not change. Every finding is posted as before.
- Out of scope: a confidence threshold for the gate, more than one verifier, scores, and a mark for a finding of low confidence. See Open Questions in `design.md`.

## Capabilities

### New Capabilities

- `review-confidence`: how corroboration and confidence are derived, recorded in the findings file, and shown in the comment, and the rule that confidence never changes severity or the result of `publish`.

### Modified Capabilities

- `review-output`: the finding template has the placeholder `${confidence}`, and the built-in template shows it.

## Impact

- Code: `src/core/types.ts` (the `Finding` type), `src/core/review/engine.ts` (the merge of the focus outputs), `dedup.ts` (corroboration), `verify.ts` (verdict and confidence), `findings.ts` and `src/findingsFile.ts` (the new fields), the publish code that fills the template, and `src/template/FINDING.md`.
- Tests: the golden file and the tests of the steps grow or change.
- Docs: `src/core/review/SPEC.md`, `src/template/SPEC.md`.
- Compatibility: a findings file from an older `review` has no confidence. `publish` reads it with no error, and the placeholder fills with `unknown`. A findings file from this version read by an older `publish` works, because unknown fields are ignored.
- Risk: the built-in comment gets one more line for every finding. The confidence may be `medium` for most findings (see `design.md`, Risks).
