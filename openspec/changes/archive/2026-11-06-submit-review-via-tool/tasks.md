## 1. `submit_review` tool

- [x] 1.1 Add `SubmitReviewParams` (TypeBox schema for `findings`/`resolved`, no `anchor` field) and `MAX_SUBMIT_ATTEMPTS = 5` to `src/core/review/agent.ts`.
- [x] 1.2 Implement `createSubmitReviewTool(onSubmit)` in `src/core/review/agent.ts`: validates every item with `validateFinding`/`validateResolvedDiscussion` from `findings.ts`; on any invalid item returns `isError: true` naming every invalid item and keeps none of the call; on an all-valid call calls `onSubmit({ findings, resolved })` and returns `terminate: true`; on the `MAX_SUBMIT_ATTEMPTS`-th invalid call returns `isError: true, terminate: true`. Verify with new unit tests in `src/core/review/agent.test.ts` mirroring the `get_file_content` test style: valid call, one invalid finding, one invalid declaration, attempt-limit exhaustion, and a corrected second call after a rejected first call.

## 2. Wire the tool into the engine

- [x] 2.1 Update `SYSTEM_PROMPT` in `src/core/review/engine.ts`: replace the "output ONLY a JSON object" paragraph with an instruction to call `submit_review` once, when done, keeping the existing per-field guidance (what `line`/`relatesTo`/etc. mean). Verify by reading the updated prompt text and confirming no remaining reference to "output ONLY a JSON object" or similar free-text instruction.
- [x] 2.2 Give `createAgent` an optional `onSubmit?: (output: ParsedReviewOutput) => void` parameter (default a no-op) and include `createSubmitReviewTool(onSubmit)` in the agent's `tools` array. Verify `estimateFirstRequest` (which calls `createAgent` with no `onSubmit`) still compiles and its existing tests still pass unchanged.
- [x] 2.3 Rewrite `runOnce` in `src/core/review/engine.ts`: declare a `submission` variable, pass a closure that sets it to `createAgent`, keep the existing `stopReason` checks (`'error'` retryable, `'aborted'`/`'length'` throw) unchanged, then after those checks return `{ output: submission }` when set or `{ retryableError: 'The agent run ended without an accepted submit_review call.' }` otherwise. Remove the final `text`/`parseReviewOutput` call entirely. Verify with the updated `engine.test.ts` (task 4).

## 3. Clean up `findings.ts`

- [x] 3.1 Search the repo for every remaining caller of `parseReviewOutput`, `parseFindings`, `extractJsonText`, and `withoutAgentAnchor` outside their own tests. Verify by confirming the search finds no caller left once task 2.3 lands.
- [x] 3.2 Delete `parseReviewOutput`, `parseFindings`, `extractJsonText`, and `withoutAgentAnchor` from `src/core/review/findings.ts`, and delete their dedicated tests from `src/core/review/findings.test.ts`, keeping `validateFinding`/`validateResolvedDiscussion`/`ReviewFailureError` and their tests. Verify `npm test` (or the project's test command) still passes for `findings.test.ts`.

## 4. Update engine tests for the tool-call protocol

- [x] 4.1 Update every `engine.test.ts` case that drives the agent's final answer via `fauxAssistantMessage(JSON.stringify(...))` to instead use `fauxAssistantMessage([fauxToolCall('submit_review', { findings: [...], resolved: [...] })], { stopReason: 'toolUse' })` followed by a closing assistant message, mirroring the existing two-step `get_file_content` pattern already in the first test. Verify the full existing test suite in `engine.test.ts` passes with the new call shape.
- [x] 4.2 Add a test: the agent's only response is plain text with no tool call → the review fails with the "ended without an accepted submit_review call" error. Verify it replaces any now-invalid "not valid JSON"-style test for the engine's own flow (the equivalent coverage for `validateFinding`/`validateResolvedDiscussion` directly stays in `findings.test.ts`).
- [x] 4.3 Add a test: first `submit_review` call has one invalid finding, second call (same run) is fully valid → the review succeeds with only the second call's data, and this does not consume one of the run-level `MAX_RUN_TRIES` retries (assert the provider's call count reflects one run, two tool calls, not two full runs). Verify this test passes and fails if `runOnce` is reverted to fail the run on the first invalid call.
- [x] 4.4 Add a test: every `submit_review` call in a run is invalid up to `MAX_SUBMIT_ATTEMPTS` → the run fails as a retryable error and (with `MAX_RUN_TRIES` tries available) the engine retries the whole run with a fresh agent. Verify by asserting the provider is called for a new run's first turn after the attempt limit is hit.

## 5. Full verification

- [x] 5.1 Run the project's full test command and confirm it passes, including `agent.test.ts`, `engine.test.ts`, and `findings.test.ts`.
- [x] 5.2 Run `openspec validate submit-review-via-tool --strict` and confirm it passes before archiving.
