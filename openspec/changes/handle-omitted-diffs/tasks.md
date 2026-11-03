# Tasks

## 1. Mark omitted files

- [ ] 1.1 Add `omitted?: 'too_large' | 'generated'` to `ChangedFileDiff`, and `UnreviewedFile` (`path`, `reason`) with `ReviewResult.unreviewedFiles` in `src/core/types.ts` (Decisions 1 and 4).
- [ ] 1.2 In `client.ts`, read `too_large` and `generated_file` from `/diffs` into `GitLabChangedFile`. In `sourceProvider.ts`, map them to `omitted`, with `too_large` first.
- [ ] 1.3 Add tests in `client.test.ts` and `sourceProvider.test.ts` for: `too_large`, `generated_file`, both flags, and neither. Verify with `npm test`.

## 2. Review input and checks

- [ ] 2.1 In `prompt.ts`, show an omitted file as its heading and `(diff not shown: too large)` or `(diff not shown: generated file)` in a single run, and with that reason in place of the +/- counts in the batch file list (Decision 2).
- [ ] 2.2 In `engine.ts`, pass only files that are not omitted to `planBatches`.
- [ ] 2.3 In `engine.ts`, drop a finding on an omitted file before the diff line check, with the reason `diff_omitted` (Decision 3).
- [ ] 2.4 In `engine.ts`, return `unreviewedFiles` in path order, and write one `warn` line for each file that is too large (Decision 4).
- [ ] 2.5 Add tests in `prompt.test.ts` and `engine.test.ts` for: each reason in a single run, an omitted file in the batch file list and in no batch, a finding on a generated file, and `unreviewedFiles` with its `warn` lines. Verify with `npm test`.

## 3. Findings file

- [ ] 3.1 In `findingsFile.ts`, add `unreviewedFiles` to `FindingsFile`. Read a missing field as an empty list, and reject an entry without a string `path` or with an unknown `reason`, with its index and field.
- [ ] 3.2 In `src/cli/index.ts`, write the engine's `unreviewedFiles` to the findings file, and pass them to the sink.
- [ ] 3.3 Add tests in `findingsFile.test.ts` and the CLI tests for: a missing field, a valid entry, each invalid entry, and the field in a written file. Verify with `npm test`.

## 4. Comment on files too large

- [ ] 4.1 In `client.ts`, add the note `id` to `GitLabDiscussionNote`, and add `createNote` and `updateNote` to `GitLabClient` and `MergeRequestWriter` (Decision 5).
- [ ] 4.2 In `sinkProvider.ts`, find the last general comment from this tool with the `unreviewed` marker, and create, update, or leave it by the table in Decision 5. Log a failure at `warn` and continue.
- [ ] 4.3 Add tests in `client.test.ts` and `sinkProvider.test.ts` for each row of the table, for generated files only, for discussions that cannot be read, and for a failed request. Verify with `npm test`.

## 5. Docs

- [ ] 5.1 Update `README.md`: the "Output" section (omitted files, `unreviewedFiles`, and the comment), and a note in "Large merge requests" that generated files are not counted. Verify that both reasons are named.

## 6. Integration check

- [ ] 6.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 6.2 Run `openspec validate handle-omitted-diffs --strict`, and validate the main specs after a dry-run archive on a copy. Verify that both report no errors or warnings.
- [ ] 6.3 On a test merge request with a file over GitLab's diff limit: run `review` and `publish`, and verify that the file is in `unreviewedFiles` and in one general comment. Run both again, and verify that no second comment appears. Then remove the large file, run both again, and verify that the comment says that every file was reviewed.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
