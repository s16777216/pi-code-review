# Design

## Context

Facts in the current code (`src/providers/gitlab/sinkProvider.ts`):

- `publish` reads the discussions once, and builds `openOwnAnchors`: the anchors of open discussions that this tool started.
- `publishFinding` decides for each finding on its own, and all findings run in parallel with `Promise.all`:
  - `relatesTo` names an existing discussion: skip when it is open, or reply and reopen when it is resolved.
  - `relatesTo` names a discussion that does not exist: new discussion.
  - no `relatesTo`, and the anchor is in `openOwnAnchors`: skip.
  - otherwise: new discussion.
- The comment body is the marker line, `<!-- pi-code-review anchor=<anchor> -->`, then `**[severity]** summary`.
- The anchor is the first 16 hex characters of `sha256(file + "\n" + trimmedLineText)`. Two lines in one file with the same text have the same anchor.
- In the end-to-end run, GitLab listed discussions oldest first.

See `proposal.md` for the motivation. The project owner decided:

1. Do this change before the other open problems from the end-to-end run.
2. Replace `publish-into-existing-discussions` Decision 4: an anchor match on a resolved discussion from this tool gets a reply and a reopen.
3. Merge findings on the same line into one comment, instead of a thread with replies.

## Goals / Non-Goals

**Goals:**
- One thread for one problem on one piece of code, across runs.
- At most one new discussion for each file and line in one run, and at most one reply for each discussion.

**Non-Goals:**
- Change how the agent sets `relatesTo`, or how the engine checks it.
- Fix the anchor collision between two lines with the same text in one file. That is a limit of the anchor design, and it affects the existing open-discussion match too.
- Merge findings across runs into an existing comment. A later finding on a line with an open discussion is still skipped.
- Change pass or fail.

## Decisions

### Decision 1: The anchor also matches resolved discussions from this tool

The sink builds two indexes from the discussions that this tool started: open discussions by anchor, and resolved discussions by anchor. For a finding with no `relatesTo`:

```
open own discussion with this anchor? ─ yes ► skip
└ no ─ resolved own discussion with this anchor? ─ yes ► reply + reopen
       └ no ─► new discussion
```

The open match comes first. When an open thread on the code exists, the problem is already visible.

This replaces `publish-into-existing-discussions` Decision 4. That decision let a missing `relatesTo` stand for "the agent wants a new thread". In the end-to-end run, the agent read the resolved thread, reported the same problem, and did not set `relatesTo`. The second thread split the history. Reply and reopen is what `publish` already does when the agent sets the link (Decision 2 of that change), so a missing link now gives the same result.

When more than one resolved discussion from this tool has the anchor, the reply goes to the last one in the list that GitLab returns. GitLab lists discussions oldest first, so that is the most recent one.

A discussion from a person is still never matched by anchor. Only this tool's comments have the marker.

Alternative: the engine sets `relatesTo` from the anchor during `review`. The result is the same, but the open or resolved state can change between `review` and `publish`, and the sink already reads that state at publish time.

### Decision 2: Decide first, then merge

`publish` decides the target of each finding with the rules above: skip, reply to a discussion ID, or a new discussion. Then it groups the findings:

- Findings with a new-discussion target are grouped by file and line. Each group becomes one discussion at that position.
- Findings with a reply target are grouped by discussion ID. Each group becomes one reply, and the discussion is reopened once.
- Skipped findings stay skipped.

The grouping key for new discussions is the file and the line, not the anchor. All findings in one file come from one commit, so the line is exact, and two lines with the same text are never merged.

The groups keep findings file order, and the groups are posted in parallel, as today.

Alternative: the first finding creates the discussion, and the others become replies in it. This needs the new discussion's ID from `createDiscussion`, and the comments arrive in an order that depends on timing.

### Decision 3: The merged comment body

A merged comment has one marker line, then one paragraph for each finding, separated by a blank line:

```
<!-- pi-code-review anchor=<anchor> -->
**[important]** First summary.

**[nit]** Second summary.
```

The marker has the anchor of the first finding. The findings in a new-discussion group are on the same file and line, so they share it. A reply group can have findings on different lines, and the marker of a reply is not used for matching (only the first note of a discussion is). A group of one finding has the same body as today.

### Decision 4: Logging and failure

The `skipped` count in the `info` line is unchanged. One more `info` line gives the number of findings that were merged into another finding's comment, when that number is not zero.

When the request for a merged comment fails, the failure is logged once for each finding in the group, with that finding's file and line. That is the same per-finding log as today.

## Risks / Trade-offs

- [A person resolved a comment on purpose, and a reply reopens it] → `publish` already does this when the agent sets `relatesTo`. The agent read the thread and still reported the problem.
- [Two lines with the same text in one file share an anchor] → A finding on one of them can reply to, or be skipped by, a discussion on the other. This was already true for open discussions. It now applies to resolved ones too.
- [A merged comment has findings of different severities] → Each paragraph keeps its own `**[severity]**` label.

## Migration Plan

No migration. Existing comments keep their markers, and the findings file does not change.

## Open Questions

(none)
