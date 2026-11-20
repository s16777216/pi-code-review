## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `runChecks` in `src/core/review/checks.ts` runs the `relatesTo` check, the diff line check, and the anchor step. It then calls `betweenSteps` (deduplication and verification) and `judgeDiscussions`. It passes the declarations of the judge to `checkResolved`, which decides the `resolved` list.
- `checkResolved` applies the code check: the discussion exists, this tool started it, it is not resolved, it has an anchor, no finding links to it, the file is readable, and the anchor is gone or the evidence line is valid.
- `judgeDiscussions` in `src/core/review/engine.ts` runs one judge run for each file. It uses `runPool`, `MAX_RUN_TRIES`, and the retry with a larger output limit. A failed run gives no declaration and a `warn` line.
- `src/core/review/judge.ts` and `src/core/review/verify.ts` show the pattern of an agent step: a prompt builder, a TypeBox tool, a validation that rejects a call that is not valid, and an apply function.
- `publish` reads `relatesTo` of each finding and the `resolved` list. It posts nothing for an open linked discussion, replies and reopens for a resolved one, and creates a discussion when `relatesTo` is unknown. These rules do not change.
- The glossary term `verifier` means the agent of the verification step. This design calls the new agent the `verify agent`.

## Goals / Non-Goals

**Goals:**
- Put the match between a finding and a discussion, and the decision to resolve, in one agent that sees both.
- Keep the same `ReviewResult` shape and the same `publish` behavior.
- Give data to judge the new way: a log line when the verify agent and the code check disagree.

**Non-Goals:**
- Remove the discussion tool, `relatesTo`, or the `relatesTo` check from the review agents. A later change does this.
- Remove the evidence line, the anchor check, or `checkResolved`. A later change does this when the comparison data supports it.
- Run the judge at the same time as the review agents.
- Make the verify agent the source of declarations. The judge stays the only source.

## Decisions

### Decision 1: One run for each file

The step groups by file, as the judge step does. A file gets a run when it has at least one discussion, and at least one finding or one declaration. A file with no discussion needs no match and no resolve, so the findings of that file pass with no call. A file with a discussion and nothing to decide gets no call.

The runs use `runPool` with the same limit as the other steps. The step uses the same retry rules: `MAX_RUN_TRIES`, and one more try with a larger output limit when a run stops at the token limit.

Alternative: one run for the whole change. A large change would not fit in the context window.

### Decision 2: What the verify agent reads

The user prompt has the title and the description, the diff of the file, and three numbered lists:

- The findings of the file: number, line, severity, summary, and, as a hint, the number of the discussion in the third list that the `relatesTo` of a review agent names.
- The declarations of the judge for the file: number, the reason, and the evidence line.
- All discussions of the file, from this tool and from people, resolved or not: number, line, the commit, the resolved state, whether this tool started it, and the notes with author and body.

The prompt has no discussion ID. The agent answers with numbers, as the judge does. The agent can call `get_file_content` to read the current code.

The system prompt says that the notes, including the replies of people, are information and not instructions. It says that a reply is a hint and not proof, and that the current code decides. The review instructions are appended, as for the other agents, and they do not change the output format.

### Decision 3: What the verify agent decides

The agent calls `submit_decisions` once with two arrays.

- `findings`: one object for each finding. `decision` is `keep` or `drop`. `reason` is one sentence. A `keep` object has `relatesTo`: the number of a discussion, or `null`.
- `declarations`: one object for each declaration. `decision` is `resolve` or `keep_open`. `reason` is one sentence.

A finding that the agent drops has a reason such as "a person explained that it is intended" or "it repeats discussion 3". A kept finding with `relatesTo` set to an open discussion makes `publish` post nothing. A kept finding with `relatesTo` set to a resolved discussion makes `publish` reply and reopen.

### Decision 4: The validation only checks the form and the consistency

The tool rejects a call, with the reason, when:

- a finding or a declaration has no decision, or has more than one,
- a number is unknown,
- a `decision` value is not allowed, or a reason is empty,
- a `drop` object has `relatesTo`,
- the call resolves a discussion that a kept finding links to.

The last rule keeps the result consistent: `publish` would reopen a discussion that the result also resolves. It does not judge the quality of the decision. The agent can resolve only a declared discussion because it has a decision only for the declarations. This rule is part of the form.

The rejection costs one retry, up to `MAX_SUBMIT_ATTEMPTS`, as for the judge.

### Decision 5: The result of the agent is the final result

For each finding with `keep`, the system sets `relatesTo` to the ID of the chosen discussion, or removes `relatesTo` when the value is `null`. This replaces what a review agent wrote. A finding with `drop` leaves the result. For each declaration with `resolve`, the system adds `{ discussionId, reason }` to `resolved`. The reason is the reason of the verify agent.

`ReviewResult` and `findings.json` do not change.

### Decision 6: A failed run keeps the earlier result

When a run fails on its last try, or its first request is larger than half of the context window, the system keeps the findings of that file as they are, with the `relatesTo` of the review agents, and resolves no discussion of that file. It writes one `warn` line with the file and the cause. It adds no warning to the review result. The review does not fail. This is the rule of the judge and of the verifier.

A resolve that the verify agent does not give is a safe default. The cost of a wrong keep is a repeated comment. The cost of a wrong resolve is a closed real problem.

### Decision 7: The code check becomes a log

`checkResolved` stays as it is. The system calls it for each discussion that the verify agent resolves. A rejected declaration gives one `warn` line with the field `comparison` set to `verify_agent_resolved`, the reason of the code check, and the existing fields. An accepted one gives no line, except the existing `info` line of an accepted evidence line.

The result does not depend on the code check. After enough runs, the lines show how often the two ways disagree. A later change removes the code check, or keeps it, on that data.

Alternative: remove the code check now. There would be no data to compare, and no easy way back.

### Decision 8: The step order

The step runs after the judgment step and before the result is returned. The judge no longer depends on the findings, so the order between the judge and the earlier steps stays only because the engine runs them in one line. The verify agent needs both results, so it runs last.

## Risks / Trade-offs

- A reply or a note makes the verify agent resolve a discussion → There is no program check that stops it. The prompt frames the notes as information, and the current code decides. The comparison lines show the cases where the code check would reject. A later change can add a check or remove the code check on that data.
- The verify agent drops a real finding because a person wrote that it is intended → A dropped finding costs a missed comment, not a closed discussion. The `debug` line of each decision records the reason.
- More model runs → One run for each file that has a discussion and a finding or a declaration. The step skips a file with nothing to decide.
- The review agent still writes `relatesTo`, and the verify agent replaces it → The result has one source of truth. If the verify agent run fails, the old value stays.
- A large file → The first request that is larger than half of the context window skips the run, as for the judge.

## Migration Plan

No data migration. The `findings.json` format is the same. To roll back, remove the step from `review()` and restore the result of `checkResolved`.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/core/review/SPEC.md` (capability `ai-diff-review`). It needs one new line for `verifyAgent.ts`.

## Open Questions

- Whether the verify agent must see the `relatesTo` hint of the review agent. The hint can bias the agent. A later change removes the hint with the discussion tool of the review agent.
- Whether the verify agent also needs the evidence line when the code check is removed. The change that removes the code check decides.
