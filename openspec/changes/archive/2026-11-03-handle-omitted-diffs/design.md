# Design

## Context

Facts in the current code:

- `GitLabClient.getMergeRequestDiff` reads `old_path`, `new_path`, `diff`, and `deleted_file` from `/merge_requests/:iid/diffs`. It ignores `too_large`, `collapsed`, and `generated_file`.
- `ChangedFileDiff` has `oldPath`, `newPath`, `hunks`, and `deleted`.
- `buildReviewPrompt` prints `### <path>` and the numbered diff for each file. In batch mode, it prints a list of every changed file with its state and its +/- counts, and only the batch's diffs.
- `planBatches` packs every changed file.
- The engine's diff line check drops a finding whose line is not an added or context line of its file.
- `GitLabDiscussionNote` has no note ID. The client cannot create or update a general comment.
- A general comment is listed by `/discussions` as a discussion with no position.

A test on gitlab.com with files of 2 KB, 40 KB, 150 KB, and 600 KB gave these results:
- `/diffs` returned the full diff for the first three, with `collapsed: false`.
- For the 600 KB file, `/diffs` returned `too_large: true` and an empty diff.
- The older `/changes` API also set `collapsed: true` with an empty diff for 40 KB and 150 KB.

See `proposal.md` for the motivation. The project owner decided:

1. Do this change after `merge-findings-on-publish`.
2. Show the unreviewed files on the merge request with one general comment. Do not change pass or fail.
3. Handle generated files in the same change.

## Goals / Non-Goals

**Goals:**
- A changed file that `review` does not review is never silent.
- Generated files do not use the review's input.

**Non-Goals:**
- Review a file that is too large, for example by building its diff from the two file versions. The agent can still read the file with `get_file_content`, up to that tool's size limit.
- Handle `collapsed`. `/diffs` returns the full diff for a collapsed file.
- Make the generated-file rule configurable.
- Fail the review or `publish` because of an omitted file.

## Decisions

### Decision 1: One host-neutral field on the changed file

`ChangedFileDiff` gets `omitted?: 'too_large' | 'generated'`. The GitLab adapter sets `too_large` when the API sets `too_large: true`. Otherwise, it sets `generated` when the API sets `generated_file: true`. The `hunks` text stays as GitLab returns it.

The two values say why the host gave no useful diff. They do not name GitLab, so a later GitHub adapter can set the same field.

### Decision 2: The input lists an omitted file without a diff

In a single run, an omitted file is shown as its heading and one line, `(diff not shown: too large)` or `(diff not shown: generated file)`, in place of the diff block. In batch mode, the file list shows the same reason in place of the +/- counts, and `planBatches` gets only the files that are not omitted.

The estimate of the first request uses the same input, so a generated file no longer pushes a change into batches.

### Decision 3: A finding on an omitted file is dropped

Before the diff line check, the engine drops a finding on an omitted file with the reason `diff_omitted`. For a file that is too large, the diff line check would drop it anyway, because the diff is empty. For a generated file, the diff is there, and an agent that read the file could report a line in it. The review did not show that diff, so it does not report on it.

Fixed declarations are not affected. Their check reads the current file, not the diff.

### Decision 4: `unreviewedFiles` in the review result and the findings file

`ReviewResult` and the findings file get `unreviewedFiles: { path, reason }[]`, with one entry for each omitted file, in path order. The path is the new path, or the old path of a deleted file. The reason is `too_large` or `generated`.

The engine writes one `warn` log line for each file that is too large. A generated file is expected, so it gets no `warn` line.

`publish` reads a findings file without `unreviewedFiles` as an empty list, so an older file still works. An entry that is not an object with a string `path` and a known `reason` fails the file before any GitLab call, as for findings.

### Decision 5: One comment for files too large to review

The sink keeps one general merge request comment from this tool for the files that are too large. Its body starts with the marker `<!-- pi-code-review unreviewed -->`, then a sentence and a list of the paths. Generated files are not listed, because skipping them is expected.

The sink finds its own comment in the discussions it already reads: the first note of a discussion with no position, whose body starts with that marker. It uses the last such comment in GitLab's list.

| Files too large | Existing comment | Action |
|---|---|---|
| some | none | create it |
| some | same body | nothing |
| some | other body | update it |
| none | none | nothing |
| none | lists files | update it to say that every changed file was reviewed |

When the discussions cannot be read, the sink creates the comment when there are files too large, as for findings. A missing comment hides a problem, and a repeated one is only noise.

A failure to create or update the comment writes one `warn` line and does not stop `publish`.

The client gets three things: the note `id` in `GitLabDiscussionNote`, `createNote(iid, body)` (`POST /merge_requests/:iid/notes`), and `updateNote(iid, noteId, body)` (`PUT /merge_requests/:iid/notes/:note_id`).

The marker has no `anchor=`, so the anchor match never uses this comment. The agent sees it through `list_discussions` as a general comment from this tool. That is true for any general comment.

Alternative: a new comment on each run. Each push to a merge request with a large file would add one more comment.

## Risks / Trade-offs

- [GitLab changes its limits] → The adapter reads the flag, not a size, so the limits do not matter.
- [A generated file has a real bug] → It is not reviewed. That is the purpose of the rule. The file is still in `unreviewedFiles`.
- [A person edits or deletes the comment] → An edited comment that still starts with the marker is updated on the next run. A deleted one is created again when files are still too large.

## Migration Plan

No migration. An older findings file reads as having no unreviewed files.

## Open Questions

(none)
