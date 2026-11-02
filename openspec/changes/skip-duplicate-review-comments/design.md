# Design

## Context

`GitLabSinkProvider.publish` posts all findings in parallel through `MergeRequestWriter.createDiscussion`. The body is `**[severity]** summary`. The sink never reads the merge request. `runPublish` calls `decidePassFail` on the full findings list after `publish` returns. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Post each finding at most one time per file and line.
- Never treat a person's comment as a duplicate.

**Non-Goals:**
- Resolve or delete old comments for findings that are gone from the new findings file.
- Follow a finding when its line moves. Matching uses the exact file and line.
- Remove duplicates inside one findings file. The engine output is used as it is.

## Decisions

### Decision 1: Identify own comments with a hidden HTML marker

The body becomes `<!-- pi-code-review -->\n**[severity]** summary`. GitLab Markdown does not render HTML comments, so readers see the same text as today.

Alternatives:
- Match on the comment author. The token can be a person's token, so the author can be a real person who also writes manual comments. The author does not prove that this tool wrote the comment.
- Match on body text only, with no marker. A person can quote the same text, and the tool would then skip a real finding.

### Decision 2: The duplicate key is file, new line, and body

A finding is a duplicate when an existing note has the marker, `position.new_path` equal to the finding's file, `position.new_line` equal to the finding's line, and the same body. The check compares the full body, so a changed summary or severity counts as a new finding.

Alternatives:
- Key on file and line only. The engine can report two different bugs on one line, and the second one would be lost.
- Key on body only. The same text can apply to two different lines.

### Decision 3: List discussions once, before posting

`GitLabClient` gets `listDiscussions(mergeRequestIid)`. It calls `GET /merge_requests/:iid/discussions` and follows the `x-next-page` header, as `getMergeRequestDiff` does. The method returns only the fields that the check needs: body, `new_path`, and `new_line` of each note. It is part of `MergeRequestWriter`, because only the sink uses it.

The sink builds a set of keys from the result, then posts only the findings whose key is not in the set.

### Decision 4: Fail open when the list request fails

When `listDiscussions` throws, the sink logs one `warn` line and posts every finding. This matches the current rule that one failed discussion does not stop the others. A missing comment hides a bug. A duplicate comment is only noise.

Alternative: stop `publish` with an error. This gives no comments at all on a temporary GitLab error.

### Decision 5: Pass or fail stays in `runPublish`

`runPublish` still calls `decidePassFail` on `findingsFile.findings`. The sink does not return the skipped findings to it. This keeps the exit code the same for a re-run.

## Risks / Trade-offs

- [Comments from older versions have no marker] → Each one gets one more copy, one time. After that, the new comments carry the marker. The package has few users, so the cost is small.
- [A person edits a tool comment and keeps the marker] → The body no longer matches, so the tool posts the finding again. This is acceptable.
- [A merge request has many discussions] → The list uses `per_page=100` and pagination. One page covers most merge requests.
- [The rendered text changes in a later change to the comment format] → All old comments stop matching one time. Keep the marker line stable, and treat a format change as a known one-time re-post.
