# Design

## Context

`readFindingsFile` (`src/findingsFile.ts`) has two error cases today: the file cannot be read, and the text is not JSON. Both throw `FindingsFileError`. `runPublishCommand` creates the `GitLabClient` first and reads the file second. `GitLabClient.create` makes no network call, so no API request happens before the read today, but that order is an accident of the current code. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Reject every findings file that `publish` cannot handle correctly, before any GitLab call.
- Use one finding check for both the engine and the findings file.

**Non-Goals:**
- Add a format version field to the findings file. A later provider change can add it when `diffRefs` stops being GitLab-specific.
- Check that a finding's file and line are in the merge request's current diff. `publish` does not fetch the diff.
- Accept a partly valid file. See Decision 2.

## Decisions

### Decision 1: Reuse the engine's finding check

`src/core/review/findings.ts` already has `validateFinding(item, index)`. Export it, and call it from `findingsFile.ts` for each element of `findings`. Its error messages already name the index and the field.

The check lives in `core/`, and `findingsFile.ts` is outside `core/`. This import direction is allowed: outer code may depend on `core/`, and `core/` does not depend on outer code.

Alternative: write a second check in `findingsFile.ts`. The two checks could then disagree, and `review` could write a file that `publish` rejects.

### Decision 2: Reject the whole file on the first error

The engine drops a single bad finding (see the `harden-review-engine-output` change), because model output is noisy. The findings file is different. The current `review` writes it from findings that already passed the check. A bad finding in the file means that a person or a tool changed it. Publishing the rest could hide that problem, and the pass or fail result would then not match the file.

The error is a `FindingsFileError` with the file path and the first bad field, for example `Findings file "findings.json" is invalid: findings[2] has an invalid "severity": "critical"`.

### Decision 3: Read and validate before creating the GitLab client

`runPublishCommand` changes its order: load config, read and validate the file, then create the client. The "before any GitLab call" rule then holds by the code structure, and does not depend on `GitLabClient.create` staying offline.

### Decision 4: Ignore unknown fields

The check reads only the fields that `publish` uses. Extra fields pass. A future `review` version can then add fields without breaking an older `publish` in the same pipeline.

## Risks / Trade-offs

- [A hand-edited file with one typo now fails the whole publish] → This is the intended behavior. The error message names the exact field to fix.
- [The `harden-review-engine-output` change edits the same `findings.ts`] → The two changes touch different functions. Merge that change first, then rebase this one.
