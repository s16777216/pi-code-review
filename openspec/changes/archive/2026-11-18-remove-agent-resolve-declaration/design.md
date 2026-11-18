## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `createSubmitReviewTool` in `src/core/review/agent.ts` has a `resolved` array in its parameters and validates each item with `validateResolvedDiscussion`. It returns `ParsedReviewOutput` with `findings` and `resolved`.
- `SYSTEM_PROMPT` in `src/core/review/engine.ts` has a paragraph that tells the agent to declare a discussion fixed. It also describes the `resolved` field of `submit_review`.
- `review()` merges the `resolved` of all runs in `resolvedById` and passes `{ findings, resolved }` to `runChecks`.
- `runChecks` in `src/core/review/checks.ts` takes the declarations of the agents, builds `declaredIds`, calls the judgment step, appends its declarations, and keeps the first declaration for each ID. A map `judgedOnly` marks the IDs that come only from the judge.
- `selectDiscussions` in `src/core/review/judge.ts` excludes the IDs in `declaredIds`.
- `src/findingsFile.ts` uses `validateResolvedDiscussion` to read `findings.json`. That use does not change.
- The tool parameters are TypeBox objects. This change does not set `additionalProperties`, so a model that still sends `resolved` does not fail validation. The implementation MUST check that the extra field is ignored.

## Goals / Non-Goals

**Goals:**
- Make the judge the only source of fixed declarations.
- Remove the rules that exist only to merge two sources.
- Keep the output format of `findings.json`, `publish`, and the CLI.

**Non-Goals:**
- Add the verifier check on the `fixed` judgments. A separate change does that.
- Change the discussion tool of the review agent. The agent still reads discussions to avoid a repeated finding.
- Change how a declaration of the judge goes through the checks.

## Decisions

### Decision 1: Remove the field and the prompt paragraph

`submit_review` has only `findings`. The system prompt keeps the rule to read the discussions of a file before it reports a problem, and keeps the `relatesTo` rule. It loses the paragraph about declaring, and the output description names one field.

Alternative: keep the field and ignore it in the code. The agent would still spend tokens on a declaration that has no effect, and the prompt would say something untrue.

### Decision 2: An extra `resolved` field is ignored and not an error

A model can still send `resolved`, for example from the training of an earlier prompt. The system accepts the call, keeps the findings, and drops the field. A rejection would cost a retry for no gain.

The tests prove this with a call that has findings and a `resolved` array. If the tool framework strips or keeps unknown fields, the result is the same, because the code reads only `findings`.

### Decision 3: `runChecks` takes the findings and the judgment step

`ParsedReviewOutput` has only `findings`. The first argument of `runChecks` is that output, so its `resolved` goes away. The judgment step becomes `(findings) => Promise<JudgedDeclaration[]>`. It does not get declared IDs.

`runChecks` passes the declarations of the judge to `checkResolved` with the map of evidence lines. The map now has a key for each judge declaration. The code that marks the IDs that come only from the judge is removed, and the `source` log field applies to each declaration.

When no judgment step is given, `runChecks` returns no declarations. The only caller, `review()`, always gives the step.

### Decision 4: The judge selects each eligible discussion

`selectDiscussions(discussions, findings)` drops the third parameter. The selection rules are: this tool started it, not resolved, has a file and an anchor, and no remaining finding links to it.

This is the only change in who gets a judge run. A discussion that an agent used to declare now gets a judgment, and an agent declaration that the check would have dropped no longer blocks a judge run.

### Decision 5: Specs

The main spec removes "Declare fixed discussions". Its scenario about an output with no `findings` array is already covered by "Produce structured findings", scenario "Agent output does not parse". A new requirement "Do not offer fixed declarations to the review agent" states the new rule and the ignored field. The OpenSpec check does not let a modified requirement drop a scenario. Three requirements lose scenarios about agent declarations, so each one is removed and added again under a new name. The other requirements lose only words and keep every scenario that still applies.

## Risks / Trade-offs

- A discussion that an agent would have declared now needs a judge run → The cost is one run for each file with such a discussion, and the run is the same run that judges the other discussions of the file. The agent declaration was not stable, so it did not give a cost saving that a review could rely on.
- A model sends `resolved` and the framework rejects the call → The implementation tests this case. If the framework rejects it, the schema gets an optional ignored field.
- Existing tests use agent declarations → They change to use the judgment step or are removed. The golden file changes with the prompt.
- Anyone who reads the old system prompt text → The prompt text is not an interface. The `findings.json` format is the same.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, restore the field, the paragraph, and the merge code.

## Open Questions

None. The order with `judge-evidence-line` is fixed: that change is archived first.
