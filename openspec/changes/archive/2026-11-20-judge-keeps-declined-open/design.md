## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `JUDGE_SYSTEM_PROMPT` in `src/core/review/judge.ts` has the rule for `not_fixed`: use it when a person replied that the problem stays by decision, for example the author does not accept the finding, and the code is unchanged.
- The prompt says that a reply is a hint and not proof, and that the code decides.
- The judge has the diff of the file and `get_file_content` for the files of the change. It cannot read another repository.
- Only `fixed` becomes a declaration for the verify agent.

## Goals / Non-Goals

**Goals:**
- Make the judge prompt cover a decision to defer.
- Make the judge prompt say what to do with a statement that the judge cannot check.

**Non-Goals:**
- Add a rule of the code that detects a decision. The code cannot read the meaning of a reply.
- Change the verify agent prompt, the output format, or the validation.
- Make the judge deterministic. The output differs between runs.

## Decisions

### Decision 1: Extend the existing sentence for `not_fixed`

The sentence for a decision to not accept stays. This change adds the decision to defer to the same sentence, so the rule stays in one place.

### Decision 2: A statement that the judge cannot check gives `uncertain`

When the only support for `fixed` is a statement in a reply that the judge cannot check in the diff or in the files that it can read, the judge uses `uncertain`. `uncertain` does not become a declaration, so the discussion stays open. The judge uses `not_fixed` only when the code still has the problem.

### Decision 3: A fix of the code still wins

When the diff or a file shows the fix, the judge uses `fixed` as before.

## Risks / Trade-offs

- The judge ignores the rule, because a prompt rule is not a guarantee → The verify agent has the same rule as a second check. A person reads the `debug` lines.
- The judge gives `uncertain` for a fix that is true → The discussion stays open and a person resolves it.

## Migration Plan

No data migration. To roll back, restore the previous sentence.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: none. `src/core/review/SPEC.md` names the file and not the prompt text.

## Open Questions

- Whether a statement like "the build passes" (`show.vue` line 590) is covered. The judge can check it only by the build, which it cannot run. This change treats it as a statement that the judge cannot check.
