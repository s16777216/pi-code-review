# Proposal

## Why

The `review-with-existing-discussions` change lets the agent link a finding to an existing discussion with `relatesTo`. `publish` still ignores that field. It posts a new discussion for every finding, so a linked finding still appears two times.

The agent can also skip the discussion tool. Then no finding has `relatesTo`, and a repeat is still possible. `publish` needs a fixed check that does not depend on the model's wording or on the line number.

## What Changes

- A finding with `relatesTo` that points to an open discussion: `publish` posts nothing for it.
- A finding with `relatesTo` that points to a resolved discussion: the agent read the discussion and still reports the problem. `publish` adds a reply to that discussion and reopens it.
- A finding with `relatesTo` that points to a discussion that no longer exists: `publish` creates a new discussion.
- The review engine adds an `anchor` to each finding. The anchor is a hash of the file path and the text of the finding's line. It does not change when the line number changes or when the model changes its wording.
- `publish` writes the anchor into the hidden marker of each comment. A finding with no `relatesTo` is skipped when an open discussion from this tool has the same anchor.
- When `publish` cannot read the discussions, it logs a `warn` line and creates a new discussion for every finding.
- Pass or fail still uses every finding in the findings file, including the skipped findings.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-output`:
  - Modified: "Publish findings as inline merge request comments" adds the rules for `relatesTo` and the anchor.
  - Added: "Record the anchor in each posted comment".
  - Added: "Count skipped findings toward pass or fail".
- `ai-diff-review`:
  - Added: "Compute an anchor for each finding".

## Impact

- Depends on `review-with-existing-discussions`: `relatesTo`, the marker, and `GitLabClient.listDiscussions`. Implement that change first.
- Affected code: `src/core/types.ts` (`Finding.anchor`), `src/core/review/engine.ts` (compute the anchor), `src/providers/gitlab/client.ts` (reply to a discussion, reopen a discussion), `src/providers/gitlab/sinkProvider.ts` (the publish rules).
- `publish` makes one or more extra GET requests, and one PUT and one POST for each reopened discussion.
- The token must be allowed to resolve discussions. A Developer role or higher is enough on GitLab. When the reopen fails, the reply stays and `publish` logs a `warn` line.
- Replaces the `skip-duplicate-review-comments` proposal.
