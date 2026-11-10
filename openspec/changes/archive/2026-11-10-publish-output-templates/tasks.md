## 1. Template module

- [x] 1.1 Add `src/core/publish/template.ts` with the fill function for known `${name}` and the `\${` escape; verify unit tests cover each placeholder, the escape, a backslash elsewhere, plain braces and `$`, `$HOME`, `${HOME}`, and a value that contains `${severity}`
- [x] 1.2 Add the check for a template in the same module; verify unit tests cover a missing `${summary}` or `${reason}`, an escaped main field, and one `warn` log line for an unknown `${name}` (and none for `\${name}`), and that each error names the file and the cause
- [x] 1.3 Add `loadTemplates(dir)` that reads `finding.md` and `resolved.md`, removes the line breaks at the end, and uses the built-in text for a missing file; verify tests with a temporary directory cover a missing directory, a missing file, an unreadable file, and valid files

## 2. Publisher

- [x] 2.1 Add an optional `templates` field to `PublisherOptions` with the built-in templates as the default; verify the existing `publisher.test.ts` tests pass without change
- [x] 2.2 Use the finding template in `formatDiscussionBody` and keep the marker line and the blank-line join in the program; verify tests for one finding, merged findings, and a marker text inside a template
- [x] 2.3 Use the resolved template in `resolveDiscussion`; verify tests for the default reply and a custom reply

## 3. CLI and config

- [x] 3.1 Add `templateDir` to `PublishConfig` and `PublishConfigOverrides` in `src/config.ts`, with `PUBLISH_TEMPLATE_DIR` as the fallback and an empty value as a `ConfigError`; verify `config.test.ts` covers flag, variable, flag-wins, and empty
- [x] 3.2 Add the `--template-dir` flag to `parsePublishCliOptions` only; verify `index.test.ts` shows that `review` rejects the flag and `publish` accepts it
- [x] 3.3 In `runPublishCommand`, call `loadTemplates` before `host.restore` and pass the templates to `Publisher`; verify a CLI test shows that an invalid template exits with code 2 and makes no host call

## 4. Documentation and final checks

- [x] 4.1 Add a short section to `README.md` that lists the two files, the `${name}` placeholders, the `\${` escape, the `warn` line for an unknown name, and an example in another language; verify the placeholders in the README match the spec
- [x] 4.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all four commands pass

## 5. Built-in templates as files

- [x] 5.1 Rename the files that the program reads to `FINDING.md` and `RESOLVED.md` in `template.ts`, its tests, `index.entrypoint.test.ts`, and `README.md`; verify `grep -rn "finding\.md\|resolved\.md" src README.md` finds no lower-case name
- [x] 5.2 Convert CRLF to LF when the program reads a template file; verify a unit test with a CRLF file gives text with LF only
- [x] 5.3 Add the build copy step (`scripts/copy-templates.mjs` and the `build` script) that copies only `FINDING.md` and `RESOLVED.md` to `dist/template`; verify `npm run build` creates both files and no `REVIEW_PROMPT.md`, and `npm pack --dry-run` lists both files
- [x] 5.4 Replace `DEFAULT_TEMPLATES` with the built-in files that `template.ts` loads from `../../template` and checks with the same rules; verify tests show the default text equals the file text, a file in the template directory replaces only the file with the same name, and a missing or not valid built-in file stops with an error that names it
- [x] 5.5 Update the tests that pin the old default text (`publisher.test.ts`, `index.test.ts`) to the new default text; verify `npm test` passes
- [x] 5.6 Update `README.md`: the new default text, the upper-case file names, the **BREAKING** note, and how to restore the old text; verify the README matches the spec
- [x] 5.7 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all pass for the changed files
