# Tasks

Implement `review-with-existing-discussions` and `publish-into-existing-discussions` before this change.

## 1. Types and anchor source

- [x] 1.1 Add `ResolvedDiscussion`, `ReviewResult`, and `ReviewDiscussion.anchor` to `src/core/types.ts`. Change `ReviewEngine.review` to return `ReviewResult`. Update `runReview` in `src/cli/index.ts`. Verify with `npm run build`.
- [x] 1.2 Parse the anchor from the first note's marker in `GitLabSourceProvider`. Add tests in `sourceProvider.test.ts` for a marker with an anchor and a marker without one. Verify with `npm test`.

## 2. Output format

- [x] 2.1 Replace `parseFindings` with `parseReviewOutput` in `findings.ts`. Accept an object with `findings` and `resolved`, and a bare array. Drop an invalid declaration with one `warn` line.
- [x] 2.2 Update `findings.test.ts` for: an object, a bare array, an object without `findings`, a declaration without a reason, and a declaration with a non-string ID. Verify with `npm test`.
- [x] 2.3 Add the `resolved` output and its rules to `SYSTEM_PROMPT` in `engine.ts`: only discussions from this tool, only with a reason, only after reading the current code. Add a test that the system prompt contains the rules. Verify with `npm test`.

## 3. Engine checks

- [x] 3.1 Add a function that computes the anchor of a line from a file path and line text. Reuse it for findings, so both use one formula. Verify that the existing anchor tests still pass.
- [x] 3.2 Implement the seven checks from `design.md` Decision 2 in `engine.ts`, in order. Read each file at most once. Log one `warn` line with the check name for each dropped declaration.
- [x] 3.3 Add tests in `engine.test.ts` for each check, for a deleted file, and for a declaration that passes. Verify with `npm test`.

## 4. Findings file

- [x] 4.1 Add `resolved` to `FindingsFile` in `src/findingsFile.ts`. Write it in `runReview`. Read a missing `resolved` as an empty list.
- [x] 4.2 Add tests in `findingsFile.test.ts` for a round trip with declarations and for a file without `resolved`. Verify with `npm test`.

## 5. Publish

- [x] 5.1 In `GitLabSinkProvider`, for each declaration: check that the discussion exists, has the marker, and is open; add the reply; then resolve. Log one `warn` line for each skipped or failed declaration.
- [x] 5.2 Add tests in `sinkProvider.test.ts` for every scenario in the `review-output` delta spec. Verify with `npm test`.
- [x] 5.3 Add a test in `src/cli/index.test.ts` that declarations do not change the result of `runPublish`. Verify with `npm test`.

## 6. Documentation and integration check

- [x] 6.1 Update `README.md` to explain when the tool resolves a comment, and that it never resolves a comment from a person. Verify that the text matches `design.md` Decision 3.
- [x] 6.2 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 6.3 Run `openspec validate resolve-fixed-discussions --strict`. Verify that it reports no errors.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
