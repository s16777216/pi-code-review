## Context

See `proposal.md` for the reason. These facts of the current code shape the design:

- `src/core/template.ts` has `BUILTIN_DIR` and `readTemplateFile(dir, file)`. The reader decodes UTF-8, changes CRLF to LF, and removes the new lines at the end. It returns `undefined` for a missing file.
- `readPromptTemplates` in `prompt.ts` reads the two user prompts once, and it throws `TemplateError` that names a missing file. `AgentReviewEngine.review()` calls it before the first run.
- `scripts/copy-templates.mjs` names each file on purpose, because the package ships only `dist`.
- The 9 texts are static: they have no placeholder. Each focus paragraph is its own text and a sentence that all three share (`NOT_A_LIMIT`), joined with one space. `SYSTEM_PROMPT` and the focus paragraphs are joined in `buildSystemPrompt` with other text.
- Tests import `JUDGE_SYSTEM_PROMPT`, `VERIFY_SYSTEM_PROMPT`, `VERIFY_AGENT_SYSTEM_PROMPT`, `SYSTEM_PROMPT`, and `REVIEW_FOCUSES`. The golden file records the length and the text of the prompts.
- Prettier checks `.md` files and can change text, for example the escape of a character or the marker of a list.

## Goals / Non-Goals

**Goals:**
- Keep the 9 prompt texts in plain files that a person can edit and review.
- Keep the text that each agent receives the same, byte for byte.
- Use the existing reader, the existing error for a missing file, and the existing copy step.

**Non-Goals:**
- Change a prompt text.
- Move the four statements before the review instructions, the sentence for the language, or the user prompts of the verifier, the judge, and the verify agent.
- Let a person replace a system prompt. The review instructions stay the one way to adjust a review.

## Decisions

### Decision 1: A folder `src/template/system/` with one file for each prompt

The files are `REVIEW.md`, `FOCUS_LOGIC.md`, `FOCUS_SECURITY.md`, `FOCUS_RESOURCES.md`, `FOCUS_COMMON.md`, `DEDUP.md`, `VERIFY.md`, `JUDGE.md`, and `VERIFY_AGENT.md`. The folder keeps the 9 files apart from the 4 comment and user prompt templates. `readTemplateFile` takes a folder and a file name, so it needs no change.

Alternative: put the 9 files in `src/template/`. That folder then has 13 files of 3 kinds. The folder `system/` shows the kind.

### Decision 2: One function reads all 9 texts once

A function `systemPrompts()` in `prompt.ts` reads the 9 files once and caches them, like `promptTemplates()`. `AgentReviewEngine.review()` calls it before the first run. A missing file throws `TemplateError` that names the file, so the review fails before a model call.

The constants `SYSTEM_PROMPT`, `DEDUP_SYSTEM_PROMPT`, `VERIFY_SYSTEM_PROMPT`, `JUDGE_SYSTEM_PROMPT`, and `VERIFY_AGENT_SYSTEM_PROMPT` are removed. The functions that build the system prompt (`buildSystemPrompt`, `buildJudgeSystemPrompt`, and the like) call `systemPrompts()`.

Alternative: read the files when the module loads. A missing file then fails at the import, with an error that has no review context, and a test cannot make a folder with a missing file.

### Decision 3: The review focuses read their paragraph on demand

`REVIEW_FOCUSES` stays a constant array with a name for each focus. The field `paragraph` becomes a getter that returns the text of the focus from `systemPrompts()`, one space, and the shared sentence from `FOCUS_COMMON.md`. This keeps the sentence in one place. Code and tests that use `focus.paragraph` do not change.

### Decision 4: Prove that the text is the same

- Before the removal of a constant, a temporary script writes each file from the constant and compares the text of the file, after the reader, with the constant. The result MUST be equal for all 9.
- The golden file records the prompts and MUST NOT change.
- The prompt tests in `judge.test.ts`, `verify.test.ts`, `verifyAgent.test.ts`, and the other tests MUST pass with no change of the expected text.

### Decision 5: Prettier does not touch the folder

`.prettierignore` gets `src/template/system/`. The prompt text must not change by a formatter. The text of a prompt is not code style.

## Risks / Trade-offs

- A character of a prompt changes by mistake → The comparison in Decision 4 and the golden file find it.
- A file is missing from the package → `copy-templates.mjs` names each file. A test reads the folder `dist/template/system` after the build and checks the 9 files.
- A person edits a prompt and forgets that tests match its text → The tests of a prompt stay in the same place and fail with a clear message.

## Migration Plan

No data migration. To roll back, revert the commit.

Local `SPEC.md` files to refresh with `openspec-sync-specs`: `src/template/SPEC.md` (the folder `system/` and its 9 files, and the count of the files that the build copies) and `src/core/review/SPEC.md` (the prompts come from `src/template/system/`). Ask the user to approve each file first.

## Open Questions

- Whether the four statements before the review instructions should move too. They are short, they have one line each, and they are not hard to edit. This change leaves them in code.
