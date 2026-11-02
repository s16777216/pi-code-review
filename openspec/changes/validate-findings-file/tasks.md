# Tasks

## 1. Share the finding check

- [ ] 1.1 Export `validateFinding` from `src/core/review/findings.ts`. Do not change its behavior. Verify that the existing `findings.test.ts` tests still pass with `npm test`.

## 2. Validate the findings file

- [ ] 2.1 Add the structure check to `readFindingsFile` in `src/findingsFile.ts`. Check the top-level object, the `diffRefs` object and its three SHA strings, and the `findings` array. Call `validateFinding` for each element. Throw `FindingsFileError` with the file path and the first bad field.
- [ ] 2.2 Add tests in `src/findingsFile.test.ts` for: a missing `diffRefs`, an empty `headSha`, a top-level array, a missing `findings`, a bad severity at index 2, a non-integer line, and an extra unknown field. Verify with `npm test`.
- [ ] 2.3 Verify that the existing round-trip tests in `src/findingsFile.test.ts` still pass. They prove that every file `review` writes passes the check.

## 3. Read the file before the GitLab client

- [ ] 3.1 Change `runPublishCommand` in `src/cli/index.ts` to read the findings file before it calls `GitLabClient.create`. Verify with `npm test`.
- [ ] 3.2 Add a subprocess test in `src/cli/index.entrypoint.test.ts` or `src/cli/index.cli.test.ts`. Run `publish` with an invalid findings file and an unreachable GitLab URL. Verify a non-zero exit code and an error that names the file.

## 4. Integration check

- [ ] 4.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 4.2 Run `openspec validate validate-findings-file --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
