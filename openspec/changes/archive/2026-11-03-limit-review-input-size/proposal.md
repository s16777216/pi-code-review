# Proposal

## Why

The `review` command has no protection against a large merge request.

- `buildModel` sets `contextWindow` to `128_000` for every model. `pi-ai` uses this value to limit the answer size: it allows `contextWindow` minus the estimated input minus 4096 tokens. A model with a larger real window gets a smaller answer than it can give. With a large input, `pi-ai` can reduce the answer to 1 token. A model with a smaller real window gets no protection.
- `get_file_content` returns the whole file, with no size limit.
- The `pi-agent-core` agent loop has no limit on the number of tool calls. Each call adds its result to the input of the next call.
- When the model stops at the token limit (`stopReason: "length"`), the engine parses the cut JSON. The user sees "Agent output is not valid JSON". That message does not point to the real cause.

## What Changes

- New optional setting `--context-window` / `OPENAI_CONTEXT_WINDOW`. The default is `128000`, the current value.
- Before the first model call, the engine estimates the input size. When the input leaves less than 4096 tokens for the answer, the review fails with an error that gives the estimate and the window.
- `get_file_content` returns at most 100,000 characters for one call. A longer file is cut, and the result says so.
- `get_file_content` answers at most 30 calls in one review. After that, it returns an error that tells the agent to finish.
- A model stop at the token limit fails the review with an error that names `--max-tokens` and `--context-window`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Modified: "Provide a file-content tool to the agent" adds the size limit and the call limit.
  - Added: "Accept a configurable context window".
  - Added: "Fail before the model call when the input is too large".
  - Added: "Report a review cut at the token limit".

## Impact

- Affected code: `src/config.ts` (new setting), `src/cli/index.ts` (new flag, `buildModel`), `src/core/review/agent.ts` (size and call limits), `src/core/review/engine.ts` (input check and `length` check).
- Affected tests: `config.test.ts`, `src/cli/index.cli.test.ts`, `agent.test.ts`, `engine.test.ts`.
- Affected docs: the configuration table in `README.md`.
- No change for a user who does not set the new option, except for the two new limits and the clearer errors.
- `publish` is not affected.
