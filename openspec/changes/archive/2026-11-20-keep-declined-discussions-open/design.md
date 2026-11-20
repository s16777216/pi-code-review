## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `VERIFY_AGENT_SYSTEM_PROMPT` in `src/core/review/verifyAgent.ts` tells the agent how to decide a declaration: `resolve` when the current code no longer has the problem, and `keep_open` when the problem is still there or the agent cannot decide.
- `JUDGE_SYSTEM_PROMPT` in `src/core/review/judge.ts` has the rule for the judge: use `not_fixed` when a person replied that the problem stays by decision, for example the author does not accept the finding, and the code is unchanged.
- The verify agent sees the declaration with the reason of the judge, and all discussions of the file with their notes, including the replies of people. It can read the current code and the diff.
- The tool validation checks the form of the decisions, and it does not check the quality. A prompt rule is the only way to give this rule to the agent.

## Goals / Non-Goals

**Goals:**
- Give the verify agent the rule that the judge already has.
- Keep the change to the prompt and one test.

**Non-Goals:**
- Add a rule of the code that detects a decline. The code cannot read the meaning of a reply.
- Change the judge prompt, the output format, or the validation.

## Decisions

### Decision 1: One paragraph in the system prompt

The paragraph follows the rules of the declaration. It says:

- When a person replied that the problem stays by decision, and the code that the note describes did not change, the agent uses `keep_open`.
- Resolving such a discussion is a decision for a person.
- A reason of the judge such as "there is no bug" does not change this. The agent checks the reason against the replies and the code.

The rule uses the same words as the rule of the judge, so the two prompts say the same thing.

Alternative: rely on the sentence "When you are not sure, use keep_open". A smoke test shows that the agent was sure and resolved the discussion, because the reason of the judge and a reply gave it a reason.

### Decision 2: The agent decides whether the code changed

The agent has the diff, the current code, and the notes. It can see whether the line of the note, or the code that the note names, changed. The paragraph tells it to use `keep_open` when the code did not change, and it leaves the check to the agent. A reply that declines the finding and a change of the code to fix it are different cases: for the second case the agent resolves the discussion as before.

## Risks / Trade-offs

- The agent keeps open a discussion that is fixed, because a reply says "not accepted" and the agent does not see the change → The discussion stays open, and a person resolves it. This is the safe side.
- The agent still resolves a declined discussion, because a prompt rule is not a guarantee → The comparison data shows how often. A person reads the `debug` lines and the `warn` lines.
- The rule is only in the prompt → A change of the model can change how well the agent follows it. A test checks that the paragraph is in the prompt, and a smoke test checks the case on the merge request that showed it.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, remove the paragraph.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: none. `src/core/review/SPEC.md` names the file and not the prompt text.

## Open Questions

- Whether the judge also needs a stronger rule. It has the rule, and it still said `fixed` in the observed case. The verify agent is the last decision, so this change starts there.
