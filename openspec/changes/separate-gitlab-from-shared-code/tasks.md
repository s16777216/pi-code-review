# Tasks

## 1. Ports

- [ ] 1.1 Move `src/core/review/providers.ts` to `src/core/ports.ts`, and update its imports (Decision 1). Verify with `npm run build` and `npm test`.

## 2. Settings

- [ ] 2.1 Add `src/settings.ts` with `ConfigError` and `requireSetting`, moved from `config.ts`. Update the imports in `config.ts`, `client.ts`, `cli/index.ts`, and the tests (Decision 2).
- [ ] 2.2 Add `src/providers/gitlab/config.ts` with the GitLab connection types, `loadGitlabConnectionConfig`, and `isMergeRequestPipeline`, moved from `config.ts`. Export them from `providers/index.ts`, and use them in `config.ts` and `cli/index.ts` (Decisions 3 and 5).
- [ ] 2.3 Move the tests of `isMergeRequestPipeline` and of the GitLab settings to `src/providers/gitlab/config.test.ts`, without changing their assertions. Verify with `npm test`.

## 3. Diff refs

- [ ] 3.1 Add `src/providers/gitlab/diffRefs.ts` with `parseGitLabDiffRefs`, with today's checks and error texts. Export it from `providers/index.ts` (Decisions 4 and 5).
- [ ] 3.2 In `findingsFile.ts`, give `FindingsFile` a type parameter for the diff refs, take the parser in `readFindingsFile`, and remove the import from `providers/`. Pass `parseGitLabDiffRefs` in `cli/index.ts`.
- [ ] 3.3 Update `findingsFile.test.ts` to pass the parser, and add tests in `diffRefs.test.ts` for a valid value and for each missing field. Verify that the error texts of a bad file have not changed, and verify with `npm test`.

## 4. Integration check

- [ ] 4.1 Verify that no file in `src/core/`, nor `src/config.ts`, `src/settings.ts`, or `src/findingsFile.ts`, imports from `src/providers/`, and that no file in `src/providers/` imports `src/config.ts`.
- [ ] 4.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that all exit with code 0.
- [ ] 4.3 Run `openspec validate separate-gitlab-from-shared-code --strict`. Verify that it reports no errors.
- [ ] 4.4 Run `review` and `publish` from `dist/` against a test merge request. Verify that they behave as before: the findings file has the same fields, and `publish` posts or skips as before.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
