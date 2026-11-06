## Why

Today's `Severity` is a flat 3-value enum (`important`, `nit`, `pre_existing`) that conflates "did the diff introduce this bug" with "how bad is it" — `important`/`nit` carry no real severity gradation. We want a genuine 4-level impact scale so reviewers and the `--fail-on` threshold can distinguish how serious a diff-introduced bug is, not just whether it's worth a comment.

## What Changes

- **BREAKING**: `Severity` becomes `'critical' | 'high' | 'medium' | 'low' | 'pre_existing'`, replacing `'important' | 'nit' | 'pre_existing'`.
- The agent's severity rubric is rewritten from "important = diff introduces it / nit = minor" into an impact-based scale:
  - `critical` — breaks core functionality, causes data loss/corruption, or is a security issue.
  - `high` — causes clearly wrong behavior on the common path.
  - `medium` — real but limited to edge cases, or modest impact.
  - `low` — minor, worth a comment but not worth blocking (replaces `nit`).
  - `pre_existing` — a bug in code the change did not modify, at any severity (unchanged role).
- Severity rank order used for `--fail-on` becomes `pre_existing < low < medium < high < critical`.
- **BREAKING**: the default `--fail-on` / `FAIL_ON_SEVERITY` threshold changes from `important` to `high`.
- **BREAKING**: findings files, the `submit_review` tool schema, and `--fail-on` no longer accept `important`/`nit`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ai-diff-review`: the "Classify each finding with a severity" requirement changes from the 3-value enum to the 5-value impact-based scale, including new scenarios for the critical/high/medium/low distinction.
- `review-output`: discussion-body examples that reference a concrete severity literal (e.g. `important`) are updated to the new literals; pass/fail-threshold scenario literals update.
- `review-cli`: the findings-file validation error message's list of valid severities, and the `--fail-on`/exit-code example scenarios, update to the new literals and new default (`high`).

## Impact

- Code: `src/core/types.ts`, `src/core/passFail.ts`, `src/core/review/agent.ts` (submit_review tool schema), `src/core/review/engine.ts` (system prompt), `src/core/review/findings.ts` (validation), `src/config.ts` (`--fail-on` default/allowed values).
- Tests: every test file with a literal `'important'`/`'nit'` finding, plus the `review-output.txt` golden fixture (must be regenerated, not hand-edited).
- No API/dependency changes. No migration path for old findings files using `important`/`nit` — they will now fail validation (acceptable: findings files are transient, produced by `review` and consumed by `publish` in the same pipeline run).
