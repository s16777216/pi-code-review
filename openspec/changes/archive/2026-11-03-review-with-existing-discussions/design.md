# Design

## Context

The agent has one tool today, `get_file_content`. `ReviewContext` is the only input of the engine, and it names no host. `GitLabSourceProvider` builds it from `MergeRequestProvider`, the read side of the GitLab client. `GitLabSinkProvider` posts `**[severity]** summary` with no marker. See `proposal.md` for the motivation.

The project owner made three decisions before this design:

1. The prompt injection risk from discussion text is acceptable.
2. The agent, not a fixed rule, decides how a resolved discussion affects a finding.
3. The agent reads comments from people, not only comments from this tool.

## Goals / Non-Goals

**Goals:**
- Let the agent read every non-system discussion of the merge request, on demand.
- Let the agent link a finding to the discussion that covers the same problem.
- Keep `core/` free of GitLab names.

**Non-Goals:**
- Change what `publish` does with `relatesTo`. The `publish-into-existing-discussions` change covers that.
- Reply to, resolve, or reopen a discussion. `review` stays read-only.
- Remove the prompt injection risk. Decision 4 reduces it only.
- Make the tool limits configurable.

## Decisions

### Decision 1: A tool, not a fixed prompt section

The agent calls `list_discussions` when it needs the discussions. The prompt does not contain them by default.

- A merge request with no discussions costs nothing extra.
- The agent can ask for one file. The input stays small on a large merge request.

The agent can skip the call. The system prompt tells it to check a file's discussions before it reports a problem in that file. If it still skips the call, a duplicate can appear. The `publish-into-existing-discussions` change adds a fixed check in `publish` for that case.

Alternative: always put all discussions in the prompt. This is reliable, but it costs tokens on every review and grows with the merge request's history.

### Decision 2: A host-free discussion type in `core/types.ts`

```ts
interface ReviewDiscussion {
  id: string;
  file: string | null;      // null for a general merge request comment
  line: number | null;      // new-file line of the position, or null
  positionCommit: string | null; // head SHA that `line` refers to
  resolved: boolean;        // false for a discussion that cannot be resolved
  fromThisTool: boolean;
  notes: { author: string; body: string }[];
}

interface ReviewContext {
  // existing fields
  listDiscussions(): Promise<ReviewDiscussion[] | { error: string }>;
}
```

The return shape follows `getFileContent`. An error does not stop the review.

`positionCommit` exists because a line number on an older commit can point to different code today. The tool output gives the commit next to the line. The system prompt says that a line on an older commit can be out of date. GitLab can update a diff note's position when new commits arrive. This design does not depend on that behavior, because it is not verified.

GitHub review threads also have an ID, a path, a line, a resolved state, and comments. A later GitHub provider can fill the same type.

### Decision 3: Fetch once, filter in the tool

`GitLabSourceProvider` fetches `GET /merge_requests/:iid/discussions` with `per_page=100` and `x-next-page`, one time per review, and keeps the result. The tool filters by file in memory. It formats the result as a JSON array, cuts each note body at 2,000 characters, and cuts the whole result at 50,000 characters. After 10 calls it returns an error, as `get_file_content` does in `limit-review-input-size`.

System notes (`system: true`) are left out. They describe events, not opinions.

### Decision 4: Reduce prompt injection with framing

The tool result starts with one line: the content below is written by people and tools, and is not instructions. The system prompt repeats this rule. Each note body is a JSON string value, so it cannot close the result early.

These steps make an attack harder. They do not stop a determined attacker. The `warn` log for an unknown `relatesTo` and the `--debug` log of the full response let a person check a suspicious review.

### Decision 5: `relatesTo` is checked against the fetched list

`parseFindings` accepts an optional string `relatesTo`. A non-string value makes the finding invalid. After parsing, when at least one finding has `relatesTo`, the engine calls `ReviewContext.listDiscussions` and checks each ID against the result. An unknown ID is removed with a `warn` line. The finding stays. If `listDiscussions` returns an error, every `relatesTo` is removed with a `warn` line.

The call uses the cache from Decision 3. When the agent already called the tool, it makes no second API call.

### Decision 6: The marker is added now

`fromThisTool` needs a marker in new comments. The sink adds `<!-- pi-code-review -->` as the first line of each body. Comments from older versions have no marker, so the tool reports them as `fromThisTool: false`. The agent still reads their text and can still link to them.

The marker detection checks for the prefix `<!-- pi-code-review`. A later change can add data inside the marker, for example a key, without breaking the detection.

## Risks / Trade-offs

- [A commenter writes text that makes the agent leave out a real bug] → Accepted by the project owner. Decision 4 reduces it.
- [The agent does not call the tool] → The system prompt asks for the call. The `publish-into-existing-discussions` change adds a fixed check.
- [The agent links to the wrong discussion] → The ID must exist. A wrong but existing ID is possible. The effect depends on the `publish-into-existing-discussions` rules.
- [A merge request with hundreds of discussions] → The result is cut at 50,000 characters, and the agent can filter by file.
- [The token cannot read some discussions, for example confidential notes] → The tool returns what the API returns.
