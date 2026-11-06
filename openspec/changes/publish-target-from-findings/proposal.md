## Why

The `publish` command reads its target merge request from flags and environment variables. The findings file does not name that target. A wrong `--mr` or a stale `CI_MERGE_REQUEST_IID` can post the findings to the wrong merge request. A person always runs `publish` on the output of `review`, so the findings file is the right source of the target.

## What Changes

- The `review` command writes the source of the review to the findings file. For GitLab, the source is the host name `gitlab`, the project ID, and the merge request IID.
- The `publish` command reads the host name, the project ID, and the merge request IID from the findings file.
- The `publish` command stops when the host name is not one that it supports.
- **BREAKING**: The `publish` command no longer accepts the `--project-id` and `--mr` flags. It no longer reads `CI_PROJECT_ID` and `CI_MERGE_REQUEST_IID`.
- **BREAKING**: A findings file without a `source` field is invalid for `publish`. The `publish` command stops before it calls the host API.
- The `publish` command still reads the GitLab API URL and the token from flags and environment variables.
- The `review` command keeps its flags and variables.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `review-cli`: The findings file gains a `source` field. `publish` reads its target from that field. `publish` rejects the project and merge request flags.

## Impact

- Code: `src/findingsFile.ts`, `src/cli/index.ts`, `src/core/ports.ts`, `src/providers/gitlab/host.ts`, `src/providers/gitlab/config.ts`, `src/providers/gitlab/mergeRequest.ts`, `src/providers/gitlab/client.ts`.
- Tests: tests for the findings file, the CLI options, the GitLab host, and any fixture that holds a findings file.
- CI: a pipeline that passes `--mr` or `--project-id` to `publish` fails. The pipeline must remove those flags.
- No new dependency.
