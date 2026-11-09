# src/core/publish

## Purpose

Publishes findings as discussions through the host-neutral
`DiscussionGateway`, and builds the text of the comments from
templates.

## Contents

- `publisher.ts`: `Publisher`. Decides what to create, reply to,
  reopen, or resolve, and posts it.
- `template.ts`: loads, checks, and fills the comment templates
  (`finding.md`, `resolved.md`).
- `marker.ts`: the hidden markers that identify this tool's comments.
- `discussion.ts`: host-neutral discussion types and helpers for
  recognizing this tool's own comments.

## Capabilities

- `review-output`: `openspec/specs/review-output/spec.md`
