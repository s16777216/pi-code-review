# src/core/review

Implements capability `ai-diff-review` (central spec: `openspec/specs/ai-diff-review/spec.md`).

## Responsibility

A platform-agnostic review engine. It takes a `ReviewContext`, runs an AI agent over the change (whole, or split into batches when it does not fit the context window), and returns validated findings, accepted fixed declarations, and unreviewed files.

## Entry points

- `engine.ts`: `AgentReviewEngine.review()`, `SYSTEM_PROMPT`, `buildSystemPrompt()`. Plans runs, runs them in parallel (`MAX_PARALLEL_RUNS`) with retries (`MAX_RUN_TRIES`), merges results.
- `agent.ts`: the agent's tools: `createGetFileContentTool`, `createListDiscussionsTool`, `createSubmitReviewTool` (the only way the agent reports findings).
- `findings.ts`: `validateFinding`, `validateResolvedDiscussion`, `ReviewFailureError`. Also used by `src/findingsFile.ts`. `Severity` values are `critical`, `high`, `medium`, `low`, `pre_existing`.
- `scope.ts`: `RunScope`, `WholeChange`, `Batch` (what one agent run sees and which findings it may report).
- `batch.ts`: `planBatches`, `MAX_BATCHES`. `prompt.ts`: user prompt builders. `checks.ts`: `runChecks`, `listUnreviewedFiles`. `anchor.ts`: `computeAnchor`.

## Interfaces and dependencies

- Consumes `ReviewContext` and produces `ReviewResult` (`src/core/types.ts`). Nothing here names a host.
- Pass/fail is decided outside the engine by `src/core/passFail.ts` (`decidePassFail`).
- `__golden__/review-output.txt` pins the prompts and output; regenerate it from `characterization.test.ts`'s `renderAll()` when they change on purpose. It must stay LF.
