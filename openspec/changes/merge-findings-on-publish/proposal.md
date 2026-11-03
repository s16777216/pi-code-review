# Proposal

## Why

The end-to-end run on gitlab.com found two ways in which `publish` posts the same problem more than once.

- **A resolved discussion gets a second thread.** A finding with no `relatesTo` is matched by anchor only against open discussions from this tool. When the matching discussion from this tool is resolved, `publish` creates a new discussion on the same code. In the run, a person resolved a comment and did not change the code. The agent reported the same problem on the same line, but it did not set `relatesTo`, and a second thread appeared next to the resolved one. `publish-into-existing-discussions` Decision 4 chose this on purpose, so that the agent alone decides on resolved discussions. In practice, a missing `relatesTo` means that the agent did not make the link. It does not mean that the agent wants a new thread.
- **One run can post two threads on one line.** `publish` handles each finding on its own. Two findings on the same file and line, for example a missing null check and an off-by-one error on the same line, become two discussions at the same position. Two findings that link to the same resolved discussion become two replies, and the discussion is reopened twice.

## What Changes

- A finding with no `relatesTo` whose anchor matches only a resolved discussion from this tool becomes a reply in that discussion, and the discussion is reopened. This is the same result as a `relatesTo` to a resolved discussion. It replaces `publish-into-existing-discussions` Decision 4.
- When more than one resolved discussion from this tool has the anchor, the reply goes to the last one in GitLab's list, which is the most recent one.
- After `publish` decides what to do with each finding, it merges the findings that would create a discussion on the same file and line into one discussion. It also merges the findings that would reply to the same discussion into one reply. The merged comment has one marker line, then one `**[severity]** summary` paragraph for each finding, in findings file order.
- Pass or fail does not change: every finding still counts.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-output`:
  - Modified: "Publish findings as inline merge request comments" — the anchor also matches resolved discussions from this tool, which get a reply and are reopened.
  - Added: "Merge findings on the same line into one comment".

## Impact

- Affected code: `src/providers/gitlab/sinkProvider.ts` (anchor index, merge step, comment body).
- Affected tests: `src/providers/gitlab/sinkProvider.test.ts`.
- Affected docs: the "Output" section of `README.md`.
- No change to `review`, the findings file, the engine, or the configuration.
- A merge request whose resolved discussion from this tool matches a new finding by anchor now gets a reply and a reopened thread instead of a new thread.
