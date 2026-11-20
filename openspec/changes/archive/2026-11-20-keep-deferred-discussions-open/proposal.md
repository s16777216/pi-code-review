## Why

The verify agent has a rule: when a person replied that the problem stays by decision, and the code did not change, it uses `keep_open`. A smoke test on merge request 60 (2026-11-20) showed that the agent did not follow this rule in two cases. It resolved both discussions.

- `AttachmentUpload.vue` line 239: the author wrote that the problem is left for a later backend change, and confirmed that the gap is real. The code did not change. The agent resolved the discussion, because "the team acknowledged the backend permission validation as a separate concern".
- `squad.vue` line 506: the author did not accept the finding and said that the backend already checks the permission. That backend is in another repository, and the agent cannot read it. The agent resolved the discussion because "the discussion reply confirms backend services enforce authorization checks".

Two gaps explain this. The rule names a decision to not accept, and a decision to defer is a different wording for the same case. The prompt says that a reply is a hint and not proof, but it does not say what to do with a statement that the agent cannot check.

The tool has no rule of the code that checks a resolve (`remove-evidence-line`). The prompt is the only place for this rule.

## What Changes

- The system prompt of the verify agent says that a decision to leave the problem for a later change, for example another request or another repository, is a decision that the problem stays. The agent uses `keep_open` for it when the code did not change.
- The system prompt says that a statement in a reply is not enough to resolve a discussion when the agent cannot check it in the diff or in the files that it can read. For example, a statement about the behavior of another repository. The agent uses `keep_open` for it.
- A discussion whose code changed to fix the problem is still resolved.
- No change to the output format, to the validation, to the judge, to `findings.json`, to `publish`, or to the CLI flags.
- Out of scope: the judge prompt. The judge declared both discussions as fixed, and a later change can give it the same rule.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Modified: "Keep a declined discussion open" now covers a decision to defer and a statement that the agent cannot check. It adds 2 scenarios.

## Impact

- Code: `src/core/review/verifyAgent.ts` (the system prompt).
- Tests: unit tests of the system prompt in `verifyAgent.test.ts`.
- Docs: `docs/how-it-works.md` (the section "Final decisions").
- Risk: the agent keeps open a discussion that is fixed, because the fix depends on a statement in a reply. The discussion stays open, and a person resolves it. This is the safe side.
- Risk: a prompt rule is not a guarantee. A smoke test shows how often the agent follows it.
