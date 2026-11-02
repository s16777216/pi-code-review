## Why

`src/` groups code by folder (`gitlab/`, `review/`, `report/`) next to five loose top-level
files (`index.ts`, `config.ts`, `types.ts`, `findingsFile.ts`, `logger.ts`). The grouping does
not match the real split in the code: most of `review/` and `report/exitCode.ts` never
reference GitLab, but `report/codeQuality.ts` is GitLab's own Code Quality report format. A
planned future change adds a GitHub provider (see `TODO.md`). The current layout has no folder
for a second provider to land in.

## What Changes

- Move the engine-side, host-agnostic code into `core/`: `types.ts`, `review/` (unchanged
  internally), and `report/exitCode.ts`.
- Move the CLI wiring code into `cli/`: `index.ts` and its three test files.
- Create `providers/`, with the current GitLab adapter as its first member:
  `providers/gitlab/` holds `client.ts`, `sourceProvider.ts`, `sinkProvider.ts`, and
  `report/codeQuality.ts` (moved in, since it is GitLab's own report format, not a
  host-agnostic one). `providers/index.ts` re-exports the GitLab provider. It does not yet
  select between providers; a second provider and any selection logic are out of scope here.
- Delete the now-empty `report/` folder.
- Update every import path touched by the moves. No runtime behavior changes.
- Leave `config.ts`, `findingsFile.ts`, and `logger.ts` at the top level of `src/`.
  `config.ts` and `findingsFile.ts` still reference GitLab types directly
  (`GitlabConnectionConfig`, `GitLabDiffRefs`); decoupling them from a specific provider is
  a separate, future change.
- Leave `core/review/providers.ts` (the `SourceProvider`/`SinkProvider` port interfaces) at
  its current path and name. It names a different concept than the new `providers/` folder;
  resolving that naming overlap is a separate, future change.

## Capabilities

### New Capabilities

(none — this change moves files and updates imports; it does not add or change any
observable behavior)

### Modified Capabilities

(none)

## Impact

- Affected code: `src/types.ts`, every file under `src/gitlab/`, `src/review/`,
  `src/report/`, and `src/index.ts` (plus its test files), a new `src/providers/index.ts`,
  and every file elsewhere in `src/` that imports from them (`config.ts`, `findingsFile.ts`,
  `logger.ts` stay in place but may need updated relative import paths to the moved files).
- `package.json`'s `bin.picr`, `start`, and `dev` entries change target path (moving
  `src/index.ts` moves its compiled output from `dist/index.js` to `dist/cli/index.js`);
  `README.md`'s references to those paths change to match. No changes to `package.json`'s
  `files` field, published package contents (beyond the internal path within `dist/`), CLI
  flags, or environment variables.
- No test behavior changes: test files move with their source files; test assertions are
  unchanged. The one exception is `cli/index.entrypoint.test.ts`'s two literal path values
  (its `projectRoot` resolution and the subprocess entrypoint path), which must change to
  still point at the right files after the move - see `tasks.md` task 3.3.
- `openspec/specs/**` are unaffected — this change carries no requirement changes.
