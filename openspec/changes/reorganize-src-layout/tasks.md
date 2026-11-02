## 1. Move core (host-agnostic) code

- [ ] 1.1 Move `src/types.ts` to `src/core/types.ts`.
- [ ] 1.2 Move `src/review/` (all six non-test files, including `providers.ts`, and their
      five `.test.ts` files - `providers.ts` has no test file of its own) to
      `src/core/review/`, unchanged internally.
- [ ] 1.3 Move `src/report/exitCode.ts` and `src/report/exitCode.test.ts` to
      `src/core/exitCode.ts` and `src/core/exitCode.test.ts`.
- [ ] 1.4 Fix every import broken by 1.1-1.3:
      - `core/types.ts`'s own new relative path (no internal change needed; it has no
        internal imports).
      - `core/review/engine.ts`'s import of `../logger.ts`, which becomes `../../logger.ts`
        (its import of `../types.ts` stays unchanged: both `engine.ts` and `types.ts` move
        together, keeping the same relative depth between `core/review/` and `core/`).
      - `core/review/engine.test.ts`'s import of `../report/exitCode.ts`, which becomes
        `../exitCode.ts`, and its inline type import `import('../logger.ts').Logger`
        (line ~64), which becomes `import('../../logger.ts').Logger`.
      - `core/exitCode.ts`'s import of `types.ts` (relative path changes; its import of
        `config.ts` does not, since `config.ts` stays at the top level of `src/`).
      - `core/exitCode.test.ts`'s import of `../types.ts`, which becomes `./types.ts`
        (same-folder, now that both files are in `core/`).
      - `src/config.ts`'s import of `types.ts`, which becomes `./core/types.ts`.
      - `src/findingsFile.ts`'s import of `Finding` from `types.ts`, which becomes
        `./core/types.ts` (its separate `GitLabDiffRefs` import stays pointed at
        `./gitlab/client.ts` for now; that one is fixed in task 2.6, once
        `providers/index.ts` exists).
      - `gitlab/sinkProvider.ts`'s imports of `../review/providers.ts` and `../types.ts`,
        and `gitlab/sinkProvider.test.ts`'s import of `../types.ts`: these files are not
        moving yet, but both imports now point at `core/`, so their relative paths change.
      - `gitlab/sourceProvider.ts`'s imports of `../review/providers.ts` and `../types.ts`,
        for the same reason.
      - `src/index.ts`'s imports of `./review/engine.ts` and `./report/exitCode.ts`, which
        now point at `core/review/engine.ts` and `core/exitCode.ts`.
      Verify `npm run build` passes. None of `gitlab/`'s own
      file locations change in this section (that is section 2); only the import lines
      above, in files that are not yet moving, change to follow the files that did move.
- [ ] 1.5 Run `npm test` and verify all existing tests still pass.

## 2. Move the GitLab provider

- [ ] 2.1 Move `src/gitlab/` (all three non-test files and their three `.test.ts` files) to
      `src/providers/gitlab/`.
- [ ] 2.2 Delete the now-empty `src/report/` folder and verify it no longer exists.
- [ ] 2.3 Fix every import broken by step 2.1: paths into `core/types.ts`,
      `core/review/providers.ts`, and `logger.ts`/`config.ts` at the top level of `src/`,
      Also fix `src/index.ts`'s and `src/index.test.ts`'s imports of `./gitlab/client.ts`, `./gitlab/
      sinkProvider.ts`, and `./gitlab/sourceProvider.ts` (these files are not moving yet,
      but now point at `providers/gitlab/`; task 3.2 later switches them to go through
      `providers/index.ts` once `index.ts` itself moves). Do not run a build gate yet:
      `src/findingsFile.ts` still imports the now-moved `./gitlab/client.ts` until task 2.6.
- [ ] 2.4 Create `src/providers/index.ts` re-exporting the GitLab provider's public surface:
      `GitLabClient`, `GitLabSourceProvider`, `GitLabSinkProvider`, and the
      `MergeRequestProvider`/`MergeRequestWriter`/`GitLabDiffRefs`/`DiscussionPosition`/
      `FileContentResult`/`GitLabChangedFile`/`MergeRequestMetadata` types (the full set
      `src/index.test.ts` imports from `gitlab/client.ts` today), with a comment stating it
      has no provider-selection logic yet (see `design.md` - Decision 2).
- [ ] 2.5 Fix `src/findingsFile.ts`'s remaining `GitLabDiffRefs` import, from
      `./gitlab/client.ts` to `./providers/index.ts`. Verify `npm run build` passes (this is
      the first build gate since task 2.1; it covers 2.4-2.6 together, since 2.4's fixes
      alone leave `findingsFile.ts` broken until 2.6).
- [ ] 2.6 Run `npm test` and verify all existing tests still pass.

## 3. Move the CLI wiring

- [ ] 3.1 Move `src/index.ts`, `src/index.test.ts`, `src/index.cli.test.ts`, and
      `src/index.entrypoint.test.ts` to `src/cli/index.ts`,
      `src/cli/index.test.ts`, `src/cli/index.cli.test.ts`, and
      `src/cli/index.entrypoint.test.ts`.
- [ ] 3.2 Fix every import broken by the move: `config.ts`, `findingsFile.ts`, and
      `logger.ts` at the top level of `src/`; `core/exitCode.ts` and
      `core/review/engine.ts`; and the GitLab provider imports, switched to go through
      `providers/index.ts` instead of reaching into `providers/gitlab/` directly. Verify
      `npm run build` passes.
- [ ] 3.3 Fix `src/cli/index.entrypoint.test.ts`'s hardcoded paths, which do not change via
      import rewriting: `projectRoot` (`fileURLToPath(new URL('../', import.meta.url))`)
      must become `'../../'` to still resolve the repo root, and the subprocess's
      entrypoint path must become `src/cli/index.ts`. This is a mechanical path fix: the
      test's assertions and behavior are unchanged, only the two literal path values are
      (see `proposal.md` - Impact).
- [ ] 3.4 Moving `src/index.ts` to `src/cli/index.ts` changes `tsc`'s compiled output path
      from `dist/index.js` to `dist/cli/index.js` (compiled output mirrors `src/`'s
      structure). Update every reference to the old compiled path outside `src/`:
      `package.json`'s `bin.picr` entry, its `start` script (`node dist/index.js`), its `dev`
      script (`tsx src/index.ts`), and `README.md`'s references to `dist/index.js` and
      `src/index.ts` (lines 34, 173, 188 as of this writing). Comments inside moved files
      themselves (e.g. `cli/index.ts`'s own doc comment mentioning `node dist/index.js`,
      `cli/index.entrypoint.test.ts`'s doc comments mentioning `src/index.ts`/
      `dist/index.js`) may also be updated to say `dist/cli/index.js` - doing so is a comment
      edit, not a behavior or assertion change, so it does not conflict with task 4.4's
      content check. Verify:
      - `npm run build` from a clean `dist/`, then confirm `package.json`'s `bin.picr` value
        (`dist/cli/index.js`) matches a file that both exists on disk and appears in
        `npm pack --dry-run`'s file list (the two checks are different: the dry-run only
        proves the file would be published, not that `bin.picr` points at it).
      - Running the packaged entrypoint directly with a defined invocation and asserting its
        known output, e.g. `node dist/cli/index.js review` with `CI_MERGE_REQUEST_IID`,
        `CI_API_V4_URL`, `CI_PROJECT_ID`, and `GITLAB_TOKEN` unset, asserting stderr matches
        `/Not a merge request pipeline; skipping review\./` (the same assertion
        `cli/index.entrypoint.test.ts` already makes against the TypeScript source) -
        this proves the compiled JS entrypoint actually runs, not just that a file exists at
        the path.
- [ ] 3.5 Run `npm test` and verify all 91 existing tests still pass, with no test added,
      removed, or changed in behavior (`cli/index.entrypoint.test.ts`'s two literal path
      values from task 3.3 are the only exception).

## 4. Final verification

- [ ] 4.1 Confirm `src/logger.ts` needs no changes (it has no internal imports).
- [ ] 4.2 Run `npm run build` once from a clean `dist/` and verify zero TypeScript errors.
- [ ] 4.3 Run `npm test` and verify all tests pass, including `cli/index.entrypoint.test.ts`'s
      real-subprocess tests (these catch a broken `cli/index.ts` entrypoint path that a
      type-check alone would not).
- [ ] 4.4 Before starting section 1, record a baseline: `git status` and `git stash` (or a
      throwaway commit) of whatever this change's implementation branch starts from, so
      this task's comparisons are against that recorded baseline, not against whatever else
      happens to be in the working tree by the time this task runs (e.g. unrelated
      in-progress edits elsewhere in the repo). Build the old-path -> new-path inventory
      from `proposal.md` - Impact (every file under the old `src/gitlab/`, `src/review/`,
      `src/report/`, plus `src/types.ts` and `src/index.ts` with its test files, mapped to
      its new path, plus the newly created `src/providers/index.ts`). Relative to that
      baseline, check `git status` shows every old path gone and every new path present
      (including untracked new files, which `git diff` alone does not show), with nothing
      extra moved, added, or left behind. Check no file outside `src/` was touched except
      `package.json` and `README.md` (task 3.4). For each moved file, run `git diff` against
      the baseline (including staged and unstaged changes - not `git log --follow`, which
      only inspects committed history) comparing its new content to its pre-move content,
      and confirm every changed line is an import path, one of the two literal path values
      from task 3.3, or a comment referring to the old compiled or source path (task 3.4) -
      nothing else.
