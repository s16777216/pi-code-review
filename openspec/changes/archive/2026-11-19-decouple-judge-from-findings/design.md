## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `selectDiscussions(discussions, findings)` in `src/core/review/judge.ts` builds the set of `relatesTo` values of the findings and excludes a discussion that is in the set.
- `runChecks` in `src/core/review/checks.ts` calls `judgeDiscussions(findings)` after the deduplication and verification steps. It passes the remaining findings.
- `judgeDiscussions` in `src/core/review/engine.ts` passes those findings to `selectDiscussions`. It uses them for nothing else.
- `checkResolved` in `checks.ts` already drops a declaration for a discussion that a remaining finding links to, with the reason `linked_by_finding`. The rule does not depend on the source of the declaration.
- The prompt of the judge has no finding. The judge reads the discussion, the diff of the file, and the current code.

## Goals / Non-Goals

**Goals:**
- Remove the data dependency of the judge on the findings.
- Keep the result of a review the same: a discussion that a finding links to is never resolved.

**Non-Goals:**
- Run the judge at the same time as the review agents. The order of the steps does not change.
- Change the check on fixed declarations, the prompt of the judge, or `findings.json`.
- Add the second run of the verifier.

## Decisions

### Decision 1: The selection reads the discussions only

`selectDiscussions(discussions)` keeps these rules: this tool started the discussion, it is not resolved, and it has a file and an anchor. It drops the second parameter and the rule about `relatesTo`.

Alternative: keep the rule and only draw the diagram differently. The code would still make the judge wait for the findings, so the diagram would not show the real dependency.

### Decision 2: The check on fixed declarations is the only guard

A discussion that a finding links to is judged. When the judge gives `fixed` for it, `checkResolved` drops the declaration with the reason `linked_by_finding`. The result is the same as before: the discussion stays open.

The step that `runChecks` calls for the judgment gets no argument. `runChecks` still passes the remaining findings to `checkResolved`.

### Decision 3: The order of the steps does not change

The judgment step still runs after the verification step, and the requirement "Run the checks in order on the merged output" does not change. The judge no longer needs the findings, so a later change can start it at the same time as the review agents. This change does not do it, because it needs a new pool design and new tests.

### Decision 4: The cost is accepted

The step can start a judge run for a file where every discussion is linked by a finding. Such a file gave no run before. The run costs one model call for each file. The `warn` line `linked_by_finding` can appear for a `fixed` judgment. The `info` summary line now counts these discussions as selected.

## Risks / Trade-offs

- More judge calls on a review where many discussions are linked → The number of calls is at most one for each file that has a discussion from this tool. The cost is limited by the number of open discussions.
- The judge gives `fixed` for a discussion that a finding says is still open → The check drops the declaration, and the `warn` line shows the conflict. A person can see both.
- The tests of the selection rule change → The tests for the other selection rules stay the same.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, restore the second parameter of `selectDiscussions` and the argument of the judgment step.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (capability `ai-diff-review`). The text of the file may need no change.

## Open Questions

- Run the judge at the same time as the review agents. This follows from Decision 3 and needs its own change.
