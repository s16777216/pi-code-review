## 1. Shared template module

- [x] 1.1 Create `src/core/template.ts` with `fillTemplate`, `readTemplateFile`, `TemplateError`, and the built-in directory path. Move the tests of `fillTemplate` to `src/core/template.test.ts`. Verify that the moved tests pass.
- [x] 1.2 Change `src/core/publish/template.ts` and `publisher.ts` to use the shared module. Re-export `TemplateError` from `publish/template.ts`. Verify that all `publish` tests pass without a change to their expected text.

## 2. Template files

- [x] 2.1 Rename the untracked `src/template/REVIEW_PROMPT.md` to `BATCH_PROMPT.md`. Use `${title}` and add `${description}`. Verify that the text matches the old batch prompt.
- [x] 2.2 Create `src/template/WHOLE_PROMPT.md` with `${title}`, `${description}`, and `${files}`. Verify that the text matches the old whole prompt.
- [x] 2.3 Add both names to `scripts/copy-templates.mjs`. Run `npm run build` and verify that `dist/template` holds four files.

## 3. Prompt builders

- [x] 3.1 Change `buildBatchPrompt` and `buildWholePrompt` in `src/core/review/prompt.ts` to fill the templates. Keep the data rules for the empty description and the empty file list in code. Verify that `prompt.test.ts`, `scope.test.ts`, `characterization.test.ts`, and the golden file pass with no edit.
- [x] 3.2 Add tests. Each template holds all of its placeholders and no other. A diff that holds `${title}` stays as it is. A missing built-in file throws `TemplateError` that names the file.
- [x] 3.3 Make `AgentReviewEngine.review()` ask for the templates before it starts a run. Verify that the call is the first step of `review()` and that all tests pass. A test of the order is not possible, because the built-in directory is fixed and the engine has no way to replace the templates.

## 4. Finish

- [x] 4.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx prettier --check --end-of-line auto` on the changed files. Verify that all four pass.
- [x] 4.2 Run `openspec validate` for this change and verify that it passes.
