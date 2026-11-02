## 1. Move core (host-agnostic) code

- [ ] 1.1 Move `src/types.ts` to `src/core/types.ts` and verify `npm run build` reports no
      error for any file that imports it.
- [ ] 1.2 Move `src/review/` (all six non-test files and their six `.test.ts` files) to
      `src/core/review/`, unchanged internally, and verify `npm run build` passes.
- [ ] 1.3 Move `src/report/exitCode.ts` and `src/report/exitCode.test.ts` to
      `src/core/exitCode.ts` and `src/core/exitCode.test.ts`; fix the now-broken import of
      `types.ts` (relative path changes; the import of `config.ts` does not). Verify
      `npm run build` passes.
- [ ] 1.4 Run `npm test` and verify all existing tests still pass.

## 2. Move the GitLab provider

- [ ] 2.1 Move `src/gitlab/` (all three non-test files and their three `.test.ts` files) to
      `src/providers/gitlab/`.
- [ ] 2.2 Move `src/report/codeQuality.ts` and `src/report/codeQuality.test.ts` to
      `src/providers/gitlab/codeQuality.ts` and `src/providers/gitlab/codeQuality.test.ts`.
- [ ] 2.3 Delete the now-empty `src/report/` folder and verify it no longer exists.
- [ ] 2.4 Fix every import broken by steps 2.1-2.2: paths into `core/types.ts`,
      `core/review/providers.ts`, and `logger.ts`/`config.ts` at the top level of `src/`,
      plus the `codeQuality.ts` import inside `sinkProvider.ts` (now same-folder). Verify
      `npm run build` passes.
- [ ] 2.5 Create `src/providers/index.ts` re-exporting the GitLab provider's public surface
      (`GitLabClient`, `GitLabSourceProvider`, `GitLabSinkProvider`, and the
      `MergeRequestProvider`/`MergeRequestWriter`/`GitLabDiffRefs` types) with a comment
      stating it has no provider-selection logic yet (see `design.md` - Decision 2). Verify
      it compiles.
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
- [ ] 3.3 Update `package.json`'s `bin` entry target if the compiled output path changes,
      and verify `npm pack --dry-run` still lists a `picr` bin pointing at a file that
      exists in the tarball.
- [ ] 3.4 Run `npm test` and verify all 91 existing tests still pass, with no test added,
      removed, or changed in behavior.

## 4. Fix the remaining top-level files

- [ ] 4.1 Update `src/config.ts`'s import of `types.ts` to `core/types.ts` and verify
      `npm run build` passes.
- [ ] 4.2 Update `src/findingsFile.ts`'s import of `GitLabDiffRefs` to come from
      `providers/index.ts` instead of `gitlab/client.ts`, and verify `npm run build` passes.
- [ ] 4.3 Confirm `src/logger.ts` needs no changes (it has no internal imports).

## 5. Final verification

- [ ] 5.1 Run `npm run build` once from a clean `dist/` and verify zero TypeScript errors.
- [ ] 5.2 Run `npm test` and verify all tests pass, including `index.entrypoint.test.ts`'s
      real-subprocess tests (these catch a broken `cli/index.ts` entrypoint path that a
      type-check alone would not).
- [ ] 5.3 Diff `git status` against the file list in `proposal.md` - Impact and verify no
      file outside `src/` (and `package.json`, if task 3.3 changed it) was touched.
