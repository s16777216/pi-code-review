## Context

See `proposal.md` - Why for the motivation. This section covers only the facts needed to
justify the chosen boundaries.

`src/review/` and `src/report/exitCode.ts` do not import anything from `src/gitlab/`. They
only depend on `src/types.ts` and `src/config.ts`'s `FailOnSeverity` type. `src/report/
codeQuality.ts` builds GitLab's own "Code Quality" report format (a GitLab CI feature); it
has no GitHub or Gitea equivalent today. `src/config.ts` declares `GitlabConnectionConfig`
itself (it does not import it from elsewhere) and uses it inside otherwise generic-sounding
interfaces (`ReviewConfig`, `PublishConfig`); `src/findingsFile.ts` imports GitLab-specific
`GitLabDiffRefs` directly from `gitlab/client.ts` inside its otherwise generic-sounding
`FindingsFile` interface. Either way, both files are coupled to GitLab-specific types today.

## Goals / Non-Goals

**Goals:**
- Group `src/` by whether code references a specific provider (GitLab today), not by
  current folder name.
- Give a future second provider (see `TODO.md`) a folder to land in
  (`providers/<name>/`) without redesigning the layout again.
- Keep the move mechanical: file moves and import-path fixes only, zero behavior change.

**Non-Goals:**
- Do not decouple `config.ts` or `findingsFile.ts` from GitLab-specific types. They stay at
  the top level of `src/`, with their import paths updated to the moved files they
  reference but no other content change.
- Do not build a provider registry or selection logic. `providers/index.ts` re-exports the
  GitLab provider only.
- Do not rename `core/review/providers.ts` (the `SourceProvider`/`SinkProvider` port
  interfaces), despite the name now overlapping with the new `providers/` folder.
- Do not add a second provider implementation.

## Decisions

**1. Split by actual import coupling, not by current folder name.**
`core/` gets everything that does not import from `src/gitlab/`: `types.ts`, `review/`
(unchanged internally), and `report/exitCode.ts`. `providers/gitlab/` gets everything that
does: the current `gitlab/` folder's three files, plus `report/codeQuality.ts`.
Alternative considered: keep `report/` as one folder and move it whole into either `core/`
or `providers/gitlab/`. Rejected - the folder currently mixes one host-agnostic file with
one GitLab-specific file; moving it whole would misrepresent one of the two.

**2. `providers/index.ts` re-exports the GitLab provider; it does not select between
providers.**
With only one provider implemented, any selection interface (by CLI flag, by URL pattern, or
otherwise) would be designed against a single data point. Alternative considered: design the
registry/selection interface now, ahead of a second provider. Rejected - the right interface
only becomes clear once a second, differently-shaped provider (e.g. GitHub's `owner/repo`
instead of GitLab's numeric `project-id`) exists to design against.

**3. `config.ts`, `findingsFile.ts`, and `logger.ts` stay at the top level of `src/`, not
inside `core/`.**
`config.ts` declares a GitLab-specific type (`GitlabConnectionConfig`) itself, and
`findingsFile.ts` imports one (`GitLabDiffRefs`) from the GitLab provider; either way, both
are coupled to GitLab-specific types today. Moving them into `core/` would label them
host-agnostic when they are not - this does not forbid the import-path updates these files
otherwise need as other files move around them (see `tasks.md` tasks 1.4, 2.6). Alternative
considered: move them
into `providers/gitlab/` instead, since that is what they actually depend on today.
Rejected - `ReviewConfig`/`PublishConfig`/`FindingsFile` are still the CLI's own config and
findings-file shapes, used directly by `cli/index.ts`; filing them under a specific
provider's folder would be just as misleading in the other direction. Top level is the
honest "not yet decoupled" location until a future change resolves it.

**4. `core/review/providers.ts` keeps its current name and path.**
Renaming it to resolve the `providers.ts` (ports) vs. `providers/` (adapters) naming overlap
is a one-line-of-reasoning decision, but doing it in the same change as the file moves would
make the import-path diff harder to review (every caller's import line changes for two
unrelated reasons at once). Alternative considered: rename it now, while already touching
every import path. Rejected - keeping this change mechanical (moves only) makes the diff
easy to verify file-by-file; the rename is cheap to do later, on its own, when it is the only
change in the diff. The target name is decided (so the follow-up change has no open
question of its own): `core/ports.ts`, holding exactly the `SourceProvider`/`SinkProvider`
interfaces this file already has, with no content change.

## Recorded for Future Changes

Not implemented here - this change stays mechanical (file moves only, see Goals above).
Recorded so the follow-up change that resolves the `providers.ts`/`providers/` naming
overlap (Decision 4) does not have to re-derive these from scratch:

- **Provider selection**: when a second provider exists, the CLI selects between them
  with an explicit flag (e.g. `--host gitlab|github`), not by guessing from a URL. A URL
  guess breaks for a self-hosted instance on either side (self-hosted GitLab, GitHub
  Enterprise).
- **The state `review` hands to `publish` (today's `GitLabDiffRefs`) becomes one shared
  shape across providers**, not a per-provider opaque blob:
  ```ts
  interface DiffRefs {
    commitSha: string;  // GitLab: head_sha / GitHub: commit_id
    baseSha: string;    // GitLab: base_sha / GitHub: '' (or a specific sentinel)
    startSha: string;   // GitLab: start_sha / GitHub: '' (or a specific sentinel)
  }
  ```
  This was a deliberate, discussed choice: GitLab's merge request discussion position
  needs three SHAs (`base_sha`, `start_sha`, `head_sha`) because GitLab recomputes the
  diff position server-side (to survive a force-push); GitHub's pull request review
  comment needs only one (`commit_id`), with no equivalent recomputation. A
  discriminated union per provider was considered and would avoid the risk noted below,
  but the decision is to accept that risk in exchange for one shared shape - see Risks /
  Trade-offs. The one shape already shared regardless is `Finding.file`/`Finding.line`
  (`core/types.ts`), which is already enough for `core/review/engine.ts` to never need
  to know what a provider does with `DiffRefs`.

## Risks / Trade-offs

- [`providers/` holds only one provider after this change, which could read as "the
  registry already exists"] → Mitigation: `providers/index.ts` carries a comment stating
  it re-exports the GitLab provider only, with no selection logic yet.
- [The `core/review/providers.ts` vs. `providers/` naming overlap stays unresolved after this
  change] → Mitigation: `tasks.md` notes it as a known follow-up; it does not block this
  change, since nothing here reads the overlap as a bug.
- [Moving this many files risks a broken import path the compiler does not catch until much
  later] → Mitigation: run `npm run build` and `npm test` after each group of moves (see
  `tasks.md`), not only once at the end.
- [The shared `DiffRefs` shape (Recorded for Future Changes, above) types `baseSha`/
  `startSha` as plain, always-present `string`, so nothing stops a GitHub-origin
  `DiffRefs` (`baseSha: ''`, `startSha: ''`) from reaching GitLab's API by mistake - and
  `''` is not a safe placeholder there: GitLab's own server-side `PositionTracer#compare`
  throws on an empty `base_sha`/`start_sha` and returns a 500, confirmed against a real
  GitLab issue, not assumed. A discriminated union would have caught this at compile
  time by making `baseSha`/`startSha` inaccessible on a GitHub-origin value, but that
  alternative was not taken.] → Mitigation: the follow-up change that introduces a second
  provider MUST make `GitLabSinkProvider` reject (not silently forward) a `DiffRefs`
  value whose `baseSha`/`startSha` are empty/sentinel before it reaches GitLab's API, so
  the failure surfaces as this tool's own clear error instead of GitLab's 500.

## Migration Plan

Single repo, no deployed service - "migration" means the sequence of file moves within this
change:
1. Move `core/`'s files first (no dependency on the GitLab move) and fix their imports.
   Build and test.
2. Move `providers/gitlab/`'s files and fix their imports, including the ones now pointing
   into `core/`. Build and test.
3. Move `cli/index.ts` and its tests last, since it imports from both of the above. Fix
   imports. Build and test.
4. Delete the now-empty `report/` and `gitlab/` folders.
5. Final full `npm run build` and `npm test` pass.

Rollback: revert the change's commit(s); no data or deployed state is involved.

## Open Questions

(none - the two deferred decisions above are recorded as Non-Goals and follow-up work, not
unknowns)
