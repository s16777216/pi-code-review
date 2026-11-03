# Proposal

## Why

`review` can skip a changed file without any signal.

- GitLab's `/merge_requests/:iid/diffs` API sets `too_large: true` and returns an empty `diff` for a file whose diff is over GitLab's limit. A test on gitlab.com showed this for a 600 KB file. Files of 40 KB and 150 KB came back with their full diff and `collapsed: false`, so `collapsed` is not a problem for this API.
- The adapter keeps only the `diff` text. The prompt then shows an empty diff block for that file. The agent cannot see the change, any finding on the file is dropped because its line is not in the diff, and the review can pass with no sign that a file was not reviewed.
- GitLab also marks generated files, such as lock files, with `generated_file: true`. Their diffs go into the prompt in full. They are rarely worth a review, and they can use most of the input, or push a change into batches.

## What Changes

- The GitLab adapter marks a changed file whose diff GitLab returns with `too_large: true` as omitted for that reason, and a file with `generated_file: true` as omitted because it is generated.
- The review input lists an omitted file with its path and the reason, without a diff. An omitted file is never part of a batch. The agent can still read an omitted file with `get_file_content`.
- The engine drops a finding on an omitted file, with the reason `diff_omitted`.
- `review` writes the omitted files to the findings file as `unreviewedFiles`, each with its path and reason, and writes one `warn` log line for each file that is too large.
- When the findings file has a file that is too large, `publish` keeps one general merge request comment from this tool that lists those files. A later run updates that comment and does not add a second one. When no file is too large any more, it updates the comment to say that every file was reviewed. Generated files are not listed in the comment.
- Pass or fail does not change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `gitlab-mr-context`:
  - Modified: "Fetch the merge request diff" — also reports the files whose diff is omitted, and why.
- `ai-diff-review`:
  - Modified: "Build review input from the review context" — every hunk of every changed file that is not omitted is in the input of exactly one run.
  - Added: "List omitted files without their diff".
  - Added: "Drop findings on omitted files".
  - Added: "Report the omitted files".
- `review-cli`:
  - Modified: "Review writes findings to a file" — the file also has `unreviewedFiles`.
  - Modified: "Publish reads findings from a file" — checks `unreviewedFiles`, and reads a file without it as an empty list.
- `review-output`:
  - Added: "Keep one comment that lists files too large to review".

## Impact

- Affected code:
  - `src/core/types.ts`: `ChangedFileDiff.omitted`, and `ReviewResult.unreviewedFiles`.
  - `src/providers/gitlab/client.ts`: the diff fields, note IDs, and creating and updating a general comment.
  - `src/providers/gitlab/sourceProvider.ts`: maps the diff fields.
  - `src/core/review/prompt.ts`, `src/core/review/engine.ts`, and `src/core/review/findings.ts`.
  - `src/findingsFile.ts` and `src/cli/index.ts`.
  - `src/providers/gitlab/sinkProvider.ts`: the comment on unreviewed files.
- Affected tests: the tests for each of these files.
- Affected docs: `README.md`, the "Output" section and a note in "Large merge requests".
- A findings file from an older `review` has no `unreviewedFiles`. `publish` reads it as an empty list.
- A merge request with a generated file now gets a smaller prompt, and no finding on that file.
