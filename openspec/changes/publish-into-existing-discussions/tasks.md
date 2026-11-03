# Tasks

Implement `review-with-existing-discussions` before this change.

## 1. Anchor in the engine

- [x] 1.1 Add `anchor?: string` to `Finding` in `src/core/types.ts`.
- [x] 1.2 Add a function in `src/core/review/diff.ts` that returns the new-file text of a line from the hunks. Add tests in `diff.test.ts` for an added line, a context line, and a missing line. Verify with `npm test`.
- [x] 1.3 Compute the anchor in `engine.ts` for each finding that passes the diff check. Use `node:crypto` SHA-256. Add tests in `engine.test.ts` for: the same text at two lines, different text at one line, and different indentation. Verify with `npm test`.

## 2. GitLab client

- [x] 2.1 Add `addDiscussionNote` and `setDiscussionResolved` to `MergeRequestWriter` and `GitLabClient` in `client.ts`. Give the sink read access to `listDiscussions`.
- [x] 2.2 Add tests in `client.test.ts` for the request method, path, and body of both new methods, and for an error response. Verify with `npm test`.

## 3. Publish rules

- [x] 3.1 Write the anchor into the marker in `formatDiscussionBody` (`sinkProvider.ts`). Parse the anchor from existing marked notes.
- [x] 3.2 Implement the check order from `design.md` Decision 1 in `GitLabSinkProvider.publish`. Call `listDiscussions` once. Fall back to a new discussion for every finding, with one `warn` line, when the call fails.
- [x] 3.3 Log one `warn` line and keep the reply when `setDiscussionResolved` fails.
- [x] 3.4 Add tests in `sinkProvider.test.ts` for every scenario in the `review-output` delta spec. Verify with `npm test`.

## 4. Pass or fail

- [x] 4.1 Add a test in `src/cli/index.test.ts` where every finding relates to an open discussion and one is `important`. Verify that `runPublish` creates nothing and returns `false`.

## 5. Documentation and integration check

- [x] 5.1 Update the "Output" section of `README.md` to describe the publish rules and the role that the token needs to reopen discussions. Verify that the section matches `design.md` Decision 1.
- [x] 5.2 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 5.3 Run `openspec validate publish-into-existing-discussions --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
