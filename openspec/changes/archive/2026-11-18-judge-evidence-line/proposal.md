## Why

`judge-open-discussions` lets a judge agent say that a discussion is fixed. The check on fixed declarations then drops the declaration when a line of the current file still has the anchor of the discussion. A fix that leaves the anchored line unchanged never resolves the discussion.

On merge request 60, the judge gave `fixed` for 6 discussions in a smoke test. The anchor check dropped 4 of them with `anchor_still_present`. The judge reasons for these 4 looked correct. Only 2 discussions resolved.

## What Changes

- The judge gives an **evidence line** for each `fixed` judgment: one line of the current file that shows the fix. The `evidence` field of `submit_judgments` carries it. The field is optional in the validation, so a call without it is still valid.
- The check on fixed declarations gets a second way to accept a declaration from the judge. When a line of the current file still has the anchor, the check accepts the declaration if the evidence line is valid. The anchor check keeps its place as the first way.
- An evidence line is valid when four conditions are true. A whole line of the current file has the same text after trimming both texts. The trimmed text has one line only. It has at least 8 characters. Its anchor is not the anchor of the discussion.
- The prompt tells the judge that the evidence line comes from the current file and not from a note.
- Declarations from the review focus agents do not change. They have no evidence line and still need the anchor check. This holds also when the judge declared the same discussion.
- The system logs each declaration that the evidence line accepts. A declaration that the check drops gets the reason `anchor_still_present` when it has no evidence line, and `evidence_not_valid` when the evidence line fails.
- Out of scope: a check that the evidence line is new since the commit of the discussion. See the open questions in `design.md`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Ask the judge for an evidence line".
  - Added: "Accept a judged declaration by its evidence line".
  - Modified: "Accept a fixed declaration only after the checks" adds the second way to accept a declaration.
  - Modified: "Turn a fixed judgment into a fixed declaration" passes the evidence line to the check.

## Impact

- Affected code: `src/core/review/judge.ts` (the `evidence` field, the prompt rule, the validation), `src/core/review/checks.ts` (the second way in the anchor check, the new reason, the log lines), `src/core/review/engine.ts` (pass the evidence line from the judgment), and `src/core/review/fauxFocus.ts` only if a test helper needs it.
- Local guide to refresh after implementation: `src/core/review/SPEC.md`.
- Docs to update after implementation: `docs/how-it-works.md`, section "Discussion judgment".
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type. The findings file does not store the evidence line.
- The model can quote a real line that does not prove the fix. The check proves only that the quoted line exists. A person can reopen a resolved discussion.
- Depends on `judge-open-discussions`. Its requirements are in the main spec.
