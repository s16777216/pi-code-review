# Tasks

## 1. List existing discussions

- [ ] 1.1 Add `listDiscussions(mergeRequestIid)` to `MergeRequestWriter` and `GitLabClient` in `client.ts`. Return the body, `newPath`, and `newLine` of each note. Follow `x-next-page`. Throw `GitLabApiError` on a non-OK response.
- [ ] 1.2 Add tests in `client.test.ts` for one page, two pages, a note with no position, and an error response. Verify with `npm test`.

## 2. Skip duplicates in the sink

- [ ] 2.1 Add the marker `<!-- pi-code-review -->` as the first line of `formatDiscussionBody` in `sinkProvider.ts`. Update the body assertions in `sinkProvider.test.ts`. Verify with `npm test`.
- [ ] 2.2 Make `GitLabSinkProvider.publish` call `listDiscussions` once, build a set of marked `(file, line, body)` keys, and skip each finding whose key is in the set. Log one `info` line with the number of skipped findings.
- [ ] 2.3 Make `publish` log one `warn` line and post every finding when `listDiscussions` throws.
- [ ] 2.4 Add tests in `sinkProvider.test.ts` for: an own duplicate, a person's comment with the same text, the same finding on a different line, a changed summary, and a failed list request. Verify with `npm test`.

## 3. Keep the pass or fail decision

- [ ] 3.1 Add the `listDiscussions` method to the fake clients in `src/cli/index.test.ts`.
- [ ] 3.2 Add a test in `src/cli/index.test.ts` where every finding is a duplicate and one is `important`. Verify that `runPublish` posts nothing and returns `false`.

## 4. Documentation and integration check

- [ ] 4.1 Update the "Output" section of `README.md` to say that `publish` skips comments it already posted. Verify that the section matches the behavior.
- [ ] 4.2 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [ ] 4.3 Run `openspec validate skip-duplicate-review-comments --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
