## Why

The discussion judgment step selects a discussion only when no remaining finding links to it. This rule makes the judge depend on the review agents, the deduplication step, and the verification step. The judge reads only the discussion, the diff of the file, and the current code. It does not need a finding.

The rule only saves one judge call for a discussion that a finding links to. The check on fixed declarations already drops a declaration for such a discussion, with the reason `linked_by_finding`. So the rule adds a dependency and gives no extra safety.

## What Changes

- The discussion judgment step no longer reads the findings. It selects a discussion when this tool started it, it is not resolved, and it has an anchor and a file.
- A discussion that a finding links to is now judged. If the judge gives `fixed`, the check on fixed declarations drops the declaration with the reason `linked_by_finding`, and the system writes one `warn` log line.
- `selectDiscussions` takes the discussions only. The step that `runChecks` calls for the judgment gets no argument.
- No change to the order of the steps. The judgment step still runs after the verification step. This change only removes the data dependency, so a later change can run the judge at the same time as the review agents.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type.
- Out of scope: the second run of the verifier on the `fixed` judgments, and the parallel run of the judge.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Judge each open discussion of this tool". It replaces "Select and judge the open discussions" and has no rule about findings.
  - Removed: "Select and judge the open discussions".
  - Modified: "Turn a fixed judgment into a declaration" has one new scenario for a discussion that a finding links to.

## Impact

- Code: `src/core/review/judge.ts` (`selectDiscussions`), `src/core/review/checks.ts` (`runChecks`), `src/core/review/engine.ts` (`judgeDiscussions`).
- Tests: `judge.test.ts`, `checks.judge.test.ts`, `judge.engine.test.ts`, `engine.test.ts`, and the golden file if the log changes.
- Docs: `docs/how-it-works.md` and `docs/review-flow.html`.
- Cost: a review makes one more judge call for each file that has only discussions linked by a finding. The count of `warn` lines can grow, because a `fixed` judgment on a linked discussion is dropped with a `warn` line.
