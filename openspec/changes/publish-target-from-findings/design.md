## Context

The findings file holds `diffRefs`, which is the host snapshot. `publish` reads the file, then `host.connect(settings)` builds a `GitLabClient` for the project in `settings.projectId`. `restore(snapshot)` uses `settings.mergeRequestIid`. The `review` and `publish` commands share one `readSettings` and one flag list. See proposal.md for the motivation.

`GitLabClient` is bound to one project when it is created. `GitLabClient.create` is asynchronous.

Local `SPEC.md` files that `openspec-sync-specs` must refresh after the implementation: `src/cli/SPEC.md` and `src/providers/gitlab/SPEC.md`. They map to the capability `review-cli`.

## Goals / Non-Goals

**Goals:**
- `publish` takes its target only from the findings file.
- The core code stays free of GitLab names. The host defines the shape of the source.

**Non-Goals:**
- No change to `diffRefs`. It keeps its name and shape.
- No check that compares the file with flags. The flags are gone, so there is nothing to compare.
- No support for a findings file without a source.
- The API URL and the token stay out of the findings file. The token is a secret. The API URL belongs to the machine that runs `publish`.

## Decisions

- **A new `source` field in the findings file.** The field sits beside `diffRefs`. The type is a second type parameter of `FindingsFile`. The host checks it with a new `parseSource`, in the same way as `parseSnapshot`. Alternative: put the project ID inside `diffRefs`. Rejected, because `diffRefs` would then hold two kinds of data under a misleading name.
- **The GitLab source is `{ host, projectId, mergeRequestIid }`.** `host` is the string `gitlab`. The other two values are strings, as in the settings today. The core code does not read `host`. The GitLab `parseSource` checks that it is `gitlab`. Today only one host exists, so the check protects a future second host from a wrong file. Alternative: add the field when a second host appears. Rejected, because the field is cheap now and the format needs no later change. The `review` command reads them from `--project-id`, `--mr`, `CI_PROJECT_ID`, and `CI_MERGE_REQUEST_IID`, and writes them to the file.
- **Each command gets its own host flags and settings.** The port gets separate flag lists and separate setting readers for `review` and `publish`. The `publish` list holds `--gitlab-url` and `--token` only. `parseArgs` runs in strict mode, so the other flags fail without extra code. Alternative: keep one list and ignore the flags in `publish`. Rejected, because a silent ignore hides the mistake that this change removes.
- **`restore` becomes asynchronous and takes the source.** The signature is `restore(source, snapshot): Promise<DiscussionGateway>`. It creates the `GitLabClient` for `source.projectId`. `connect` no longer needs the project. Alternative: make the client project-free by passing the project on each call. Rejected, because it touches every client method for no gain.
- **A missing `source` is a file error.** `readFindingsFile` throws `FindingsFileError` that names the field. The command exits with code 2, as for other invalid files.

## Risks / Trade-offs

- [Pipelines that pass `--mr` or `--project-id` to `publish` fail] → The error comes from `parseArgs` and names the flag. The proposal marks the change as breaking.
- [Findings files from earlier versions fail in `publish`] → A person runs `review` again. The files do not live long, because `publish` normally runs right after `review`.
- [A person can edit the `source` in the file by hand and publish to another merge request] → The person already holds the token and can call the API directly. The change adds no new power.

## Migration Plan

Release `review` and `publish` together. In each pipeline, remove `--mr`, `--project-id`, `CI_MERGE_REQUEST_IID`, and `CI_PROJECT_ID` from the `publish` step. Keep the same `findings.json` between the two steps. Rollback is a revert.
