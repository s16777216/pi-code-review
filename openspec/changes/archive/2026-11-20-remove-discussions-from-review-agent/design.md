## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `createListDiscussionsTool` in `src/core/review/agent.ts` gives the review agents the `list_discussions` tool. `createAgent` in `engine.ts` adds it to the tools of each review agent run.
- `SYSTEM_PROMPT` in `engine.ts` has a paragraph that tells the agent to read the discussions of a file before it reports a problem, and a sentence about the optional `relatesTo` field of a finding.
- The `submit_review` schema has `relatesTo` on a finding, and `validateFinding` in `findings.ts` reads it. `findingsFile.ts` also uses `validateFinding` to read `findings.json`, and `findings.json` can have `relatesTo` from the verify agent. So `validateFinding` keeps its support of `relatesTo`.
- `checkRelatesTo` in `checks.ts` removes a `relatesTo` that names no known discussion. It runs first in `runChecks`.
- `buildVerifyAgentPrompt` in `verifyAgent.ts` gives each finding the number of the discussion that its `relatesTo` names, as a hint.
- The deduplication step and the verification step have rules that move or keep `relatesTo` of the findings. They read `Finding.relatesTo` of any finding.

## Goals / Non-Goals

**Goals:**
- Make a review agent independent of the discussions: it reads the diff and the code, and it reports findings.
- Make the verify agent the only source of `relatesTo`.

**Non-Goals:**
- Remove `relatesTo` from the `Finding` type, from `validateFinding`, or from `findings.json`. The verify agent and `publish` use it.
- Remove the `relatesTo` rules of the deduplication step and the verification step. They become inert. A later cleanup removes them with their tests and requirements.
- Change `publish`, the judge, or the verify agent, except the removal of the hint.

## Decisions

### Decision 1: Remove the tool and the prompt text together

The review agents get no `list_discussions` tool, and the system prompt has no paragraph about discussions. A prompt that names a tool that does not exist would make the agent call it and fail. The sentence about the optional `relatesTo` field goes away with the paragraph, and the output description keeps one field: `findings`.

Alternative: keep the tool and ignore the answers. The agent would still spend calls and tokens, and the prompt would say something untrue.

### Decision 2: A `relatesTo` in a call is ignored

A model can still send `relatesTo`, for example from the training of an earlier prompt. The tool accepts the call, removes the field from each finding before it validates the finding, and keeps the finding. A rejection would cost a retry for no gain. `remove-agent-resolve-declaration` used the same rule for `resolved`.

The schema does not set `additionalProperties`, so the framework accepts the extra field. A test proves this with a call that has a `relatesTo`.

### Decision 3: The `relatesTo` check goes away

`checkRelatesTo` has no input after this change, because no review agent sets the field. The function and its two `warn` lines (`unknown_discussion` and `discussions_unavailable`) are removed. The verify agent chooses a number from a list of the discussions of the file, and the code maps the number to an ID, so an unknown ID cannot come from it.

### Decision 4: The verify agent gets no hint

Each finding in the prompt of the verify agent loses the field `linkedDiscussion`. The agent decides the link from the finding, the discussions, and the code. The open question of `add-verify-agent` asked whether the hint biases the agent. This change removes the hint with its source.

### Decision 5: A failed verify agent run gives a finding with no link

When the run fails, the findings of the file stay as the review agents wrote them, and they have no `relatesTo`. `publish` then matches such a finding to a discussion from this tool by the anchor, and posts nothing when that discussion is open. A reworded finding on a changed line is posted as a new discussion. This is the cost of a failed run, and the `warn` line names the file.

## Risks / Trade-offs

- The review agent reports a problem that a person already explained → The verify agent drops it when its run works and the file has a discussion. When the run fails, `publish` posts it. The log shows both cases.
- The first search for problems no longer uses the notes of people, so a repeated problem costs one more finding in the result of the review agents → The deduplication and verification steps run before the verify agent, and they see a few more findings. The cost is small.
- Tests of the discussion tool and of the `relatesTo` check are removed → Their requirements are removed in the same change, so no test is left without a rule.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, restore the tool, the prompt paragraph, the schema field, and the check.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (capability `ai-diff-review`). It names `createListDiscussionsTool` in the line of `agent.ts`.

## Open Questions

- Whether `publish` should match a finding with no link by a weaker rule, so that a failed verify agent run posts fewer repeats. It is out of scope here.
