## 0. Before you start

- [x] 0.1 Verify that pull request 72 is merged, and that this branch is on the latest `master`. Do not start 1.1 before this.

## 1. Move the text

- [x] 1.1 Write a temporary script that writes the 9 files in `src/template/system/` from the current constants. Compare each file, after `readTemplateFile`, with its constant. Verify that all 8 are equal. Keep the script out of the repository.
- [x] 1.2 Add `systemPrompts()` to `prompt.ts` as in Decision 2, with a test that a missing file throws `TemplateError` that names the file. Add `src/template/system/` to `.prettierignore`.
- [x] 1.3 Make `engine.ts`, `dedup.ts`, `verify.ts`, `judge.ts`, and `verifyAgent.ts` use `systemPrompts()`, and remove the 5 constants. Make `focus.ts` use a getter as in Decision 3. Call `systemPrompts()` in `AgentReviewEngine.review()` before the first run.
- [x] 1.4 Change the tests that import a removed constant to read the text with `systemPrompts()`. Do not change an expected text. Verify that the golden file does not change.

## 2. Build and package

- [x] 2.1 Change `scripts/copy-templates.mjs` to copy the 9 files in `system/`. Add a test that reads `dist/template/system` after the build and checks the 9 files.

## 3. Check and document

- [x] 3.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass and that the golden file has no change. If the golden test fails, run it again before you decide, because it can fail by chance (the `INFOS` line has no sort).
- [x] 3.2 Run one `picr review` with `--debug` on merge request 60, and do not run `publish`. Verify that every step runs and that no `warn` line names a template.
- [x] 3.3 Run `openspec-sync-specs` for this change to refresh `src/template/SPEC.md` and `src/core/review/SPEC.md`. Ask the user to approve each file first. Verify with `openspec validate move-system-prompts-to-templates --strict`.
