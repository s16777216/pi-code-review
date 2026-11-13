## Context

`buildBatchPrompt` and `buildWholePrompt` in `src/core/review/prompt.ts` build the user prompt of a run with string arrays. `publish` already keeps its comment text in `src/template/FINDING.md` and `RESOLVED.md`. `src/core/publish/template.ts` fills them with `fillTemplate` and reads them with `readTemplateFile`. See `proposal.md` for the reason.

Constraints:

- The prompt that the agent receives MUST stay the same, character for character. The tests `prompt.test.ts`, `scope.test.ts`, `characterization.test.ts`, and the golden file check this.
- `fillTemplate` fills a template in one pass and never reads a value again. This matters here, because a diff can hold the text `${title}`.
- `src/core/review` MUST NOT depend on `src/core/publish`.
- The package ships only `dist`. `scripts/copy-templates.mjs` names each template file.

## Goals / Non-Goals

**Goals:**

- Keep the text of both prompts in two built-in template files.
- Use one fill function and one file reader for `review` and `publish`.

**Non-Goals:**

- No way for a person to replace the prompt templates. No flag, no setting, no directory.
- No change to `SYSTEM_PROMPT`, the focus paragraphs, the deduplication prompt, or the verifier prompt.
- No change to the text that the agent receives.

## Decisions

### Decision 1: A shared module `src/core/template.ts`

The module holds `fillTemplate`, `readTemplateFile`, `TemplateError`, and the path of the built-in directory (`src/template`, or `dist/template` in the package). `src/core/publish/template.ts` imports them and keeps its own rules: the list of comment files, the main placeholder, and `loadTemplates`. The file `publish/template.ts` re-exports `TemplateError`, so the importers of the error do not change. The tests of `fillTemplate` move to the new module.

Alternative: `review` imports from `publish`. Rejected, because `review` would then depend on `publish`.

### Decision 2: Two template files that hold the whole text

`BATCH_PROMPT.md` holds the prompt of a batch run. `WHOLE_PROMPT.md` holds the prompt of a run over the whole change. Each file writes its own opening with `${title}` and `${description}`.

The code keeps the data rules, not the wording:

- `${description}` is the trimmed description, or `(no description provided)` when it is empty.
- `${files}` is the formatted diffs, or `(no changed files)` when the list is empty.
- `${list}` and `${diffs}` are the formatted text of the file list and of the batch diffs.
- `${index}` and `${count}` are the numbers of the part.

Alternative: the code gives a `${header}` that both files share. Rejected. The wording of the opening would stay in code and the template would not show it.

### Decision 3: The template text matches the old output

`readTemplateFile` changes CRLF to LF and removes the line breaks at the end. The old code joined its lines with `\n` and had no line break at the end. The two forms are the same text, so the output stays the same. The existing file `REVIEW_PROMPT.md` uses `${context.title}`, which `fillTemplate` does not accept, and it has no description. The task list corrects both when it renames the file to `BATCH_PROMPT.md`.

### Decision 4: Read the templates once, and check them at the start of a review

`prompt.ts` reads the two files on the first use and keeps the text. `AgentReviewEngine.review()` asks for the templates before it starts a run. A missing or unreadable file then fails the review with a clear `TemplateError` before any model call. It does not count as a failed try of a run, and no retry happens.

There is no fallback text in code. A missing built-in file is a defect of the package, as for the comment templates.

### Decision 5: Check the placeholders in tests, not at run time

The built-in files are not under the control of the user, so a run-time check adds no value. A unit test checks that each file holds all of its placeholders and no other. The tests also check that a value with the text `${title}` stays as it is.

## Risks / Trade-offs

- [The wording changes by mistake] → The golden file and the prompt tests stay unchanged and must pass without an edit.
- [`dist` lacks the new files] → Add both names to `scripts/copy-templates.mjs`. A task runs the build and lists `dist/template`.
- [A person edits a built-in file and breaks a placeholder] → The unit test for the placeholders fails.
- [The opening text exists in two files] → Accepted. A change of the opening needs two edits.

## Pending local documentation updates

`openspec-sync-specs` MUST refresh these folder guides from the code. It asks the user for approval before each write.

- `src/core/review/SPEC.md`: `prompt.ts` reads the templates. Capability `ai-diff-review`.
- `src/core/publish/SPEC.md`: `template.ts` uses the shared module. Capability `review-output`.
- `src/template/SPEC.md`: the purpose and the list of files. Capability `ai-diff-review`.
