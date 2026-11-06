# src/providers/gitlab

Implements capability `gitlab-mr-context` (central spec: `openspec/specs/gitlab-mr-context/spec.md`) and the GitLab side of `review-output`.

## Responsibility

The GitLab adapter: reads a merge request (metadata, diff, file content, discussions) into a `ReviewContext`, and writes discussions, replies, resolves, and general notes back.

## Entry points

- `host.ts`: `gitlabHost`, the `CodeHost` registered in `src/providers/index.ts`. It declares `reviewFlags` (`--gitlab-url`, `--project-id`, `--mr`, `--token`) and `publishFlags` (`--gitlab-url`, `--token`), reads the settings for each command, and offers `openChangeRequest` (for `review`) and `restore` (for `publish`), which both create the `GitLabClient`.
- `source.ts`: `GitLabSource` (`{ host: 'gitlab', projectId, mergeRequestIid }`) and `parseGitLabSource`, which checks the `source` of a findings file and rejects any other host.
- `mergeRequest.ts`: `GitLabMergeRequest` (implements `ChangeRequest` and `DiscussionGateway`), `GitLabApi`.
- `client.ts`: `GitLabClient` (HTTP, pagination, `PRIVATE-TOKEN` header), `GitLabApiError`.
- `discussions.ts`: `toHostDiscussion`. `diffRefs.ts`: `parseGitLabDiffRefs`. `config.ts`: connection settings.

## Interfaces and dependencies

- Implements the ports in `src/core/ports.ts`; the core never imports from here.
- `restore` builds its client for the project in the findings file `source`, so `publish` needs only the API URL and the token.
- Positions a discussion with base/start/head SHA and the new-file line, adding `old_line` for a context line.
- Never logs tokens or headers.
