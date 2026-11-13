# src/template

## Purpose

The built-in text that the tool fills: the comments that `publish`
writes, and the user prompts of a review run. The build copies the four
files to `dist/template`.

## Contents

- `FINDING.md`: the default text of one finding in a comment.
- `RESOLVED.md`: the default text of the reply to a discussion
  declared fixed.
- `BATCH_PROMPT.md`: the user prompt of a batch run.
- `WHOLE_PROMPT.md`: the user prompt of a run over the whole change.

## Capabilities

- `review-output`: `openspec/specs/review-output/spec.md`
- `ai-diff-review`: `openspec/specs/ai-diff-review/spec.md`
