# src/core/publish

Implements capability `review-output` (central spec: `openspec/specs/review-output/spec.md`).

## Responsibility

Publishes findings as inline discussions through a host-neutral `DiscussionGateway`: creates, replies to, reopens, and resolves discussions, merges findings on the same line into one comment, and keeps the single "files too large" general comment.

## Entry points

- `publisher.ts`: `Publisher.publish()`. Matches findings to existing discussions by `relatesTo` or anchor and decides create vs reply.
- `marker.ts`: `MARKER`, `UNREVIEWED_MARKER`, `hasMarker`, `stripMarker`. The hidden HTML-comment markers that identify this tool's comments.
- `discussion.ts`: `HostDiscussion`, `toReviewDiscussion`, `isFromThisTool`, `discussionAnchor`, `unreviewedNoteOf`.

## Interfaces and dependencies

- Depends on the `DiscussionGateway` port in `src/core/ports.ts`; the GitLab implementation is in `src/providers/gitlab`.
- Comment bodies are `<marker>` then one `**[severity]** summary` paragraph per finding.
- The publish exit decision uses `src/core/passFail.ts`, counting every finding in the file, including skipped ones.
