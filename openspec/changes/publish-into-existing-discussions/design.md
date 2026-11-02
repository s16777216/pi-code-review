# Design

## Context

After `review-with-existing-discussions`:

- A finding can have `relatesTo`, the ID of a discussion that the engine confirmed to exist at review time.
- Each comment from this tool starts with `<!-- pi-code-review -->`.
- `GitLabClient` has `listDiscussions`.

`GitLabSinkProvider.publish` still posts one new discussion per finding, in parallel. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals:**
- Follow the agent's `relatesTo` decision in `publish`.
- Add a fixed check that does not depend on wording or line number, for findings with no `relatesTo`.

**Non-Goals:**
- Resolve a discussion when its problem is gone. That needs a judgment that the problem is fixed. A wrong judgment closes a real problem.
- Edit an old comment.
- Match a finding to a discussion from a person in `publish`. Only the agent makes that link, through `relatesTo`.

## Decisions

### Decision 1: Order of the checks for one finding

```
relatesTo set?
├─ yes ─ discussion found? ─ no ─────────────────► new discussion
│                           └ yes ─ resolved? ─ no ► skip
│                                              └ yes► reply + reopen
└─ no ── open own discussion with same anchor? ─ yes ► skip
                                               └ no ─► new discussion
```

`relatesTo` comes first, because it carries the agent's judgment. The anchor check applies only when the agent made no link.

### Decision 2: Reply and reopen for a resolved discussion

The agent saw that the discussion was resolved, and still reports the problem. The agent judges that the problem is still there. A reply keeps the history in one thread. Reopening makes the thread visible again, because GitLab collapses resolved threads.

`GitLabClient` gets two methods:
- `addDiscussionNote(iid, discussionId, body)`: `POST /merge_requests/:iid/discussions/:id/notes`.
- `setDiscussionResolved(iid, discussionId, resolved)`: `PUT /merge_requests/:iid/discussions/:id?resolved=false`.

If the reopen fails, the reply stays, and the sink logs a `warn` line. A token without the right role can still post replies.

Alternatives:
- Reply only, no reopen. The reply is hidden in a collapsed thread, and people can miss it.
- A new discussion with a link to the old one. This splits one problem into two threads.

### Decision 3: The anchor is computed in the engine

The anchor needs the text of the finding's line. The engine has the diff, and the findings file does not. The engine computes the anchor after the diff check, from the same hunk walk as `checkNewFileLine`, and adds it to the `Finding`. `findings.json` carries it to `publish`.

The anchor is `sha256(file + "\n" + trimmedLineText)`, first 16 hex characters. The hash keeps the code text out of the marker. Trimming ignores a change of indentation.

Known limits:
- Two different problems on one line have the same anchor. While the first discussion is open, a second finding on that line with no `relatesTo` is skipped. This is accepted: a line with two real bugs is rare, and the open comment on the line still draws attention to it.
- A common line such as `}` or `return;` matches in many places. The anchor includes the file, which reduces this. A match inside one file is still possible.

### Decision 4: Anchor matches only open discussions from this tool

A resolved discussion with the same anchor and no `relatesTo` means that the agent did not link it. The project owner decided that the agent judges resolved discussions. `publish` does not replace that judgment, so it creates a new discussion.

A discussion from a person is never matched by anchor. Only this tool's comments have the marker.

### Decision 5: Read discussions once, fail open

The sink calls `listDiscussions` once before it posts. If the call fails, the sink logs a `warn` line and creates a new discussion for every finding. A missing comment hides a bug. A repeated comment is only noise.

### Decision 6: Pass or fail is unchanged

`runPublish` still calls `decidePassFail` on every finding in the file. The agent already removed the findings that it does not want to report. A skipped finding is still a problem in the code, so it still counts.

## Risks / Trade-offs

- [The agent links a finding to the wrong open discussion] → The finding is not posted. It still counts for pass or fail. The `--debug` log shows the link.
- [Reopening a thread that a person resolved annoys that person] → The reply explains why. The agent chose to report it after it read the thread.
- [Comments from older versions have no anchor] → They never match by anchor. The agent can still link to them with `relatesTo`.
- [The anchor format changes later] → All old anchors stop matching one time. Keep the format stable.
