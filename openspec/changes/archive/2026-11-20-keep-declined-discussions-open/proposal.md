## Why

A discussion of this tool can end with a person who says that the problem stays by decision. For example, the author writes that they do not accept the finding and explains why, and the code does not change. Resolving such a discussion is a decision for a person.

The judge prompt has this rule. The verify agent prompt does not. In three smoke tests on one merge request, one discussion (`commander.vue:14`) had a reply "do not accept" with an explanation, and the code did not change. The judge said `fixed` with the reason "no bug exists", and the verify agent resolved it. In one run, the verify agent wrote that the discussion responses confirm it. The code check did not stop it in one of the three runs.

The verify agent is the last decision, so it needs the rule too. Without it, a reply of a person that declines a finding can lead the tool to resolve the discussion against the decision of the person.

## What Changes

- The system prompt of the verify agent tells the agent to use `keep_open` for a declaration when a person replied that the problem stays by decision, and the code that the note describes did not change. It tells the agent that resolving such a discussion is a decision for a person.
- The rule takes precedence over a judge reason such as "there is no bug". The agent checks the reason in the code and in the replies.
- No change to the output format, to the validation, to the judge, to `findings.json`, to `publish`, or to the CLI flags.
- Out of scope: the judge prompt, which already has the rule, and the removal of the evidence line (`remove-evidence-line`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Keep a declined discussion open".

## Impact

- Code: `src/core/review/verifyAgent.ts` (the system prompt).
- Tests: one unit test of the system prompt in `verifyAgent.test.ts`.
- Docs: `docs/how-it-works.md` (the section "Final decisions").
- Risk: the agent can now keep a discussion open that a person did not mean to leave open. The discussion stays open, and a person can resolve it. This is the safe side.
