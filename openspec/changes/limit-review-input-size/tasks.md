# Tasks

## 1. Configurable context window

- [x] 1.1 Add `contextWindow` to `ReviewConfig.openai` and `contextWindow` to `ReviewConfigOverrides` in `config.ts`. Resolve it from the flag, then `OPENAI_CONTEXT_WINDOW`, then `128000`. Throw `ConfigError` for a non-positive or non-integer value, or a value not larger than `maxTokens`.
- [x] 1.2 Add tests in `config.test.ts` for: the default, the environment variable, the flag winning, a non-integer value, and a value not larger than `maxTokens`. Verify with `npm test`.
- [x] 1.3 Add `--context-window` to `parseReviewCliOptions` and use the config value in `buildModel` in `src/cli/index.ts`. Update `index.cli.test.ts`. Verify with `npm test`.
- [x] 1.4 Add `OPENAI_CONTEXT_WINDOW` / `--context-window` to the configuration table in `README.md`. Verify that the row gives the default and the purpose.

## 2. Limit the file-content tool

- [x] 2.1 Cut each `get_file_content` result at 100,000 characters in `agent.ts`, and append the cut marker with the full length.
- [x] 2.2 Count calls in `createGetFileContentTool`. From the 31st call, return an error result and do not call `getFileContent`.
- [x] 2.3 Add tests in `agent.test.ts` for: a file under the limit, a file over the limit, the 30th call, and the 31st call. Verify with `npm test`.

## 3. Guard the model call

- [x] 3.1 In `engine.ts`, estimate the first request with `estimateContextTokens` before `agent.prompt`. Throw `ReviewFailureError` with the estimate and the window when less than 4,096 answer tokens remain.
- [x] 3.2 In `engine.ts`, throw `ReviewFailureError` naming `--max-tokens` and `--context-window` when the final message has `stopReason: "length"`.
- [x] 3.3 Add tests in `engine.test.ts` for: an input that fits, an input that is too large (verify that the faux provider gets 0 calls), and a final message with `stopReason: "length"`. Verify with `npm test`.

## 4. Integration check

- [x] 4.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 4.2 Run `openspec validate limit-review-input-size --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
