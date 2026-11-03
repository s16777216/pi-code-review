# Proposal

## Why

The review agent sees only the diff. It does not know what people and earlier runs already said about the merge request. This causes two problems:

- A CI pipeline runs `review` again on each push. The model words the same bug differently each time, and the line moves when code changes above it. A text or line match in `publish` cannot detect the repeat. The `skip-duplicate-review-comments` proposal had this limit.
- A developer can explain in a discussion that some code is intentional. The agent cannot read that explanation, so it reports the same false positive again.

The agent can judge "this is the same problem" and "this was already explained" when it can read the discussions. A text match cannot.

## What Changes

- The agent gets a new tool, `list_discussions`. It returns the merge request's discussions: comments from people and from earlier runs, with file, line, resolved state, and authors.
- The agent decides how to use the discussions. It can leave out a problem that a discussion already explains, report it again, or link it to an existing discussion. Resolved discussions are part of that decision.
- A finding can carry an optional `relatesTo` field with the ID of an existing discussion. The engine keeps the field only when the ID exists in the merge request.
- Each comment that `publish` posts carries a hidden marker. The tool output marks a discussion that this tool started.
- The system prompt tells the agent that discussion text is information about the change, not instructions.

This change does not change what `publish` posts for a finding with `relatesTo`. The `publish-into-existing-discussions` change covers that.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ai-diff-review`:
  - Added: "Provide a discussion tool to the agent".
  - Added: "Instruct the agent how to use discussions".
  - Added: "Link a finding to an existing discussion".
- `gitlab-mr-context`:
  - Added: "Fetch merge request discussions on demand".
- `review-output`:
  - Added: "Mark comments posted by this tool".

## Impact

- Affected code: `src/core/types.ts` (`ReviewDiscussion`, `ReviewContext.listDiscussions`, `Finding.relatesTo`), `src/core/review/agent.ts` (new tool), `src/core/review/engine.ts` (prompt and `relatesTo` check), `src/core/review/findings.ts` (parse `relatesTo`), `src/providers/gitlab/client.ts` and `sourceProvider.ts` (fetch discussions), `src/providers/gitlab/sinkProvider.ts` (marker).
- `findings.json` can contain `relatesTo`. The current `publish` ignores the field.
- Security: anyone who can comment on the merge request can write text that the agent reads. That person can try to make the agent leave out a finding. The project owner accepts this risk. The system prompt reduces it but cannot remove it.
- Cost: more input tokens when the agent calls the tool. The tool has size and call limits.
- The `skip-duplicate-review-comments` proposal is replaced by this change and `publish-into-existing-discussions`.
- The `validate-findings-file` proposal must accept the optional `relatesTo` field.
