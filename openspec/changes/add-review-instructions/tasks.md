## 1. Instructions sources

- [ ] 1.1 Add `src/reviewInstructions.ts` with the function that reads one instructions source and checks it; verify unit tests with a temporary directory cover a valid file, a missing file, a file that is not UTF-8, white space only, 8,000 characters, 8,001 characters, and CRLF line breaks
- [ ] 1.2 Add the function that picks the first usable instructions source in the order of priority; verify unit tests cover the priority of the four sources, a flag or a variable with an empty string, no source, and no file read when no source is set even if `REVIEW_INSTRUCTIONS.md` exists
- [ ] 1.3 Write one `warn` log line for each source that is not usable and one `info` log line for the source in use; verify tests with a capturing logger show the source and the cause, the number of characters, and no line when no source is set
- [ ] 1.4 Add the function that compares the path of the file in use with the changed files; verify unit tests cover a changed file, an added file, an unchanged file, an old path, backslash separators, a file outside the working directory, and both text sources

## 2. Engine

- [ ] 2.1 Add an optional `instructions` argument to `buildSystemPrompt` and `AgentReviewEngineOptions`; verify tests show the order (general guidance, scope paragraph, statement and review instructions, language sentence) and that the text is not changed
- [ ] 2.2 Verify that a run with no review instructions gives the same system prompt as today; verify `characterization.test.ts` passes with the golden file unchanged
- [ ] 2.3 Pass the review instructions to every run and to the size estimate; verify tests show that each batch holds the text and that the estimate of the first request grows when the text is set
- [ ] 2.4 Verify that the checks on findings do not change; verify a test shows that a finding with the severity `blocker` is invalid when the review instructions ask for it

## 3. CLI

- [ ] 3.1 Add the `--instructions` and `--instructions-text` flags to `parseReviewCliOptions` only; verify `index.cli.test.ts` shows that `review` accepts both flags and `publish` rejects both
- [ ] 3.2 In `runReviewCommand`, pick the instructions source before `openChangeRequest`, and pass the result through `ReviewOptions` to the engine; verify a test with the faux provider shows the text in the system prompt, and the same prompt as today with no source even if `REVIEW_INSTRUCTIONS.md` exists
- [ ] 3.3 In `runReview`, write the `warn` log line after `changeRequest.load()` when a changed file matches the file in use; verify tests show one warning for a match, none for the text variable, and an unchanged review result
- [ ] 3.4 Verify that `publish` ignores the two variables; verify a test with values that are not usable shows that `publish` runs and writes no log line about them

## 4. Documentation and final checks

- [ ] 4.1 Add a section on review instructions to `README.md`: the four sources, the order, the 8,000-character limit, the warning for a changed file, the trust model, the two limits, the working directory, and `--debug`; verify the section uses the terms of the glossary and agrees with the specs
- [ ] 4.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all pass for the changed files
