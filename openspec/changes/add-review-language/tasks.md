# Tasks

## 1. Configuration

- [ ] 1.1 Add `language?: string` to `ReviewConfig` and `ReviewConfigOverrides` in `config.ts`. Resolve it from the flag, then `REVIEW_LANGUAGE`. Trim it. Throw `ConfigError` for an empty value, a value longer than 64 characters, or a line break.
- [ ] 1.2 Add tests in `config.test.ts` for: not set, set by the environment variable, the flag winning, an empty value, a 65-character value, and a line break. Verify with `npm test`.
- [ ] 1.3 Add `--language` to `parseReviewCliOptions` in `src/cli/index.ts`. Add tests in `index.cli.test.ts` that `review` accepts it and that `publish` rejects it. Verify with `npm test`.

## 2. System prompt

- [ ] 2.1 Add `language?: string` to `AgentReviewEngineOptions` in `engine.ts`. Build the system prompt from the existing text, and add the language sentence only when `language` is set.
- [ ] 2.2 Pass `config.language` from `runReview` to `AgentReviewEngine`.
- [ ] 2.3 Add tests in `engine.test.ts`: without `language`, the system prompt equals the current text exactly; with `language`, it ends with the language sentence. Verify with `npm test`.

## 3. Documentation and integration check

- [ ] 3.1 Add `REVIEW_LANGUAGE` / `--language` to the configuration table in `README.md`. Mark the item in `TODO.md` as done. Verify that the README row gives an example value.
- [ ] 3.2 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 3.3 Run `openspec validate add-review-language --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
