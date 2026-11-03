# Tasks

## 1. Anchor match on resolved discussions

- [x] 1.1 In `sinkProvider.ts`, build two indexes from the discussions that this tool started: open ones by anchor, and resolved ones by anchor. For a resolved anchor, keep the last discussion in list order (Decision 1).
- [x] 1.2 For a finding with no `relatesTo`: skip it when the open index has its anchor, reply and reopen when only the resolved index has it, and create a new discussion otherwise.
- [x] 1.3 Add tests in `sinkProvider.test.ts` for: an anchor match on a resolved discussion (reply, then reopen), an anchor match on both an open and a resolved discussion (skip), two resolved discussions with the anchor (the last one gets the reply), and a person's resolved discussion on the same line (new discussion). Update the existing test that expects a new discussion for a resolved anchor match. Verify with `npm test`.

## 2. Merge findings on the same target

- [x] 2.1 Split `publishFinding` into a step that decides each finding's target (skip, reply to a discussion ID, or new discussion) and a step that posts (Decision 2).
- [x] 2.2 Group new-discussion targets by file and line, and reply targets by discussion ID, in findings file order. Post one discussion or one reply for each group, and reopen each replied discussion once.
- [x] 2.3 Build the comment body from a group: one marker line with the first finding's anchor, then one `**[severity]** summary` paragraph for each finding, separated by a blank line (Decision 3). A group of one keeps today's body.
- [x] 2.4 Log the number of merged findings at `info` when it is not zero. Log a failed post once for each finding in the group (Decision 4).
- [x] 2.5 Add tests in `sinkProvider.test.ts` for: two findings on the same line (one discussion, both paragraphs), two findings on different lines with the same text (two discussions), two findings that reply to the same discussion (one reply, one reopen), a group of one (today's body), and a failed merged post (one log per finding). Verify with `npm test`.

## 3. Docs

- [x] 3.1 Update the "Output" section of `README.md`: the anchor match on a resolved discussion, and the merge of findings on the same line. Verify that it no longer says that only an open discussion matches by anchor.

## 4. Integration check

- [x] 4.1 Run `npm run build` and `npm test`. Verify that both commands exit with code 0.
- [x] 4.2 Run `openspec validate merge-findings-on-publish --strict`. Verify that it reports no errors or warnings.
- [x] 4.3 On a test merge request: resolve a comment from this tool without changing the code, remove `relatesTo` from the next findings file, and run `publish`. Verify that the comment gets a reply and is reopened, and that no new thread appears. Then publish a findings file with two findings on one new line, and verify that one discussion with both findings appears.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
