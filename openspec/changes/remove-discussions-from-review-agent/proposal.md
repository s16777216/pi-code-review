## Why

The verify agent now matches each finding to a discussion, and it decides which findings people must see. It reads the discussions with their notes, including the replies of people. The review agents also read the discussions today, with the `list_discussions` tool, and they set `relatesTo`. This work is done twice, by two kinds of agent, with the same data.

The two jobs can disagree, and the verify agent replaces the answer of the review agent. The review agents also spend calls and tokens on the discussions, and a reply of a person can steer the first search for problems. A review agent that only reads the diff and the code is simpler and does not depend on the discussions.

## What Changes

- **BREAKING**: The review agents no longer have the `list_discussions` tool. The system prompt of a review agent no longer mentions discussions.
- **BREAKING**: The `submit_review` tool no longer has the `relatesTo` field on a finding. A `relatesTo` in a call is ignored and is not an error.
- The system no longer checks `relatesTo` of the findings of the review agents (`unknown_discussion` and `discussions_unavailable`). No finding has a `relatesTo` at that point.
- The prompt of the verify agent no longer has the hint that a review agent linked a finding to a discussion. The verify agent is the only source of `relatesTo`.
- When a verify agent run fails, the findings of that file stay with no `relatesTo`, and `publish` matches them by the anchor, as for a finding with no link.
- No change to `findings.json`, to `publish`, to the CLI flags, or to the `ReviewResult` type. `findings.json` can still have `relatesTo`, from the verify agent. `ReviewContext.listDiscussions` stays for the judge and the verify agent.
- Out of scope: the rules about `relatesTo` in the deduplication step and the verification step. No finding has a `relatesTo` when they run, so these rules do nothing. A later change removes them.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Do not offer discussions to the review agent".
  - Removed: "Provide a discussion tool to the agent", "Instruct the agent how to use discussions", and "Link a finding to an existing discussion".
  - Added and removed (renamed): "Run the steps on the merged output" becomes "Run the steps after the review agents". "Apply the decisions of the verify agent" becomes "Apply the decisions to the findings and the discussions". Their scenarios no longer have a `relatesTo` from a review agent.
  - Modified: "Give the verify agent the findings, the declarations, and the discussions", "Keep the earlier result when a verify agent run fails", "Turn a fixed judgment into a declaration", and "Judge each open discussion of this tool" lose the `relatesTo` of a review agent.

## Impact

- Code: `src/core/review/agent.ts` (the discussion tool and the `relatesTo` field), `src/core/review/engine.ts` (the tools and the system prompt), `src/core/review/checks.ts` (the `relatesTo` check), and `src/core/review/verifyAgent.ts` (the hint in the prompt).
- Tests: the tests of the discussion tool, of the `relatesTo` check, and of the hint, the faux helper of the verify agent, and the golden file.
- Docs: `docs/how-it-works.md` (the section "Existing discussions" and the section of the review agents), and `src/core/review/SPEC.md` through `openspec-sync-specs`.
- Risk: a review agent no longer knows that a person explained a problem, so it reports it again. The verify agent drops such a finding, but only for a file that has a discussion, and only when its run works. When the run fails, the finding is posted.
