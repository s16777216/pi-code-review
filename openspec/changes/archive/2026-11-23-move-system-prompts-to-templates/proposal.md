## Why

The system prompts of the review are long text in TypeScript template literals, in six files: `engine.ts`, `focus.ts`, `dedup.ts`, `verify.ts`, `judge.ts`, and `verifyAgent.ts`. A prompt is prose, and a person edits it often. An edit of one sentence needs a script or a long single-line replace, and a quote or a backslash needs an escape. A change of a prompt is hard to read in a diff.

The user prompts of a review run are already in `src/template/` (`BATCH_PROMPT.md` and `WHOLE_PROMPT.md`, change `move-review-prompt-to-templates`). That change kept the system prompts in code on purpose, to keep the first change small. The shared reader, the copy step of the build, and the check for a missing file already exist.

## What Changes

- Move the text of 9 static system prompts from TypeScript to files in a new folder `src/template/system/`: the review prompt, the 3 review focus paragraphs and the sentence that they share, the deduplication prompt, the verifier prompt, the judge prompt, and the verify agent prompt.
- Read the files once through the existing reader, the same way as the user prompts. A missing file fails the review before the first model call, with an error that names the file.
- Copy the files in the build. Keep every other part of `src/template/` as it is.
- **No change of behavior.** The text that each agent receives stays the same, byte for byte.
- Out of scope: the four short statements before the review instructions, the sentence for the language, and the user prompts of the verifier, the judge, and the verify agent (they build JSON data in code). No way for a person to replace a system prompt.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none)

This change moves text and does not change a requirement. The file `.openspec.yaml` has `skip_specs: true`.

## Impact

- Code: `src/core/review/engine.ts`, `focus.ts`, `dedup.ts`, `verify.ts`, `judge.ts`, `verifyAgent.ts`, `prompt.ts` (the reader), and `scripts/copy-templates.mjs`.
- New files: 9 files in `src/template/system/`.
- Tests: the tests that import a prompt constant read the text from the reader. The golden file and the prompt tests do not change, and they prove that the text is the same.
- Docs: `src/template/SPEC.md` and `src/core/review/SPEC.md`.
- Config: `.prettierignore` gets the new folder, because Prettier can change the text of a prompt.
- Risk: a changed character in a prompt. A script compares each new file with the old constant before the constant is removed.
- Order: start the work after pull request 72 is merged. That pull request edits the judge and verify agent prompts.
