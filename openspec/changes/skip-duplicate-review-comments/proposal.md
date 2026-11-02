# Proposal

## Why

`publish` posts one discussion for every finding, every time it runs. A CI pipeline runs `review` and `publish` again on each push to the merge request. An unchanged finding therefore appears again on every push. After 3 pushes, the same bug has 3 identical comments. This noise makes people ignore the comments.

## What Changes

- `publish` reads the merge request's existing discussions before it posts.
- `publish` skips a finding when a comment that this tool posted already exists on the same file and line, with the same text.
- Each comment that `publish` posts carries a hidden marker. The marker identifies the comment as posted by this tool. GitLab does not show the marker in the rendered comment.
- When `publish` cannot read the existing discussions, it logs a `warn` line and posts every finding, as it does today.
- The pass or fail decision does not change. It still uses every finding in the findings file, including skipped findings.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `review-output`:
  - Modified: "Publish findings as inline merge request comments" now skips a finding that this tool already posted on the same file and line.
  - Added: "Mark comments posted by this tool" requires the hidden marker.
  - Added: "Count skipped findings toward pass or fail" keeps the exit code the same for a re-run.

## Impact

- Affected code: `src/providers/gitlab/client.ts` (a new method that lists merge request discussions, with pagination), `src/providers/gitlab/sinkProvider.ts` (the duplicate check and the marker in the comment body).
- Affected tests: `client.test.ts`, `sinkProvider.test.ts`, and the fake clients in `src/cli/index.test.ts`.
- `publish` makes one or more extra GET requests to the GitLab API per run.
- No change to the CLI flags, to `findings.json`, or to the exit code rules.
- Comments posted by older versions have no marker. `publish` does not treat them as duplicates, so each one gets one more copy, one time.
