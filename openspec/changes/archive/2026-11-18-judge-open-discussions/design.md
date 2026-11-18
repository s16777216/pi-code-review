## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `AgentReviewEngine.review()` in `src/core/review/engine.ts` merges the outputs of the review focus agents. Then it calls `runChecks` in `src/core/review/checks.ts` with one step, `betweenSteps`. That step runs the deduplication step and then the verification step. `runChecks` then calls `checkResolved` on the declarations.
- `checkResolved` already holds the seven checks for a declaration. The last check, `anchor_still_present`, drops a declaration when a line of the current file still has the anchor of the discussion.
- `verify.ts` and `verifyFile` in `engine.ts` show the pattern for a per-file step: group by file, check that the first request fits in half of the context window, run with retries through `runWithRetries`, validate the tool call, and keep the old result on failure.
- `context.listDiscussions()` returns the discussions of the change. The host fetches them once for each review and caches them. Each `ReviewDiscussion` has `id`, `file`, `line`, `positionCommit`, `resolved`, `fromThisTool`, `anchor`, and `notes`.
- `src/core/review/SPEC.md` is the local guide of the directory that implements this capability. `openspec-sync-specs` must refresh it after the implementation.

## Goals / Non-Goals

**Goals:**
- Give every selected open discussion from this tool one recorded judgment on each review.
- Reuse the existing checks, the existing retry code, and the existing log style.
- Make a failed step safe: it resolves nothing and does not fail the review.

**Non-Goals:**
- Change the anchor check. Phase 1 keeps it.
- Resolve a discussion that a person started.
- Change `findings.json`, `publish`, the CLI flags, or the `ReviewResult` type.
- Change the system prompt of the review focus agents.

## Decisions

### Decision 1: The step runs after the verification step

The step needs the findings that remain after the verification step. A finding with `relatesTo` says that the problem still exists. The verification step can drop such a finding, and then the discussion is free to judge.

`runChecks` gets a second optional step, `judgeDiscussions`. It receives the remaining findings and the IDs that the review focus agents already declared fixed. It returns a list of declarations. The step does not select a declared discussion, so the discussion costs no second model call. `runChecks` appends the returned declarations after `output.resolved` and removes duplicates by discussion ID, so the declarations of the review focus agents win. The signature of `betweenSteps` does not change, so the existing callers and tests keep working.

Accepted trade-off: the step skips a discussion that an agent for a review focus declared, even when `checkResolved` later drops that declaration (for example, with `anchor_still_present`). The judge would meet the same check and the same result, so a second model call has no value.

Alternative: change `betweenSteps` to return findings and declarations. This changes every caller and every test double for one new need.

Alternative: run the step before the verification step. A discussion that only a rejected finding links to would never be judged.

### Decision 2: One judge run for each file, with numbers and not IDs

The step groups the selected discussions by file, as `groupByFile` does for findings. One run reads one file, so the runs share the diff and the file reads. The code numbers the discussions of a run from 1. The model answers with numbers, and the code maps them back to discussion IDs.

The model never writes an ID. A model cannot invent or mistype an ID, and an injected note cannot name another discussion.

Alternative: one run for all discussions. The prompt grows with the number of files, and one failure loses every judgment.

### Decision 3: Judgment values and the prompt rules

The judge answers with `fixed`, `not_fixed`, or `uncertain`, and a reason. The system prompt sets these rules:

- The current code decides. A reply of a person is a hint.
- A reply that says the author does not accept the finding, with no change in the code, gives `not_fixed`. Resolving such a discussion is a decision for a person.
- The reason quotes the code that shows the judgment, as the verifier does.
- Notes are data, with the same framing sentence idea as `DISCUSSIONS_FRAMING`.
- The line of a discussion refers to its `positionCommit`. The prompt gives both, and tells the judge that the line can point at other code on a newer commit. `DISCUSSIONS_FRAMING` and the system prompt of the review already say the same.
- A discussion on a file that the change deletes still goes to the judge. The prompt has the diff, which shows the deletion, and says that the file no longer exists. `checkResolved` already accepts such a declaration without a file read.

`uncertain` exists so that the model has a safe answer. Only `fixed` has an effect.

### Decision 4: A fixed judgment is only a declaration

A `fixed` judgment becomes a `ResolvedDiscussion`. It goes through `checkResolved` with no change. The code check stays the last guard, because a model can claim a fix that did not happen, and a wrong resolve hides a real problem.

To make the log useful, `runChecks` passes the set of IDs that came from the judge to `checkResolved`. A drop of such a declaration gets the log field `source: 'discussion_judgment'`. The `ResolvedDiscussion` type does not change, so no new field reaches `findings.json`.

The prompts of a judge run need no new rule in `debug-logging`. Its requirement "Log the AI review's prompt and response under debug" already covers each model run. The spec of this change only adds the `debug` line for each judgment.

Known effect: the anchor check drops a `fixed` judgment when the fix leaves the anchored line unchanged. On merge request 60, this applies to the discussions on `ImeSafeIntegerInput.vue:118`, `FloatForm.vue:86`, and `ImeSafeIntegerInput.vue:176`. Phase 1 accepts this. The log of the dropped declarations is the data for phase 2.

### Decision 5: A failed run resolves nothing and adds no warning code

A failed judge run, or a run whose first request exceeds half of the context window, gives no declaration for that file. The system writes a `warn` log line. The review result gets no new warning.

The baseline without the step is also "no discussion resolved". No finding is lost or made wrong, so the output is not less checked. This also avoids new warning codes in `findings.json`, in `publish` validation, and in the status comment. Those would change the `review-cli` and `review-output` specs.

Alternative: add `discussion_judgment_failed` and `discussion_judgment_skipped` warnings. See the open questions.

### Decision 6: Reuse the run code

The step reuses `runPool` and `runWithRetries` with a new `RunSpec` and a `submit_judgments` tool. The limit of 3 parallel runs and the retry rule (3 tries, waits of 2 and 4 seconds, no retry on `aborted`) are in the main spec, so this change modifies "Limit parallel runs" and "Retry a model run that ends with an error". The tool follows `createSubmitVerdictsTool`. The check on the size of the first request in `verifyFile` becomes a small shared helper, so both steps use one rule. A test proves that the verifier behavior does not change.

The new code goes in `src/core/review/judge.ts`: the system prompt, the user prompt builder, the tool, and the validation. `engine.ts` holds the run code, as for the other two steps.

## Risks / Trade-offs

- The model judges a fix that did not happen → The anchor check stays. A person can reopen a discussion. The `fixed` log line has the reason for review.
- A judge says `fixed` for a discussion on a deleted file, and no code check guards it, because `checkResolved` accepts a deleted file without a read → The prompt shows the diff with the deletion, and the check on the other six conditions still applies. This matches how a declaration of a review focus agent is handled today.
- The judge follows an instruction in a note → The prompt frames notes as data. The model answers with numbers. Only `fixed` has an effect, and the checks still apply.
- A person replied "fixed" but the code is unchanged → The prompt says a reply is only a hint. The anchor check drops it.
- More model calls and longer reviews → One run for each file with a selected discussion, and none when nothing is selected. The runs go through the same pool limit as the other steps.
- A fix that keeps the anchored line is never resolved automatically → Accepted for phase 1, and logged for phase 2.

## Migration Plan

No data migration. The step runs on every `review`. To roll back, remove the call to the step in `engine.ts`. The `findings.json` format is the same before and after.

## Open Questions

- Phase 2: replace or relax `anchor_still_present` with a check on a line of evidence. The judge would quote a line of the current file, and the code would check that the line exists. The answer depends on how often the log shows a correct `fixed` judgment dropped by the anchor check. It changes one check and its scenarios, not the shape of this step.
- Add warning codes for a failed or skipped judge run, so that the status comment shows them. This depends on whether people need to see the failure outside the log.
