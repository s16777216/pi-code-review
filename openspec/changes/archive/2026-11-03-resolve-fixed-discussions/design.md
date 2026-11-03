# Design

## Context

After `review-with-existing-discussions` and `publish-into-existing-discussions`:

- The agent reads discussions through `list_discussions`. Each `ReviewDiscussion` has `fromThisTool` and `resolved`.
- Each comment from this tool starts with `<!-- pi-code-review anchor=<anchor> -->`. The anchor is the first 16 hex characters of `sha256(file + "\n" + trimmedLineText)`.
- `GitLabClient` has `addDiscussionNote` and `setDiscussionResolved`.
- `ReviewEngine.review` returns `Finding[]`, and the agent outputs a JSON array.

See `proposal.md` for the motivation. The project owner decided three points:

1. This is a separate change, after the two changes above.
2. A fixed check on the code must confirm each declaration.
3. Only discussions that this tool started can be resolved.

## Goals / Non-Goals

**Goals:**
- Resolve a comment from this tool when the agent declares the problem fixed and the code confirms a change.
- Never resolve a discussion that a person started.

**Non-Goals:**
- Infer a fix from a missing finding.
- Resolve a discussion when the fix is in a different place and the anchored line did not change. Decision 3 explains this limit.
- Make the checks configurable.

## Decisions

### Decision 1: An explicit declaration with a reason

The agent outputs:

```json
{
  "findings": [ ... ],
  "resolved": [{ "discussionId": "abc123", "reason": "The loop now uses i < n." }]
}
```

A declaration is a positive claim. The agent must read the discussion and the current code to make it. The reason goes into the reply, so a person can check the claim later.

`parseFindings` becomes `parseReviewOutput`. It accepts the object and also a bare array. The bare array keeps old prompts and test fakes working, and gives a model that ignores the new format the same result as today. Each invalid declaration is dropped with a `warn` line, as for findings.

`ReviewEngine.review` returns `ReviewResult { findings: Finding[]; resolved: ResolvedDiscussion[] }`.

### Decision 2: The engine runs the checks, in a fixed order

For each declaration, the engine stops at the first failed check and logs its name:

1. `discussion_not_found`: the ID is not in `listDiscussions`.
2. `not_from_this_tool`: `fromThisTool` is false.
3. `already_resolved`: `resolved` is true.
4. `no_anchor`: the discussion has no anchor or no file.
5. `linked_by_finding`: a finding in the same output has `relatesTo` equal to this ID.
6. `file_unreadable`: the file is not deleted in the change, and `getFileContent` returns an error.
7. `anchor_still_present`: a line of the current file content has the same anchor.

A file that the change deletes passes check 7 without a read. Its lines are gone.

The checks run in the engine, in `core/`, because they use only `ReviewContext` data. `ReviewDiscussion` gets `anchor: string | null`. The GitLab source provider reads it from the marker.

### Decision 3: "The anchored line is gone" is the fixed check

Check 7 hashes every trimmed line of the current file and compares each hash with the anchor. A match means that the exact code that the comment pointed at is still in the file. The engine then does not accept the declaration.

This check is strict on purpose. It allows a false "not fixed", but not a false "fixed":

- A fix in a caller or another file leaves the anchored line unchanged. The comment stays open. A person resolves it.
- A common line such as `}` is almost always still in the file. A comment anchored on it is almost never resolved by this tool.

The owner accepted this: a missed resolve costs one click. A false resolve hides a real bug.

Alternative: check only the diff, not the whole file. The anchored line can move outside the diff hunks and still exist. The whole-file check catches that case.

### Decision 4: `findings.json` carries the accepted declarations

`FindingsFile` gets `resolved: ResolvedDiscussion[]`. `review` writes only declarations that passed every check. `publish` does not repeat the code checks, because it does not have the file content. It checks again only the facts that can change between `review` and `publish`: the discussion still exists, still has the marker, and is still open.

### Decision 5: Reply first, then resolve

`publish` adds the reply `<!-- pi-code-review -->` + `Resolved: <reason>`, and then calls `setDiscussionResolved(..., true)`. The reply records why the thread closed. If the resolve call fails, the reply stays and `publish` logs a `warn` line, as for the reopen in `publish-into-existing-discussions`.

The reply marker has no anchor. A reply is not a new finding, and the anchor check reads only the first note of a discussion.

### Decision 6: Pass or fail ignores declarations

`decidePassFail` still reads only `findings`. A declaration says that a problem is gone, so it cannot add a failure. The resolved discussion was not in the findings of this run.

## Risks / Trade-offs

- [The agent declares a fix that is not real, and the anchored line also changed] → Both the model and the code check must agree. The reply shows the reason. If the problem comes back, a later run can report it, and `publish-into-existing-discussions` reopens the thread.
- [The thread opens and closes on repeated runs] → This needs the agent to disagree with itself and the code to change between runs. Each change of state has a reply with the reason.
- [The model ignores the new output format] → A bare array still works, with no declarations.
- [A file read per declaration adds API calls] → `getFileContent` is called once per file. The engine keeps the content for the run.
