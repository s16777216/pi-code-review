# Tasks

## 1. Host-neutral discussions and the marker

- [x] 1.1 Add `core/publish/discussion.ts` with `HostDiscussion`, and move `marker.ts` and the marker rules (`hasMarker`, `stripMarker`, `isFromThisTool`, `discussionAnchor`, and the unreviewed marker) to `core/publish/`, written against `HostDiscussion` (Decision 4).
- [x] 1.2 Add the mapping from `GitLabDiscussion` to `HostDiscussion` in `providers/gitlab/`. It drops system notes and computes `resolved` with today's rule. Use it in the source and sink providers, so they work on `HostDiscussion`.
- [x] 1.3 Move the marker and discussion-rule tests to `core/publish/`, and add tests for the GitLab mapping: system notes, `resolved`, and a general comment. Verify with `npm test`.

## 2. The gateway and the Publisher

- [ ] 2.1 Add `DiscussionGateway` to `core/ports.ts` (Decision 1).
- [ ] 2.2 Add `core/publish/publisher.ts` with `class Publisher`. Move the rules from `GitLabSinkProvider` and `unreviewedNote.ts`, with no change to any rule, log line, or comment body. Move `onDiscussionError` to a `Publisher` option (Decision 3).
- [ ] 2.3 Move the rule tests from `sinkProvider.test.ts` to `publisher.test.ts`, with a fake gateway and unchanged assertions. Verify that the test count is the same as before the move, and verify with `npm test`.

## 3. The GitLab merge request and the host

- [ ] 3.1 Add `ChangeRequest`, `CodeHost`, and `HostFlags` to `core/ports.ts`, and remove `SourceProvider` and `SinkProvider` (Decision 1).
- [ ] 3.2 Add `providers/gitlab/mergeRequest.ts` with `GitLabMergeRequest implements ChangeRequest<GitLabDiffRefs>, DiscussionGateway`. `load()` replaces `GitLabSourceProvider`, and the gateway methods replace the client calls of the sink (Decision 2).
- [ ] 3.3 Add `providers/gitlab/host.ts` with `gitlabHost`: its `flags`, `isChangeRequest`, `open`, `parseSnapshot`, and `restore`. Export only `gitlabHost` from `providers/index.ts`.
- [ ] 3.4 Remove `sourceProvider.ts`, `sinkProvider.ts`, `discussions.ts`, `marker.ts`, and `unreviewedNote.ts` from `providers/gitlab/`, and move their remaining tests to `mergeRequest.test.ts` and `host.test.ts` (Decision 6). Verify with `npm test`.

## 4. The CLI and the configuration

- [ ] 4.1 Remove the `gitlab` field from `ReviewConfig` and `PublishConfig`, and the GitLab overrides from `config.ts`.
- [ ] 4.2 Change `runReview` to take a `ChangeRequest`, and `runPublish` to take a `DiscussionGateway`. Change `runReviewCommand` and `runPublishCommand` to take a `CodeHost`, to parse `host.flags` with each command's own flags, and to call `open` or `restore` before the other settings. Pass `gitlabHost` in `main` (Decision 5).
- [ ] 4.3 Change the CLI tests to fake `ChangeRequest`, `DiscussionGateway`, and `CodeHost`. Verify that the existing entrypoint tests still pass unchanged: the error order, the exit codes, and the bad findings file. Verify with `npm test`.

## 5. Docs

- [ ] 5.1 Update the architecture lines at the top of `README.md`: the ports, `Publisher`, and the GitLab provider. Verify that no command, flag, or setting in the README changed.

## 6. Integration check

- [ ] 6.1 Verify that `providers/index.ts` exports only `gitlabHost`. Verify that `cli/index.ts`, `config.ts`, and `findingsFile.ts` reference no name that starts with `GitLab` or `Gitlab`, and that the only import from `providers/` outside it is `gitlabHost` in `cli/index.ts`.
- [ ] 6.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`. Verify that all exit with code 0.
- [ ] 6.3 Run `openspec validate introduce-code-host --strict`. Verify that it reports no errors.
- [ ] 6.4 Run `review` and `publish` from `dist/` against a test merge request, with a valid GitLab token. Verify these against a run of the code before this change:
  - The findings file has the same fields.
  - A second run skips the existing comments.
  - The exit codes are the same.
  - An invalid findings file and a missing setting give the same error messages.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
