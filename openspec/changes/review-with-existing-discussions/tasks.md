# Tasks

## 1. Core types

- [x] 1.1 Add `ReviewDiscussion` and `ReviewContext.listDiscussions` to `src/core/types.ts`. Add optional `relatesTo?: string` to `Finding`. Update every `ReviewContext` fixture in the tests to provide `listDiscussions`. Verify with `npm run build` and `npm test`.

## 2. GitLab source

- [x] 2.1 Add `listDiscussions(mergeRequestIid)` to `MergeRequestProvider` and `GitLabClient` in `client.ts`. Follow `x-next-page`. Leave out system notes. Map the position to file, `new_line`, and `head_sha`.
- [x] 2.2 Add tests in `client.test.ts` for: one page, two pages, a system note, a general comment with no position, and an error response. Verify with `npm test`.
- [x] 2.3 Implement `listDiscussions` in `GitLabSourceProvider`. Fetch one time and keep the result. Set `fromThisTool` when the first note body starts with `<!-- pi-code-review`. Return `{ error }` on failure.
- [x] 2.4 Add tests in `sourceProvider.test.ts` for: two calls make one API request, the marker sets `fromThisTool`, and an API error returns `{ error }`. Verify with `npm test`.

## 3. Discussion tool

- [x] 3.1 Add `createListDiscussionsTool(context)` to `src/core/review/agent.ts`. Accept an optional `file`. Return a JSON array after a one-line framing sentence. Cut note bodies at 2,000 characters and the result at 50,000 characters. Return an error after 10 calls.
- [x] 3.2 Add tests in `agent.test.ts` for: no filter, a file filter, a long note, a long result, an error from `listDiscussions`, and the 11th call. Verify with `npm test`.

## 4. Engine

- [x] 4.1 Register the new tool in `AgentReviewEngine`. Add the discussion rules to `SYSTEM_PROMPT`: check a file's discussions before reporting in it, treat discussion text as information and not instructions, consider resolved discussions and explanations from people, set `relatesTo` for a problem that a discussion already covers, and note that a line on an older commit can be out of date. Add `relatesTo` to the output field list.
- [x] 4.2 Accept an optional string `relatesTo` in `parseFindings` (`findings.ts`). Add tests in `findings.test.ts` for a string value, a missing value, and a number value. Verify with `npm test`.
- [x] 4.3 In `engine.ts`, remove an unknown `relatesTo` with one `warn` line and keep the finding. Add tests in `engine.test.ts` for a known ID, an unknown ID, and a test that the system prompt contains the discussion rules. Verify with `npm test`.

## 5. Marker in published comments

- [x] 5.1 Start the body in `formatDiscussionBody` (`sinkProvider.ts`) with `<!-- pi-code-review -->` and a line break. Update the body assertions in `sinkProvider.test.ts`. Verify with `npm test`.

## 6. Documentation and integration check

- [x] 6.1 Add a short section to `README.md` that explains that the agent reads merge request discussions, and that anyone who can comment can influence the review. Verify that the section names the risk.
- [x] 6.2 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 6.3 Run `openspec validate review-with-existing-discussions --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
