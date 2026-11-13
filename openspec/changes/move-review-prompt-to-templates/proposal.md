## Why

The user prompt of a review run is text inside `src/core/review/prompt.ts`. A person who wants to read or adjust the wording must read code. The comment texts of `publish` already live in template files. This change gives the review prompts the same form.

## What Changes

- Move the text of the user prompt of a batch run to a built-in template file, `src/template/BATCH_PROMPT.md`.
- Move the text of the user prompt of a run over the whole change to a built-in template file, `src/template/WHOLE_PROMPT.md`.
- `buildBatchPrompt` and `buildWholePrompt` fill the templates with `${title}`, `${description}`, `${list}`, `${diffs}`, `${files}`, `${index}`, and `${count}`.
- Move `fillTemplate` and the template file reader to a module that both `review` and `publish` use. The `publish` behavior does not change.
- Add the two new files to `scripts/copy-templates.mjs`, so the build copies them to `dist/template`.
- The prompt text that the agent receives does not change. The existing prompt tests and the golden file `__golden__/review-output.txt` stay as they are and prove this.
- A person cannot replace these templates. This change adds no flag and no setting.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The behavior of the tool does not change. This change sets `skip_specs: true` in `.openspec.yaml`.

## Impact

- `src/core/review/prompt.ts`: reads the templates and fills them.
- `src/core/publish/template.ts`: uses the shared module for `fillTemplate` and for reading a template file.
- New shared module for template filling and reading, and its tests.
- `src/template/`: two new files. The untracked file `REVIEW_PROMPT.md` becomes `BATCH_PROMPT.md`.
- `scripts/copy-templates.mjs`: two more file names.
- Folder guides: `src/core/review/SPEC.md`, `src/core/publish/SPEC.md`, `src/template/SPEC.md`.
- No new dependency. No change to the CLI, the findings file, or the published comments.
