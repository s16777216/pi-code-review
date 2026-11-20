## Why

The judge decides `fixed`, `not_fixed`, or `uncertain` for each discussion. Only `fixed` goes on to the verify agent. A smoke test on merge request 60 (2026-11-20) showed that the judge is the weak point.

- `show.vue` line 590: the author did not accept the finding. The judge said `not_fixed` in run 1 and `fixed` in run 2. In run 2 the reason was that the author said the build passes. The verify agent then resolved the discussion.
- `squad.vue` line 506: the judge said `fixed` in both runs. Part of the reason was a statement of the author about the backend in another repository.

The judge prompt already has a rule for a decision to not accept. It does not name a decision to defer. It also does not say what to do with a statement that the judge cannot check. The verify agent prompt got both sentences in `keep-deferred-discussions-open`. The judge decides first, so the judge prompt needs the same rule.

## What Changes

- The judge system prompt says that a decision to leave the problem for a later change is a decision that the problem stays. The judge uses `not_fixed` for it when the code is unchanged.
- The judge system prompt says that a statement in a reply is not enough for `fixed` when the judge cannot check it in the diff or in the files that it can read. The judge uses `uncertain` for it.
- A discussion whose code changed to fix the problem is still `fixed`.
- No change to the output format, the validation, the verify agent, `findings.json`, `publish`, or the CLI flags.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Keep a declined discussion open in the judgment". It has 4 scenarios.

## Impact

- Code: `src/core/review/judge.ts` (the system prompt).
- Tests: unit tests of the system prompt in `judge.test.ts`. The golden file changes.
- Docs: `docs/how-it-works.md`.
- Risk: a prompt rule is not a guarantee, and the judge output differs between runs. A smoke test on merge request 60 shows how often the judge follows it.
- Risk: the judge gives `uncertain` for a fix that is true. A person resolves the discussion. This is the safe side.
