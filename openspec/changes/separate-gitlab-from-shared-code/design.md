# Design

## Context

Facts in the current code:

- `core/review/providers.ts` exports `SourceProvider` and `SinkProvider`. Only the GitLab adapters import them.
- `config.ts`:
  - It exports `ConfigError`, `GitlabConnectionConfig`, `GitlabConnectionOverrides`, `ReviewConfig` (`gitlab` plus OpenAI and language settings), and `PublishConfig` (`gitlab` plus `failOnSeverity`).
  - It also exports `isMergeRequestPipeline`, `loadReviewConfig`, and `loadPublishConfig`.
  - A private `resolve(envName, override)` reads one required setting: the flag first, then the environment variable, and it throws `ConfigError` when neither is set.
- `providers/gitlab/client.ts` imports `ConfigError` from `config.ts`.
- `findingsFile.ts`:
  - It imports `GitLabDiffRefs` from `providers/index.ts`.
  - Its private validator checks that `diffRefs` is an object with non-empty `baseSha`, `startSha`, and `headSha`, and gives the error text `"diffRefs.<field>" is missing or is not a non-empty string.`
- `cli/index.ts` is the only place that builds the configs and reads or writes the findings file.

See `proposal.md` for the motivation. The project owner decided:

1. Do this in a change of its own, before a second host is added.
2. No behavior change.

## Goals / Non-Goals

**Goals:**
- Shared code (`config.ts`, `findingsFile.ts`, `core/`) does not import from `providers/`.
- A provider does not import from `config.ts`.
- A second provider can add its own settings and diff refs next to its code.

**Non-Goals:**
- Choose between providers at run time. That needs a second provider first.
- Change the findings file format. It keeps a `diffRefs` field with the GitLab shape.
- Rename the GitLab settings, flags, or environment variables.

## Decisions

### Decision 1: `core/ports.ts`

`core/review/providers.ts` moves to `core/ports.ts`, with the same two interfaces. "Port" names what they are: what the engine and the CLI need from a host. It also ends the overlap with the `providers/` folder of adapters. They live in `core/`, not `core/review/`, because `SinkProvider` is not part of the review engine.

### Decision 2: `settings.ts` holds what every configuration needs

`settings.ts` exports `ConfigError` and `requireSetting(envName, override)`, which is today's private `resolve`. Both `config.ts` and the GitLab provider import it, so no provider imports `config.ts`, and `config.ts` and the provider do not import each other in a cycle.

### Decision 3: `providers/gitlab/config.ts` holds the GitLab settings

It exports the following, with today's names and behavior:
- `GitlabConnectionConfig` and `GitlabConnectionOverrides`.
- `loadGitlabConnectionConfig(overrides)`.
- `isMergeRequestPipeline(overrides)`.

`config.ts` keeps the settings that do not depend on the host (the OpenAI ones, the language, `failOnSeverity`), and keeps `loadReviewConfig` and `loadPublishConfig`. It builds `{ gitlab: loadGitlabConnectionConfig(...), ... }` as today. `config.ts` is the CLI's composition point, so importing the GitLab provider there is the expected direction.

The order of the checks does not change, so the first missing setting is still the one in the error.

### Decision 4: The caller checks the diff refs

`readFindingsFile(path, parseDiffRefs)` takes a function that checks the `diffRefs` value and returns it typed, or throws an `Error` whose message names the field. `FindingsFile` gets a type parameter for the diff refs. `findingsFile.ts` then knows nothing of GitLab.

`providers/gitlab/diffRefs.ts` exports `parseGitLabDiffRefs`, with today's checks and error texts. `cli/index.ts` passes it to `readFindingsFile`. The error message of a bad file stays the same, because `readFindingsFile` still adds the file name and `is invalid:` around the message.

`FindingsFile` has no default type for its parameter. Every use must say which diff refs it carries.

Alternative: write the host's name into the findings file. That changes the file format, and the format can change when a second host needs it.

### Decision 5: `providers/index.ts` exports the new GitLab pieces

`providers/index.ts` also exports `loadGitlabConnectionConfig`, `isMergeRequestPipeline`, the two config types, and `parseGitLabDiffRefs`. Code outside `providers/` imports the GitLab provider only through that file, as today.

## Risks / Trade-offs

- [The moves make a large import diff] → Each file move is in its own task and is checked with build and test.
- [The type parameter on `FindingsFile` is new API inside the package] → The package has no public library API, so only this repository uses it.

## Migration Plan

No migration. Nothing outside `src/` changes.

## Open Questions

(none)
