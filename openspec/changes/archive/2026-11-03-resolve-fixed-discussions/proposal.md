# Proposal

## Why

After `review-with-existing-discussions` and `publish-into-existing-discussions`, a comment from this tool stays open after its problem is fixed. A person must resolve each one by hand. On a merge request with many pushes, old open comments hide the comments that still matter.

`publish` cannot infer "fixed" from a missing finding. The model can miss a problem on one run, or leave it out because a person explained it. A missing finding is not proof of a fix.

## What Changes

- The agent can declare that a discussion from this tool is fixed. It gives the discussion ID and a reason.
- The agent output changes from a JSON array of findings to an object with `findings` and `resolved`. A bare array is still accepted, as findings only.
- The engine accepts a declaration only when all checks pass:
  - The discussion exists, this tool started it, and it is not resolved.
  - The discussion has an anchor.
  - No line in the current version of the file has that anchor. The line that the comment pointed at must be gone or changed.
  - No finding in the same output links to the same discussion.
- `findings.json` gets a `resolved` list.
- `publish` adds a reply with the reason to each declared discussion, and then resolves it.
- Discussions started by people are never resolved by this tool.
- Pass or fail does not change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Declare fixed discussions".
  - Added: "Accept a fixed declaration only after the checks".
- `gitlab-mr-context`:
  - Added: "Expose the anchor of a discussion started by this tool".
- `review-cli`:
  - Modified: "Review writes findings to a file" adds the `resolved` list.
- `review-output`:
  - Added: "Resolve discussions declared fixed".

## Impact

- Depends on `review-with-existing-discussions` and `publish-into-existing-discussions`. Implement both first.
- Affected code: `src/core/types.ts` (`ResolvedDiscussion`, `ReviewResult`, `ReviewDiscussion.anchor`), `src/core/review/engine.ts` and `findings.ts` (output format and checks), `src/core/review/diff.ts` or a new helper (anchor of a line), `src/providers/gitlab/sourceProvider.ts` (parse the anchor), `src/providers/gitlab/sinkProvider.ts` (reply and resolve), `src/findingsFile.ts`, `src/cli/index.ts`.
- **BREAKING** for code that calls `ReviewEngine.review`: it returns `{ findings, resolved }` instead of `Finding[]`. The CLI is the only caller in this repository.
- `findings.json` gets a new field. An older `publish` ignores it. The `validate-findings-file` proposal must accept it.
- The token needs a role that can resolve discussions, as for the reopen in `publish-into-existing-discussions`.
