# src/template

## Purpose

The built-in text that the tool fills: the comments that `publish`
writes, the user prompts of a review run, and the system prompts of the
review agents. The build copies the files to `dist/template`.

## Contents

- `FINDING.md`: the default text of one finding in a comment.
- `RESOLVED.md`: the default text of the reply to a discussion
  declared fixed.
- `BATCH_PROMPT.md`: the user prompt of a batch run.
- `WHOLE_PROMPT.md`: the user prompt of a run over the whole change.
- `system/`: the system prompts of the review agents, one file for each
  prompt: the review prompt, the three review focus texts and the sentence
  that they share, and the prompts of the deduplication step, the verifier,
  the judge, and the verify agent. Prettier ignores this folder, because a
  formatter must not change a prompt.

## Capabilities

- `review-output`: `openspec/specs/review-output/spec.md`
- `ai-diff-review`: `openspec/specs/ai-diff-review/spec.md`
