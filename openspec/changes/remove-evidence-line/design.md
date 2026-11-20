## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `runChecks` in `src/core/review/checks.ts` gets the declarations of the judge, calls the verify agent step, and then calls `checkResolved` on the resolved discussions for the log only. The result is the result of the verify agent.
- `checkResolved` has the rules: the discussion exists, this tool started it, it is not resolved, it has an anchor, no finding links to it, the file is readable, and the anchor is gone or the evidence line is valid. It uses `evidenceProblem` and `normalizeLine`.
- The judge gives `evidence` for a `fixed` judgment. `validateJudgments` in `judge.ts` trims it. `judgeDiscussions` in `engine.ts` copies it to the declaration, and `JudgedDeclaration` carries it. The prompt of the verify agent gives it as `evidenceLine`.
- The judge selects only a discussion from this tool that is open and has a file and an anchor. The verify agent can resolve only a discussion that the judge declared. So most rules of `checkResolved` hold by construction.
- Three smoke tests on one merge request gave `comparison` lines for 4 of 9, 4 of 9, and 3 of 8 resolved discussions. The code check rejected them, and the verify agent resolved them. A person has not yet checked whether these are right.

## Goals / Non-Goals

**Goals:**
- Remove the evidence line and the code check, so that the code says what happens: the verify agent decides.
- Keep the result of a review the same, apart from the discussions that the code check would have rejected.

**Non-Goals:**
- Change the verify agent, the judge selection, or the anchor.
- Replace the code check with another rule of the code.

## Decisions

### Decision 1: Implement only after the gate

The code check is the only measure of the verify agent that does not use a model. This change removes it. So the change waits for data.

The gate is true when all of these hold:

- A person has read each `warn` line with the field `comparison` of at least 3 reviews on real merge requests, and has checked the code of each discussion.
- The person judged every resolve of the verify agent in those lines to be right, or the reviews have no such line.
- The reviews ran with the current version of the verify agent.

When the person judges any of these resolves to be wrong, the change does not go on. The choice is then between keeping the code check as a rule, and changing the verify agent.

Alternative: implement now and rely on the log of the verify agent. The debug lines show the reasons, but nothing in the code stops a wrong resolve.

### Decision 2: Remove the code check, and not only its log

`checkResolved` has no job after the evidence line goes. Keeping a part of it, such as the anchor rule, would be a new rule with a new reason. This change adds no new rule.

`runChecks` keeps the diff line check and the anchor of the findings. It calls the judgment step and the verify agent step, and it returns the result of the verify agent. It no longer needs `context`, so the parameter goes away.

### Decision 3: An `evidence` in a call is ignored

A model can still send `evidence`, for example from the training of an earlier prompt. `validateJudgments` removes the field and does not reject the call. A rejection would cost a retry for no gain. This is the rule that `remove-agent-resolve-declaration` and `remove-discussions-from-review-agent` used for `resolved` and for `relatesTo`.

### Decision 4: The verify agent keeps the reason of the judge

The declaration has the discussion and the reason of the judge. The prompt of the verify agent keeps the reason as a hint. The sentence that tells the agent to check the evidence line in the code goes, and the sentence about the reason stays.

### Decision 5: The glossary

The term `evidence line` leaves `openspec/GLOSSARY.md` when the change is archived, because the system no longer has it.

## Risks / Trade-offs

- A wrong resolve has no check of the code → The gate asks for a person to read the comparison lines before this change goes on. A later review can still use the `debug` lines of the verify agent.
- The data for the gate is small → The gate names a number of reviews and a person who checks. If the data is too small, the change waits.
- More resolves than before → The verify agent already resolves them. The code check only logged them. The result is the same as the current result.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, restore `checkResolved`, the `evidence` field, and the prompt text. The previous version is in the history of `judge-evidence-line`.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (capability `ai-diff-review`). The line for `judge.ts` and the line for `checks.ts` name the evidence line.

## Open Questions

- Who reads the comparison lines for the gate, and when. The owner of the project decides.
- Whether a rule of the code should check a resolve in another way, such as a check that the file has changed since the commit of the discussion. This change does not add one.
