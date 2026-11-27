## Context

See `proposal.md` (Why). Today:

- `Finding` has one `line`. `ChangeSet.lineCheck(file, line)` accepts an added or a context line (`src/core/review/changedFile.ts`). `runChecks` (`checks.ts`) drops any other finding, and `batch.ts` drops a finding outside its batch with `outside_batch`.
- `computeAnchor` hashes the text of `line`, which comes from the diff.
- `get_file_content` (`agent.ts`) returns the raw text of the file, with no line numbers. The review agent can see line numbers only in the diff.
- `publish` groups findings by `file` and `line` (`publisher.ts`). `GitLabMergeRequest.createDiscussion` (`providers/gitlab/mergeRequest.ts`) sends `new_line`, and `old_line` for a context line, from `ChangeSet.oldLineFor`. That method returns `null` for a line outside the hunks.
- A test on GitLab 19.2.7 (MR 63 of project 10) showed these facts. GitLab accepts `position[line_range]` inside one hunk, across two hunks, and fully outside the hunks. It accepts the position on a line outside the hunks. The comment shows the code above the position line, so a position on the end line shows the most code of the range. For unchanged lines, the label of the range uses the old-file line numbers.

## Goals / Non-Goals

**Goals:**

- Let a finding cover one continuous range, `line` to `endLine`.
- Keep every finding without `endLine`, and every older findings file, working as before.
- Give the review agent the line numbers of the lines outside the hunks.

**Non-Goals:**

- No range that is not continuous. GitLab has one `line_range` for each discussion.
- No limit on the length of a range (decision of the user).
- No change to severity rules. A pre-existing problem stays `pre_existing`.
- No new template placeholder for `endLine`. `${line}` stays the first line.
- The judge keeps the single line of the discussion position. It does not read `line_range`.

## Decisions

### Decision 1: `endLine` is optional, and `line` stays the first line

`Finding` gets `endLine?: number`, with `endLine >= line`. A finding without `endLine` has the old meaning.

- Alternative: replace `line` with `{ start, end }`. This changes every consumer and every findings file. It gives no new behavior.

### Decision 2: The diff check needs one visible line in the range, and context lines count

Add `ChangeSet.rangeCheck(file, line, endLine)`. It returns `ok` when at least one line from `line` to `endLine` is an added or context line. It returns the same reasons as `lineCheck` otherwise. The batch filter uses the same test on the batch's own diff items.

- Alternative: count only added lines. The user chose to keep context lines, so a pre-existing problem on a visible context line stays reportable.
- Consequence: an agent can still put a problem on a context line only. The prompt (Decision 5) is the only control. The rerun of MR 64 in the tasks measures it.

### Decision 3: The anchor uses the first visible line of the range

`anchorLine` is the first line from `line` to `endLine` that is an added or context line. The anchor hashes its text, as today. For a finding without `endLine`, the anchor line is `line`, so every old anchor stays the same.

- Alternative: hash `line` always. When `line` is outside the diff, the text must come from the file, and the spec says the text comes from the diff.
- Alternative: hash `endLine`. The end of a range changes more between runs than its first visible line.

### Decision 4: `get_file_content` puts the line number in front of each line

The tool returns `<number> | <text>` for each line, in the same form as the numbered diff. The 100,000-character limit applies to the numbered text. The verifier, the judge, and the verify agent use the same tool, so they also get the numbers.

- Alternative: keep the raw text, and let the agent count lines. In MR 64, the problem continues past the hunk, and the agent cannot see those numbers.
- Cost: the numbers make the text longer. A file near the limit is cut earlier.

### Decision 5: The review prompt asks for a range

`src/template/system/REVIEW.md` tells the agent to report `line` and `endLine`, to leave out `endLine` for one line, to touch at least one numbered diff line, and that the range can continue outside the diff. The rules for changed lines and for the line that opens a block stay. `submit_review` gets an optional integer `endLine`. `validateFinding` rejects an `endLine` that is not an integer or is less than `line`.

### Decision 6: Later steps see `endLine` and cannot change it

The deduplication input, the verifier input, and the first list of the verify agent show `endLine` when a finding has one. `applyVerdicts` and the decisions of the verify agent change only severity and the kept set. They copy the finding, so `endLine` stays.

### Decision 7: `publish` sends a `line_range` with the position on `endLine`

For a finding with `endLine`, `createDiscussion` gets `{ file, line, endLine }`. The GitLab client sends `position.new_line = endLine`, plus `old_line` when the end line is not an added line. It also sends `position.line_range.start` and `.end`. Each end has `line_code`, `type`, `old_line`, and `new_line`.

- `line_code` is `<sha1 of the path>_<old line>_<new line>`.
- `ChangeSet` gets a method for the old-file line of any new-file line. Inside a hunk, it uses the diff. Outside the hunks, it adds the line offset of the hunks before the line.
- `type` is `new` for an added line, and absent for an unchanged line.

The publisher groups findings by `file`, `line`, and `endLine`.

- Alternative: the position on `line`. The test showed that GitLab then shows only the first lines of the range.

### Local `SPEC.md` files to refresh at sync

- `src/core/review/SPEC.md`: `changedFile.ts` range check and old-line method, `agent.ts` numbered file content, anchor line.
- `src/core/publish/SPEC.md`: grouping by range.
- `src/providers/gitlab/SPEC.md`: multi-line position with `line_range`.
- `src/template/SPEC.md`: only if the description of `system/` changes.

## Risks / Trade-offs

- [The agent still borrows a context line for a problem outside the diff] → The prompt asks for the range of the problem. Task 5.2 reruns MR 64 and records the line and the end line of the race finding. A test of one more prompt rule (the smallest range) gave no findings and was removed (see the notes in `tasks.md`).
- [A long range makes the comment show only its last lines] → The position on `endLine` shows the most code. No limit, by decision of the user.
- [GitLab shows the old-file numbers in the label of a range on unchanged lines] → Record it in `docs/` as a known limit.
- [A wrong `line_code` for a line outside the hunks] → GitLab accepted approximate codes in the test. Unit tests cover the offset after one and two hunks.
- [Numbered file content uses more tokens] → The limit stays 100,000 characters; the tool cuts as before.

## Migration Plan

`endLine` is optional in the findings file and in `submit_review`. An older findings file is valid and gives single-line discussions. Anchors of single-line findings do not change, so existing discussions still match. Rollback is a revert of the change.
