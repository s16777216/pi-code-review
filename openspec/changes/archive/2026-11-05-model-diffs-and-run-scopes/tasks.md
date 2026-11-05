# Tasks

## 1. Pin today's behavior

- [x] 1.1 Add `src/core/review/characterization.test.ts` (Decision 5). It covers the exact single-run prompt and system prompt, and the prompt and system prompt of each batch for a change with a split file and an omitted file. It also covers the findings and warnings from `runChecks` for a fixed agent output with valid lines, a line outside its batch, an omitted file, an unknown `relatesTo`, and a fixed declaration. Store the expected strings in the test. Verify that it passes on the current code with `npm test`, and commit it on its own.

## 2. Value objects

- [x] 2.1 Add `src/core/review/changedFile.ts` with `ChangedFile` and `ChangeSet` (Decisions 1 and 2), built on today's parsing functions in `diff.ts`.
- [x] 2.2 Add `changedFile.test.ts`. Move the tests of `checkNewFileLine` and `getNewFileLineText` to it as tests of `lineCheck` and `lineText`, with the same cases. Add tests for `hasNewLine`, `numbered`, `counts`, `state`, `hunks`, `withHunks`, `isOmitted`, `isDeleted`, and `reviewable`. Verify with `npm test`.

## 3. Use the value objects

- [x] 3.1 Change `planBatches` and `BatchItem` to `ChangedFile` (Decision 4), and mark the batch's files by path in the prompt's file list.
- [x] 3.2 Change `prompt.ts` to use `numbered`, `counts`, and `state`, and remove its own `fileState`.
- [x] 3.3 Change `checks.ts` to take a `ChangeSet`: `lineCheck`, `lineText`, `isOmitted`, and `isDeleted` in place of the scans and the free functions. Remove `checkNewFileLine` and `getNewFileLineText` from `diff.ts`.
- [x] 3.4 Build the `ChangeSet` once in `AgentReviewEngine.review`, and pass it on. Verify that the characterization test passes unchanged, and verify with `npm test`.

## 4. Run scopes

- [x] 4.1 Add `src/core/review/scope.ts` with `RunScope`, `WholeChange`, and `Batch` (Decision 3). Move `keepOwnLines`, `batchField`, `batchFailure`, and the batch paragraph into them.
- [x] 4.2 Change `planRuns` to return `RunScope[]`, and every engine method that takes `batch` to take a `RunScope`. Change `buildSystemPrompt` to take a scope, with `WholeChange` when none is given. Verify that no `batch === undefined` or `batch !== undefined` check is left in `src/core/review/`.
- [x] 4.3 Add `scope.test.ts` for each method of both classes, and update the engine and prompt tests that called the old signatures. Verify that the characterization test passes unchanged, and verify with `npm test`.

## 5. Integration check

- [x] 5.1 Verify that `src/cli/`, `src/providers/`, `src/core/ports.ts`, and `src/core/types.ts` did not change, and that `src/cli/index.entrypoint.test.ts` passes unchanged.
- [x] 5.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that all exit with code 0.
- [x] 5.3 Run `openspec validate model-diffs-and-run-scopes --strict`. Verify that it reports no errors or warnings.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
