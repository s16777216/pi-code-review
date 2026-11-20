## Why

The discussion judgment step starts after the verification step. The judge no longer reads the findings (`decouple-judge-from-findings`), so it does not need to wait for them. The wait is only a result of the order in the code.

In one smoke test on a merge request with 38 changed files, the review agents ran for about 4 minutes 17 seconds. The steps after them ran for about 2 minutes 41 seconds, and the judge runs are part of that time. The judge can start earlier.

## What Changes

- The system starts the discussion judgment step when the review starts, at the same time as the agents for the review focuses. The check on fixed declarations waits for the result of the step.
- All agent runs share one limit of 3 runs at the same time. This includes the runs of the review agents, the verifier, and the judge, also when they overlap. The judge runs wait behind the runs of the review agents.
- When the review fails, the system starts no new judge run.
- No change to the result of a review, to the prompts, to the checks, to `findings.json`, to `publish`, or to the CLI flags. The order of some log lines changes, and the golden file changes with it.
- Out of scope: the verify agent (`add-verify-agent`), and a separate limit for the judge.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Run the steps on the merged output". It replaces "Run the checks in order on the merged output". The order list has no discussion judgment step.
  - Removed: "Run the checks in order on the merged output".
  - Added: "Stop the judge when the review fails".
  - Modified: "Judge each open discussion of this tool" says when the step starts.
  - Modified: "Limit parallel runs" says that the limit covers runs of different steps at the same time.

## Impact

- Code: `src/core/review/engine.ts` (`review()` and `runPool`) and `src/core/review/checks.ts` (the step that `runChecks` waits for).
- Tests: the engine tests of the judgment step, the tests of the limit, and the golden file.
- Docs: `docs/how-it-works.md`.
- Risk: more model calls run at the same time at the end of the review agents. The shared limit keeps the total at 3.
- Order of archive: this change and `add-verify-agent` both change the requirement "Run the checks in order on the merged output". Archive `add-verify-agent` first, and then rebuild the delta of this change from the main spec before `openspec-sync-specs`.
