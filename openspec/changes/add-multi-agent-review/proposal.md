## Why

The `review` command uses one agent for each part of the change. One agent follows one line of reasoning, so it misses some problems. A run of the same change can find different problems each time. The team wants fewer missed problems.

## What Changes

- **BREAKING**: Run three agents for each run scope, in place of one. A run scope is the whole change, or one batch. Each agent has a different review focus. The review always does this, and no flag turns it off. The number of model calls for a review is about three times larger, plus at most one more call for the deduplication step. A review takes more time and costs more.
- Add three review focuses, built into the program and not configurable:
  1. logic correctness
  2. security
  3. resources and concurrency
- Tell each agent that its review focus is its main area, not a limit. An agent still reports any other genuine bug that it sees.
- Add the review focus to the system prompt after the paragraph of the run scope and before the review instructions. Every agent gets the same review instructions.
- Count the largest first request of the three review focuses in the batch budget. All agents use the same plan for the batches.
- Run all agents (batches times focuses) in one pool of at most 3 runs at the same time.
- Fail the review when one agent still fails after its last try. This is the rule for a failed batch today.
- Merge the findings of all agents. Keep the existing rule for fixed declarations: the first declaration for a discussion wins.
- Add a deduplication step after the merge and after the checks on `relatesTo` and the diff line. The program calls the model once, and only when at least one file has two or more findings. The model sees only the findings of those files, with the file, the line, the severity, and the summary of each finding. The model returns only groups of finding numbers. The program checks the groups, and fails the review when the groups are not valid or the call fails after its last try.
- Keep one finding in each group. The program keeps the finding with the highest severity, and the first one when the severities are equal. The severity order is `critical`, `high`, `medium`, `low`, `pre_existing`. The program does not change the text of the finding. The kept finding takes the `relatesTo` of the first finding in the group that has one, when the kept finding has none.
- Write one `info` log line for each review focus with the number of findings. Write one `info` log line for the deduplication step with the numbers of findings before and after it.
- Keep the findings file as it is. It does not record the review focus.
- State the cost in the README as a breaking change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ai-diff-review`: The review runs three agents for each run scope, each with a review focus. The requirements cover the review focuses, the system prompt, the pool of runs, the batch budget, the retry and failure rules, the merge, and the deduplication step. Existing requirements that say "one agent" or "one run for each batch" change.

## Impact

- `src/core/review/engine.ts`: a list of review focuses, a change to `buildSystemPrompt`, runs for each batch and focus, the merge, and the call of the deduplication step.
- `src/core/review/dedup.ts` (new): builds the prompt for the deduplication step, checks the groups, and picks the finding to keep.
- `src/core/review/checks.ts`: `runChecks` is split in two parts, so that the deduplication step runs between them.
- `src/core/review/SPEC.md`: lists the new file.
- `src/core/review/__golden__/review-output.txt` and `characterization.test.ts`: the golden file changes, because the system prompt now holds a review focus.
- `README.md`: the cost of the review and the breaking change.
- No new dependency. No change to the findings file, to the `publish` command, to the CLI flags, or to a host provider.
- This change builds on the archived `add-review-instructions`. The review instructions go to every agent.
- The vote of other agents on each finding is a later change.
