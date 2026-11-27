## Why

A finding has one line, and the system keeps it only when that line is visible in the diff. A problem that spans code outside the hunks has no valid line. In a real review of MR 64 (project 10), two runs put a race condition on line 553, a context line with only `}`. The problem itself starts at line 562 and continues outside the hunk. The reviewer cannot see the code of the problem in the comment.

## What Changes

- A finding can have an optional `endLine`. The finding then covers the continuous range from `line` to `endLine`. A finding without `endLine` covers one line, as before.
- The review agent prompt tells the agent to report the range that holds the problem. The range must touch at least one visible diff line. The range can continue outside the hunk.
- The diff check keeps a finding when its range has at least one added or context line of the diff. The check for each batch uses the same rule on the batch's own diff lines.
- The system has no limit on the length of a range.
- The anchor uses the text of the first line in the range that is visible in the diff.
- `publish` creates a multi-line GitLab discussion for a finding with `endLine`. The discussion position is on `endLine`. A finding without `endLine` gives a single-line discussion, as before.
- The findings file can contain `endLine`. `publish` rejects an `endLine` that is not an integer, or that is less than `line`.
- The deduplication step, the verifier, and the verify agent see the range of each finding.
- Findings merge into one comment only when they have the same file, `line`, and `endLine`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`: findings can have a line range; the diff check, the batch check, the anchor, and the prompt to the review agent change for ranges.
- `review-output`: a finding with a range gives a multi-line discussion; the merge of findings into one comment uses the range.
- `review-cli`: the findings file can contain `endLine`, and `publish` checks it.

## Impact

- Code: `src/core/types.ts`, `src/core/review/` (findings, changedFile, checks, batch, anchor, agent, verify, dedup, verifyAgent), `src/template/system/` (review, dedup, verify, and verify agent prompts), `src/core/publish/`, `src/providers/gitlab/` (multi-line position with `line_range` and line codes), `src/findingsFile.ts`.
- Host API: GitLab `position[line_range]`. A test on GitLab 19.2.7 accepted ranges inside one hunk, across two hunks, and outside the hunks.
- A known limit: on unchanged lines, GitLab shows the range label with old-file line numbers. The label can differ from `line` and `endLine`.
- Existing findings files stay valid, because `endLine` is optional.
