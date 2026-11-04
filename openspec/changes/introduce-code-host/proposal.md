# Proposal

## Why

`separate-gitlab-from-shared-code` moved GitLab's settings and diff refs into `providers/gitlab/`. The seam between the CLI and the provider is still the GitLab client, not a port:

- `cli/index.ts` imports eight GitLab names from `providers/index.ts`: `GitLabClient`, `GitLabSourceProvider`, `GitLabSinkProvider`, `isMergeRequestPipeline`, `parseGitLabDiffRefs`, and the types `GitLabDiffRefs`, `MergeRequestProvider`, and `MergeRequestWriter`. `config.ts` imports three more.
  - `runReview` and `runPublish` take a GitLab client, so the CLI tests fake a GitLab client. That is why five GitLab types are used only by tests.
  - The CLI builds the GitLab client, source, and sink itself.
  - The diff refs come from `GitLabSourceProvider.getDiffRefs()`, a method that is not on the `SourceProvider` port.
  - `ReviewConfig` and `PublishConfig` have a `gitlab` field, and the CLI parses the GitLab flags.
- The publish rules are not about GitLab, but they live in `GitLabSinkProvider`. These are the anchor match, `relatesTo`, the merge of findings on one line, reply and reopen, the fixed-declaration checks, and the comment on unreviewed files. A second host would have to write them again.
- The comment marker (`<!-- pi-code-review … -->`) and the rules that read it (`isFromThisTool`, `discussionAnchor`, `stripMarker`) are in `providers/gitlab/`, but the format is this tool's own and does not depend on the host.

## What Changes

- New ports in `core/`, in an object-oriented shape:
  - `CodeHost`: the entry of one platform. It does what is needed before a change request is known: check the pipeline, declare and read its own settings and flags, open a change request for `review`, and check and restore one for `publish`.
  - `ChangeRequest`: one merge request for `review`. It loads the review input, and gives the snapshot that `publish` needs.
  - `DiscussionGateway`: the platform's basic actions on one merge request's discussions. These are list, create, reply, resolve or reopen, and create or update a general comment.
- `providers/gitlab/` gets one class, `GitLabMergeRequest`, that implements both `ChangeRequest` and `DiscussionGateway`, plus a `gitlabHost` entry object. `providers/index.ts` exports only `gitlabHost`.
- A new `Publisher` in `core/` holds the publish rules, and calls only `DiscussionGateway`.
- The comment marker and the rules that read it move to `core/`.
- `runReview` and `runPublish` take the ports instead of a GitLab client. `config.ts` keeps only the settings that do not depend on the host.
- No behavior change. The findings file, the flags, the environment variables, the comments, the error messages, and the exit codes stay as they are.

## Capabilities

### New Capabilities

(none). This change moves code and changes types. It does not add or change any behavior.

### Modified Capabilities

(none)

## Impact

- Depends on `separate-gitlab-from-shared-code`, which is merged and not yet archived.
- Affected code:
  - `src/core/ports.ts` gets the new ports, which replace `SourceProvider` and `SinkProvider`.
  - New `src/core/publish/`, with the `Publisher`, the marker, and the discussion rules.
  - `src/providers/gitlab/` gets `GitLabMergeRequest` and `gitlabHost`. These replace `sourceProvider.ts`, `sinkProvider.ts`, `discussions.ts`, `marker.ts`, and `unreviewedNote.ts`.
  - `src/providers/index.ts`, `src/config.ts`, `src/cli/index.ts`, and `src/findingsFile.ts`.
- Affected tests:
  - Most sink tests test publish rules, so they become `Publisher` tests with a fake `DiscussionGateway`.
  - The GitLab tests keep the API mapping.
  - The CLI tests fake the ports.
- Affected docs: the architecture lines at the top of `README.md`.
