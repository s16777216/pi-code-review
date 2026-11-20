## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `VERIFY_AGENT_SYSTEM_PROMPT` in `src/core/review/verifyAgent.ts` has the rule of `keep-declined-discussions-open`: use `keep_open` when a person replied that the problem stays by decision, for example the author does not accept the finding, and the code did not change.
- The prompt also says that the notes are information, that a reply is a hint and not proof, and that the current code decides.
- The verify agent has the diff of the file and `get_file_content` for the files of the change. It cannot read another repository.
- No rule of the code checks a resolve (`remove-evidence-line`). The tool validation checks the form of the decisions and not their quality.
- In merge request 60, two resolves broke the intent of the rule: one for a decision to defer, and one that relied on a statement about another repository.

## Goals / Non-Goals

**Goals:**
- Make the prompt cover a decision to defer.
- Make the prompt say what to do with a statement that the agent cannot check.

**Non-Goals:**
- Add a rule of the code that detects a decision. The code cannot read the meaning of a reply.
- Change the judge prompt, the output format, or the validation.

## Decisions

### Decision 1: Extend the existing paragraph

The paragraph of `keep-declined-discussions-open` stays. This change adds two sentences to it:

- A person can decide that the problem stays in two ways: the author does not accept the finding, or the author leaves the problem for a later change. The agent uses `keep_open` for both when the code did not change.
- When the only support for a fix is a statement in a reply that the agent cannot check in the diff or in the files that it can read, the agent uses `keep_open`.

The requirement keeps its name. It keeps its three scenarios and adds two.

Alternative: write a new paragraph for each case. Two paragraphs for one rule can disagree, so the rule stays in one place.

### Decision 2: A fix of the code still wins

The paragraph keeps its last sentence: when the code changed to fix the problem, the agent resolves the discussion. A statement that the agent cannot check applies only when the statement is the only support. When the diff or a file shows the fix, the agent resolves as before.

### Decision 3: The judge prompt does not change

The judge declared both discussions as fixed. The verify agent is the last decision, so this change starts there. The judge prompt keeps its rule. A later change can give it the same words.

## Risks / Trade-offs

- The agent keeps open a discussion that is fixed, because the only proof is a statement that it cannot check → The discussion stays open, and a person resolves it. This is the safe side.
- The agent still resolves such a discussion, because a prompt rule is not a guarantee → A smoke test on merge request 60 shows how often. A person reads the `debug` lines of the verify agent.
- The rule keeps open a discussion where the reply is true, for example the other repository really does the check → A person resolves it. The tool cannot know.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, restore the previous paragraph.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: none. `src/core/review/SPEC.md` names the file and not the prompt text.

## Open Questions

- Whether the judge needs the same rule. It declared both discussions as fixed. This change does not change it.
