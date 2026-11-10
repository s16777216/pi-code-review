## Context

`AgentReviewEngine.review()` in `src/core/review/engine.ts` plans a list of run scopes (`planRuns`): one `WholeChange`, or one `Batch` for each batch. `runAll` runs the scopes in a pool of at most `MAX_PARALLEL_RUNS` (3) runs. `runWithRetries` tries a run at most `MAX_RUN_TRIES` (3) times. Then `review()` filters the findings of each run by its scope, merges the outputs, and calls `runChecks`.

`buildSystemPrompt(language, scope, instructions)` builds the system prompt: the general guidance, the paragraph of the scope, the review instructions, and the language sentence. `estimateFirstRequest` builds an agent with `createAgent` and estimates the size of its first request. The plan for the batches uses that estimate with half of the context window as the budget.

`runChecks` in `src/core/review/checks.ts` checks `relatesTo`, the diff line, the anchor, and the fixed declarations on the merged output.

See `proposal.md` for the motivation and `specs/ai-diff-review/spec.md` for the requirements.

## Goals / Non-Goals

**Goals:**
- Find more problems by running three agents, each with a review focus.
- Keep one set of findings, with no duplicate for the same problem.
- Keep the engine free of any host name, and keep the findings file as it is.

**Non-Goals:**
- A vote of other agents on each finding. This is a later change.
- A setting for the review focuses, for the number of agents, or to turn the feature off.
- A review focus in the findings file, or in the comments that `publish` writes.
- A new tool for the agents that find problems. The three agents use the tools of today.

## Decisions

### Decision 1: A run is a scope and a review focus

The list of runs holds one entry for each pair of a scope and a review focus. The order is by scope, then by review focus: logic correctness, security, and resources and concurrency. `runAll` already runs a list with a pool of 3, so it does not change. The output of run `i` goes with its scope and its review focus. `filterFindings` still belongs to the scope.

The review focus is a plain value, not a new kind of scope. It answers one question, "what is your main area". The scope answers another, "what do you see". Two values keep both answers apart, and `RunScope` and `Batch` do not change.

Alternatives:
- Make a scope class for each pair. This copies the batch code three times.
- Run three engines, one for each review focus, and merge their results. The batch plan is then made three times, and the pool is not shared.

### Decision 2: Where the review focus goes and how the budget counts it

`buildSystemPrompt` gets a review focus argument. The order is the general guidance, the paragraph of the scope, the paragraph of the review focus, the statement and the review instructions, and the language sentence. The review instructions stay after the review focus, so a team can still win over the text of the review focus.

Each paragraph says that the review focus is the main area and not a limit. It also says that the agent still reports any other genuine bug. The rest of the guidance in `SYSTEM_PROMPT` is the same for the three agents. That includes the rule to report only genuine bugs, so a review focus does not open the door to style findings.

`estimateFirstRequest` is called for each of the three review focuses, and the plan uses the largest of the three. The plan for the batches is then the same for the three agents. A call for each review focus is exact. It does not depend on which paragraph is the longest in characters.

Alternatives:
- Put the review focus after the review instructions. The review instructions then cannot win over it, which contradicts the statement.
- Estimate with the longest paragraph only. This needs a rule to find the longest paragraph, and the estimate for a tool or a tokenizer can differ.

### Decision 3: The pool, the retry rule, and the failure rule do not change

All runs share the pool of 3. `MAX_RUN_TRIES`, `RETRY_DELAYS_MS`, and the abort of active runs apply to every run, so the existing code works. A review with one scope runs its three agents at the same time. A review with 20 batches has 60 runs, and the time grows with the number of runs. The pool is not larger, because the local model proxy of a team has failed under load before.

The retry log line and the failure message get the review focus in addition to the batch number. `logFields()` of the run holds the batch number when there is one, and the engine adds the review focus.

### Decision 4: The deduplication step runs after the first checks

The order is: filter the findings of each run by its scope, merge, check `relatesTo` and the diff line, compute the anchor, run the deduplication step, and then check the fixed declarations. This is different from the first idea of this change, where the step ran before every check.

The step runs after the checks on `relatesTo` and the diff line because of two reasons. First, the model sees only findings that survive. A finding that the diff line check drops cannot win a group and then disappear with the finding that it replaced. Second, the model gets fewer findings. A kept finding takes the `relatesTo` of its group, so the check on the fixed declarations sees the same links as before.

`runChecks` gets a small change so that the engine can run the step between the two parts. The preferred shape is two exported functions with `runChecks` as their composition, so the existing tests keep their meaning.

### Decision 5: The deduplication step is a short agent run with one tool

The step is a new module, `src/core/review/dedup.ts`. It builds its own system prompt and user prompt, and an agent with one tool, `submit_groups`. The agent has no tool to read files or discussions. The model sees the findings as a numbered list with the file, the line, the severity, and the summary. Only the findings of files with two or more findings are in the list. The list has the number of the finding in the merged order, so the numbers are stable.

The tool takes an array of groups, and each group is an array of finding numbers. A finding that is not a duplicate is a group of one. The tool checks the result in code: each number is in exactly one group, every number is a finding that was sent, and all findings of a group are in the same file. A result that is not valid is rejected with the reason, as `submit_review` does, and the model can send a corrected result. The tool accepts at most 5 calls in one run, the same limit as `submit_review`.

The run uses the same retry rule as the other runs: at most 3 tries with the same delays. The run uses the same abort rule. A run that ends with no valid result is a failed try. After the last try, the review fails and the failure names the deduplication step. The step is not part of the pool, because it runs alone after all other runs.

The program picks the finding to keep from each group (Decision 6). The model does not write any text for the findings, so it cannot change a summary, drop a finding by mistake, or create a finding.

Alternatives:
- Compare the text of two findings in code, for example by line distance. The proposal chose the model, because the same problem can be on lines that are far apart, and two problems can be on the same line.
- Let the model write the merged summary. The text of the finding then needs a new check, and the model can lose the line or the severity.
- Send the code lines of each finding with the list. The model judges better, but the input is much larger and needs its own batches.

### Decision 6: The program picks the finding to keep

The program picks the finding with the highest severity in the order `critical`, `high`, `medium`, `low`, `pre_existing`. The finding that the diff introduces wins over one that existed before, whatever the impact of the older one is. This follows the rule of the general guidance, which sets `pre_existing` on a bug the diff did not introduce. When two findings have the same severity, the first one in the merged order wins. The program does not change the text of the kept finding.

The kept finding takes the `relatesTo` of the first finding of its group that has one, when it has none. Without this rule, a finding that links to an existing discussion could be dropped and `publish` could post the same problem again.

### Decision 7: Logs

Each review focus writes one `info` log line with the number of findings of its runs. The count is made after the filter of the scope and before the checks. The deduplication step writes one `info` log line with the numbers before and after it. With `--debug`, the step logs its system prompt and user prompt in the same way as the other runs.

### Decision 8: Files and capability map

- `ai-diff-review`: `src/core/review`.
  - `engine.ts`: the review focuses, the runs, `buildSystemPrompt`, and the call of the step.
  - `dedup.ts` (new): the prompt, the tool, the check of the groups, and the pick of the finding to keep.
  - `checks.ts`: `runChecks` is split in two so that the step can run between the parts.
  - `findings.ts`: no change is planned. The check of the groups is in `dedup.ts`, because only that module uses it.
- `README.md`: the cost and the breaking change.
- The golden file `src/core/review/__golden__/review-output.txt` changes, because the system prompt now holds the paragraph of a review focus.

## Risks / Trade-offs

- [Every review takes about three times more model calls and costs more] → The README states it. The pool stays at 3, so a review of one scope takes about the time of a single run plus the deduplication step. A review with many batches takes longer.
- [The deduplication step fails, and then the whole review fails] → This is a choice of the project owner. The step runs the retry rule of the other runs, and the model can correct a result that is not valid. The step does not run when no file has two findings.
- [The model joins two different problems in one group, and the program drops one of them] → The group is only for findings in the same file. The program keeps the highest severity, so the loss is the lower one. A later vote of other agents can look at this.
- [The three agents find the same problems and the review gains little] → The review focuses differ, and each focus is a main area and not a limit. The `info` log lines show how many findings each review focus found, so a team can see if one focus finds nothing.
- [A review focus makes an agent report style findings] → The general guidance still says to report only genuine bugs, and each paragraph repeats that the agent reports genuine bugs only.
- [The `outside_batch` filter drops findings of an agent that is outside its batch] → The filter applies to each run, as it does today, so nothing new is needed.
- [The estimate for the first request is made three times] → The estimate is a local calculation and makes no model call.

## Migration Plan

This is a breaking change for cost and time, with no change in the configuration, the CLI, or the findings file. The README states the cost. A team that cannot accept the cost can stay on the version before this change. To roll back, revert the change. The golden file returns with the revert.

## Pending sync notes

Set by `openspec-apply-change` and cleared by `openspec-sync-specs`:

- `src/core/review/SPEC.md` (capability `ai-diff-review`): add `dedup.ts` to the entry points, and update the line about the runs and the merge.
