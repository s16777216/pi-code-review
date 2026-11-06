## 1. Findings file

- [ ] 1.1 Add the `source` field to `FindingsFile` as a second type parameter in `src/findingsFile.ts`, and make `readFindingsFile` take a `parseSource` function. Verify with tests in `src/findingsFile.test.ts` for a valid source, a missing source, and extra fields.
- [ ] 1.2 Make a missing or invalid `source` throw `FindingsFileError` that names the file and the field. Verify with a test for each case.

## 2. Host port

- [ ] 2.1 In `src/core/ports.ts`, add `Source` to `CodeHost` and add `parseSource`. Give the port separate flag lists and separate setting readers for `review` and `publish`. Verify with `npm run build`.
- [ ] 2.2 Change `restore` to `restore(source, snapshot): Promise<DiscussionGateway>`, and let `ChangeRequest.load()` return the source with the snapshot. Verify with `npm run build`.

## 3. GitLab host

- [ ] 3.1 In `src/providers/gitlab/config.ts`, split the settings into the connection (API URL, token) and the target (project ID, merge request IID). Verify with tests in `src/providers/gitlab/config.test.ts`.
- [ ] 3.2 In `src/providers/gitlab/host.ts`, declare `--gitlab-url` and `--token` for `publish`, and all four flags for `review`. Create the `GitLabClient` for the source project inside `restore`. Add `parseSource` for `{ projectId, mergeRequestIid }`. Verify with tests in `src/providers/gitlab/host.test.ts`, including a test that `publish` ignores `CI_PROJECT_ID` and `CI_MERGE_REQUEST_IID`.

## 4. CLI

- [ ] 4.1 In `src/cli/index.ts`, write the source in `runReview` and pass it to `restore` in `runPublishCommand`. Verify with tests in `src/cli/index.test.ts`.
- [ ] 4.2 Make `parsePublishCliOptions` reject `--mr` and `--project-id`. Verify with tests in `src/cli/index.cli.test.ts`.

## 5. Docs and checks

- [ ] 5.1 Refresh `src/cli/SPEC.md` and `src/providers/gitlab/SPEC.md` with `openspec-sync-specs`. Verify that both files describe the source and the new publish flags.
- [ ] 5.2 Run `npm run build`, `npm test`, `npm run lint`, and `openspec validate --specs --strict`. Verify that all pass.
