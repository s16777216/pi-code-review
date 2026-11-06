## Why

The review agent must end its run with raw text that is the whole JSON payload. When the model adds any word before or after that JSON, the parse fails. The failure is not retryable at the run level, so the whole review fails, even for a change with many batches where only one batch's model call misbehaved.

## What Changes

- Add a `submit_review` tool. The agent calls this tool with its full set of findings and fixed-discussion declarations, instead of writing them as the final text of its turn. Each call stands on its own: the system does not add a call's findings to an earlier call's findings.
- The tool validates every finding and every declaration of one call with the same checks the system already runs on a findings file. **BREAKING**: when one item of a call is invalid, the system now rejects the whole call, with an error that names every invalid item, and keeps none of that call's findings or declarations. Today the system keeps the call's valid findings and drops only the invalid ones. The agent can call the tool again in the same run after a rejected call.
- Cap the number of `submit_review` calls in one run. After the cap, the run ends and counts as a failed try, so the existing run-level retry (new agent, new tools, up to 3 tries) can recover it.
- **BREAKING**: a run that ends without one accepted `submit_review` call now counts as a failed try and retries at the run level, the same as a run whose final message has the stop reason `error`. Today this case stops the review with no retry.
- Remove the system prompt instruction to output a bare JSON object as the final text message. Remove parsing of the final text message as the review's output.

## Capabilities

### Modified Capabilities

- `ai-diff-review`: the agent reports its findings and declarations through the `submit_review` tool call, not through its final text message. A run with no successful tool call is retried at the run level like a `stopReason: error` run, instead of failing the review outright.

## Impact

- Affected code: `src/core/review/agent.ts` (new tool), `src/core/review/engine.ts` (system prompt, run loop, retry condition), `src/core/review/findings.ts` (its validation functions gain a caller; its JSON-text parsing functions lose their only caller in this path and may become dead code here).
- Affected tests: `agent.test.ts`, `engine.test.ts`, `findings.test.ts`.
- Not affected: `src/findingsFile.ts` and `publish` keep reading the findings file that `review` writes to disk. That file's format and the checks on it (`validateFinding`, `validateResolvedDiscussion`) do not change.
