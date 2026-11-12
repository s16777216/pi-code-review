# src/core/publish

## Purpose

Publishes findings as discussions through the host-neutral
`DiscussionGateway`, and builds the text of the comments from
templates.

## Contents

- `publisher.ts`: `Publisher`. Decides what to create, reply to,
  reopen, or resolve, and posts it. Keeps the review status comment.
- `status.ts`: the fixed texts and the body of the review status comment
  (a failure, warnings, and files too large to review).
- `template.ts`: loads, checks, and fills the comment templates
  (`FINDING.md`, `RESOLVED.md`). Reads the built-in files from
  `src/template`.
- `marker.ts`: the hidden markers that identify this tool's comments.
- `discussion.ts`: host-neutral discussion types and helpers for
  recognizing this tool's own comments.

## Capabilities

- `review-output`: `openspec/specs/review-output/spec.md`
