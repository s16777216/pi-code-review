## Why

After the review agents, the deduplication step, the verification step, and the discussion judgment step, a fixed program decides the final result. The program has two jobs. It decides which declarations of the judge resolve a discussion. It does not match a finding to an older discussion. The review agents do that with `relatesTo`, and `publish` repeats a weaker match by the text of the line.

The fixed program cannot read a reply of a person. It cannot see that a finding repeats an open discussion with another wording. It cannot see that a person already explained a finding as intended. It also cannot tell that a `fixed` judgment is right when the fix does not change the anchored line.

A verify agent can read the findings, the declarations, and the discussions with their notes together. This change adds that agent as the last step. It decides the open issues and the resolved issues.

## What Changes

- Add the **verify agent step**. It runs after the discussion judgment step. It runs once for each file that has a discussion and at least one finding or declaration.
- The verify agent reads the findings of the file, the declarations of the judge with their reason and evidence line, and all discussions of the file with their notes, including the replies of people. It can read the diff and the current code.
- The verify agent decides each finding: keep it or drop it. A kept finding gets the discussion that it relates to, or none. The decision replaces any `relatesTo` that a review agent wrote.
- The verify agent decides each declaration: resolve the discussion or leave it open. The discussion judgment step stays the only source of declarations, so the verify agent resolves only a discussion that the judge declared fixed.
- The result of the verify agent is the final result: the findings and the `resolved` list. The code check on declarations (anchor, evidence line, link by a finding) no longer decides. It runs on each resolved discussion and writes a `warn` line when it would reject it. This gives data to compare the two ways before a later change removes the code check.
- When a verify agent run fails, the system keeps the findings as they are and resolves nothing for that file.
- **BREAKING (behavior)**: a person can now influence the resolve of a discussion through a reply, because the verify agent reads the replies and decides alone. The code check no longer prevents it.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type.
- Out of scope: remove the discussion tool and `relatesTo` from the review agents, remove the evidence line, and run the judge at the same time as the review agents. Separate changes do these.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Decide the final result with the verify agent", "Give the verify agent the findings, the declarations, and the discussions", "Accept the decisions only in a valid form", "Apply the decisions of the verify agent", "Keep the earlier result when a verify agent run fails", "Log the verify agent step", and "Run the code check on each resolved discussion".
  - Removed: "Accept a fixed declaration only after the checks". "Run the code check on each resolved discussion" replaces it.
  - Modified: "Run the checks in order on the merged output", "Turn a fixed judgment into a declaration", "Accept a judged declaration by its evidence line", and "Log the discussion judgment step" name the new step and the code check.

## Impact

- Code: a new file `src/core/review/verifyAgent.ts` (prompts, the `submit_decisions` tool, the validation, and the apply step), `src/core/review/engine.ts` (the new step after the judge), `src/core/review/checks.ts` (the code check runs for the log only), and `src/core/review/fauxFocus.ts` (test helper).
- Tests: new tests for the new file, the engine tests of the judgment step, and the golden file.
- Docs: `docs/how-it-works.md`, and `src/core/review/SPEC.md` through `openspec-sync-specs`.
- Cost: one more model run for each file that has a discussion and a finding or a declaration.
- Risk: the verify agent is the last decision, and a reply or a note can influence it. The log lines of the comparison show how often the verify agent resolves a discussion that the code check rejects.
