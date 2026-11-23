## Why

The judge and the verify agent have a rule: when a person replied that the problem stays by decision, and the code is unchanged, the discussion stays open. Tests on merge request 60 (2026-11-20 and 2026-11-23) showed three weak points of this rule.

- **The agent judges the reason.** The author of `show.vue` line 590 wrote that the finding is not a problem. In 7 of 8 judge runs, the judge decided that the author is right and gave `fixed`. The rule says that a person decides, but the agent decided.
- **The condition "the code is unchanged" cannot be checked.** The judge sees only the current code. It cannot see if the code changed after the decision. So it cannot tell a declined discussion from a fixed one.
- **A thread can have more than one statement.** An author can decline, and later reply that the fix is done. The prompt does not say which statement counts.

A test with one extra rule in the judge prompt moved `show.vue` line 590 from 7 of 8 `fixed` to 0 of 8, with no extra model call. The cause is the prompt.

## What Changes

- The judge prompt and the verify agent prompt tell the agent to find the last statement of a person about the problem. A statement says that the problem stays by decision (the author does not accept the finding, or leaves it for a later change), or that the problem is fixed.
- When the last statement says that the problem stays, the judge gives `not_fixed` and the verify agent gives `keep_open`. The agent does not judge the reason of the person. The rule holds when the code changed, when the reason is right, and when the agent cannot check the reason.
- When the last statement says that the problem is fixed, or no person made a statement, the agent decides from the code as before.
- The rule for a statement that the agent cannot check stays for a fix. It applies when no person decided that the problem stays.
- No change to the output format, the validation, `findings.json`, `publish`, or the CLI flags.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Modified: "Keep a declined discussion open" (verify agent). The rule follows the last statement and ignores the code and the reason. It adds 3 scenarios.
  - Modified: "Keep a declined discussion open in the judgment" (judge). The same change. It adds 3 scenarios.

## Impact

- Code: `src/core/review/judge.ts` and `src/core/review/verifyAgent.ts` (the system prompts).
- Tests: unit tests of both prompts. The golden file changes.
- Docs: `docs/how-it-works.md`.
- Risk: a discussion that a person declined, and that the code fixed later, stays open. A person resolves it. This is the safe side.
- Risk: the agent reads the last statement from the replies, and a model can read it wrong. A test on merge request 60 and a test with a changed thread show how often.
- Out of scope: a change of the code that fixes only a part of the problem (a frontend fix for a backend problem). A later change can cover it.
