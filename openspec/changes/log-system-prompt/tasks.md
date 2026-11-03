# Tasks

## 1. Log the system prompt

- [x] 1.1 In `engine.ts`, add `systemPrompt` to the `review prompt` debug line in `runOnce`, with the same text that the run's agent gets (Decision 1).
- [x] 1.2 Add tests in `engine.test.ts` for: the field equals `buildSystemPrompt()` for a single run, it has the language sentence with a language, and it has the batch paragraph in batch mode. Verify that the single-run debug line count is unchanged. Verify with `npm test`.

## 2. Docs

- [x] 2.1 Update `README.md`: name the system prompt in "Debug logging", and add the answer room and the lower bound for `--context-window` to "Large merge requests" and the `OPENAI_CONTEXT_WINDOW` row (Decision 2). Verify that the bound and the 4,096-token margin are both named.

## 3. Integration check

- [x] 3.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 3.2 Run `openspec validate log-system-prompt --strict`, and validate the main specs after a dry-run archive of the stack on a copy. Verify that both report no errors or warnings.
- [x] 3.3 Run `review --debug --language "繁體中文"` on a test merge request. Verify that the `review prompt` line has a `systemPrompt` field that ends with the language sentence.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
