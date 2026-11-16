## Why

`resolve-fixed-discussions` lets an agent declare that a discussion from this tool is fixed. In practice, no agent does it. The three review focus agents look for new problems. The system prompt tells them to read discussions only before they report a problem in a file. The declaration is optional, so the agents skip it.

On merge request 60, 14 discussions from this tool were open. At least one, on `timeDialog.vue`, pointed at code that the author had already changed. Two review runs returned `resolved: []`. The log had no `did not accept a fixed declaration` line, so no declaration reached the checks. Nothing guarantees that an agent looks at each open discussion.

## What Changes

- Add the **discussion judgment step**. It runs after the merge of the review focus outputs and before the checks on fixed declarations.
- The step selects the discussions that this tool started, that are not resolved, that have an anchor, that no remaining finding links with `relatesTo`, and that no agent for a review focus declared fixed.
- A **judge** agent reads the current code of each file and gives each discussion a judgment: `fixed`, `not_fixed`, or `uncertain`, with a reason. The judge gets one run for each file.
- The judge treats discussion notes, including replies from people, as hints. The current code decides the judgment. A discussion that a person closed with a won't-fix reply gets `not_fixed`.
- Each `fixed` judgment becomes a fixed declaration. It joins the declarations from the review focus agents and goes through the existing checks. The anchor check stays unchanged.
- The system logs each judgment. When the anchor check drops a declaration that came from a `fixed` judgment, the log line names the discussion and the reason.
- When a judge run fails, the system keeps going. It writes a `warn` log line and declares no discussion of that file fixed. The review does not fail.
- Out of scope: a check that uses a line of evidence in place of the anchor check. See the open questions in `design.md`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Judge open discussions with the discussion judgment step".
  - Added: "Give the judge the discussion, the current code, and the review instructions".
  - Added: "Accept the judgments only in a valid form".
  - Added: "Turn a fixed judgment into a fixed declaration".
  - Added: "Keep the discussions of a file when its judgment fails".
  - Added: "Log the discussion judgment step".
  - Modified: "Run the checks once on the merged output" adds the new step to the order.
  - Modified: "Limit parallel runs" adds the judge runs to the limit of 3.
  - Modified: "Retry a model run that ends with an error" adds the judge runs to the retry rule.

## Impact

- Affected code: a new `src/core/review/judge.ts` (prompts, the `submit_judgments` tool, validation), `src/core/review/engine.ts` (run the step), `src/core/review/checks.ts` (the second step of `runChecks` and the `source` log field of `checkResolved`), `src/core/review/fauxFocus.ts` (test helper answers for the new step), and the golden file `src/core/review/__golden__/review-output.txt`.
- Local guide to refresh after implementation: `src/core/review/SPEC.md`.
- Docs to update after implementation: `docs/how-it-works.md`, which lists the steps of a review.
- The step selects a discussion only when no agent for a review focus declared it. A declared discussion needs no second model call.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type. A judged discussion appears in `resolved` in the same form as today.
- More model calls: one run for each file that has at least one selected discussion. The judge runs only when at least one discussion is selected.
- The model can hallucinate a fix. The anchor check stays as the code-side guard in this change.
- Depends on `resolve-fixed-discussions`, which is already archived.
