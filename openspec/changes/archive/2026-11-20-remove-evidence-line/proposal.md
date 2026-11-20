## Why

The verify agent decides which discussions the review resolves. The code check on resolved discussions (the anchor, the evidence line, the link by a finding, the readable file) no longer decides. It only writes a `warn` line for each resolved discussion that it would reject. The judge still gives an evidence line with each `fixed` judgment, and that line has only one use: to pass this code check.

The evidence line and the code check cost code, tests, prompt text, and log lines. They also give a wrong picture of the system, because the rules say that the code accepts a declaration while the verify agent decides.

## What Changes

- **Gate**: The owner checked the comparison data and decided on 2026-11-20 to implement this change. See Decision 1 in the design for the known risk that the owner accepted.
- **BREAKING**: The judge no longer gives an evidence line. The judgment has no `evidence` field. An `evidence` in a call is ignored and is not an error.
- The prompt of the verify agent no longer has the evidence line of a declaration. The reason of the judge stays.
- The system no longer runs the code check on a resolved discussion. It no longer writes the `warn` lines with the field `comparison`, and it no longer writes the `info` line for an accepted evidence line. The verify agent alone decides.
- `checkResolved` and its helpers are removed, with the rejection reasons `anchor_still_present`, `evidence_not_valid`, `linked_by_finding`, `file_unreadable`, `no_anchor`, `already_resolved`, `not_from_this_tool`, and `discussion_not_found`. A discussion still reaches the verify agent only when the judge selected it, so the selection rules keep the eligibility rules.
- The anchor of a finding and of a discussion stays. `publish` uses it to match a finding to a discussion.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Pass a fixed judgment to the verify agent", "Leave a resolve decision to the verify agent", "Give the verify agent the findings, the declarations, and the discussions of the file", and "Log the judgments of the discussion judgment step". The last two replace requirements with the same content and no evidence line.
  - Removed: "Ask the judge for an evidence line", "Accept a judged declaration by its evidence line", "Run the code check on each resolved discussion", "Turn a fixed judgment into a declaration", "Give the verify agent the findings, the declarations, and the discussions", and "Log the discussion judgment step".
  - Modified: "Run the steps after the review agents" no longer names the code check.

## Impact

- Code: `src/core/review/judge.ts` (the `evidence` field, its validation, and its prompt text), `src/core/review/checks.ts` (`checkResolved`, `evidenceProblem`, and `runChecks`), `src/core/review/engine.ts` (the declarations), and `src/core/review/verifyAgent.ts` (the prompt and the types).
- Tests: the tests of the evidence line and of the code check, the faux helpers, and the golden file.
- Docs: `docs/how-it-works.md`, `docs/review-flow.html`, `openspec/GLOSSARY.md` (the term `evidence line`), and `src/core/review/SPEC.md` through `openspec-sync-specs`.
- Risk: no rule of the code stops a wrong resolve. The comparison lines were the only measure. This change removes them. The gate in the design asks for data before this step.
