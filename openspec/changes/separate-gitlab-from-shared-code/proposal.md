# Proposal

## Why

`reorganize-src-layout` left two things for a later change:

- `core/review/providers.ts` holds the `SourceProvider` and `SinkProvider` port interfaces. The `providers/` folder holds the adapters that implement them. The two names point at different things.
- `config.ts` and `findingsFile.ts` are shared by both commands, but they still know GitLab:
  - `config.ts` defines the GitLab connection settings and reads `CI_API_V4_URL`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID`.
  - `findingsFile.ts` imports `GitLabDiffRefs` and checks its three SHA fields.

  A second host (see `TODO.md`) would have to change both files. Its own settings and its own diff refs would have no place of their own.

Two more facts came up:

- `client.ts` imports `ConfigError` from `config.ts`, so a provider depends on the CLI's configuration file.
- `isMergeRequestPipeline` reads `CI_MERGE_REQUEST_IID`, which is a GitLab CI variable.

## What Changes

- Rename `core/review/providers.ts` to `core/ports.ts`.
- Move the GitLab connection settings (their types, how they are read, and `isMergeRequestPipeline`) to `providers/gitlab/config.ts`. `config.ts` keeps the settings that do not depend on the host, and builds the two command configs from both parts.
- Move `ConfigError` and the helper that reads a required setting to a new `settings.ts`, which both `config.ts` and the GitLab provider import.
- `findingsFile.ts` no longer knows the shape of the diff refs. The caller passes a function that checks them. The GitLab provider gives the one that checks its three SHA fields.
- No behavior change. The findings file, the settings, the error messages, and the exit codes stay as they are.

## Capabilities

### New Capabilities

(none). This change moves code and changes types. It does not add or change any behavior.

### Modified Capabilities

(none)

## Impact

- Affected code:
  - `src/core/review/providers.ts` → `src/core/ports.ts`.
  - `src/config.ts`.
  - New `src/settings.ts` and `src/providers/gitlab/config.ts`.
  - `src/findingsFile.ts`, new `src/providers/gitlab/diffRefs.ts`, `src/providers/index.ts`, and `src/cli/index.ts`.
  - The imports in the GitLab provider.
- Affected tests: the tests of `config.ts`, `findingsFile.ts`, and `client.ts` follow the moves. The existing tests keep their assertions.
- No change to the README, the specs, or the findings file format.
