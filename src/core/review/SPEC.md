# src/core/review

Implements capability `ai-diff-review` (central spec: `openspec/specs/ai-diff-review/spec.md`).

## Responsibility

A platform-agnostic review engine. It takes a `ReviewContext`, runs three AI agents over the change, one for each review focus (the whole change, or batches when it does not fit the context window), removes duplicate findings, and returns validated findings, accepted fixed declarations, and unreviewed files.

## Entry points

- `engine.ts`: `AgentReviewEngine.review()`, `SYSTEM_PROMPT`, `buildSystemPrompt()`. Plans the run scopes, runs three agents on each (one for each review focus) in one pool (`MAX_PARALLEL_RUNS`) with retries (`MAX_RUN_TRIES`), merges results, and runs the deduplication step.
- `focus.ts`: `REVIEW_FOCUSES`, the three built-in review focuses and their system prompt paragraphs.
- `dedup.ts`: the deduplication step: `selectForDedup`, `buildDedupPrompt`, `validateGroups`, `keepOnePerGroup`, and the `submit_groups` tool.
- `agent.ts`: the agent's tools: `createGetFileContentTool`, `createListDiscussionsTool`, `createSubmitReviewTool` (the only way the agent reports findings).
- `findings.ts`: `validateFinding`, `validateResolvedDiscussion`, `ReviewFailureError`. Also used by `src/findingsFile.ts`. `Severity` values are `critical`, `high`, `medium`, `low`, `pre_existing`.
- `scope.ts`: `RunScope`, `WholeChange`, `Batch` (what one agent run sees and which findings it may report).
- `batch.ts`: `planBatches`, `MAX_BATCHES`. `prompt.ts`: user prompt builders. `checks.ts`: `runChecks` (takes an optional step that runs before the check on fixed declarations), `listUnreviewedFiles`. `anchor.ts`: `computeAnchor`.
- `fauxFocus.ts`: test helpers that route faux provider responses by review focus.

## Interfaces and dependencies

- Consumes `ReviewContext` and produces `ReviewResult` (`src/core/types.ts`). Nothing here names a host.
- Pass/fail is decided outside the engine by `src/core/passFail.ts` (`decidePassFail`).
- `__golden__/review-output.txt` pins the prompts and output; regenerate it with `UPDATE_GOLDEN=1` when they change on purpose. It must stay LF.
