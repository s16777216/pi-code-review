## 1. Template module

- [ ] 1.1 Add `src/core/publish/template.ts` with the fill function for known `${name}` and the `\${` escape; verify unit tests cover each placeholder, the escape, a backslash elsewhere, plain braces and `$`, `$HOME`, `${HOME}`, and a value that contains `${severity}`
- [ ] 1.2 Add the check for a template in the same module; verify unit tests cover a missing `${summary}` or `${reason}`, an escaped main field, and one `warn` log line for an unknown `${name}` (and none for `\${name}`), and that each error names the file and the cause
- [ ] 1.3 Add `loadTemplates(dir)` that reads `finding.md` and `resolved.md`, removes the line breaks at the end, and uses the built-in text for a missing file; verify tests with a temporary directory cover a missing directory, a missing file, an unreadable file, and valid files

## 2. Publisher

- [ ] 2.1 Add an optional `templates` field to `PublisherOptions` with the built-in templates as the default; verify the existing `publisher.test.ts` tests pass without change
- [ ] 2.2 Use the finding template in `formatDiscussionBody` and keep the marker line and the blank-line join in the program; verify tests for one finding, merged findings, and a marker text inside a template
- [ ] 2.3 Use the resolved template in `resolveDiscussion`; verify tests for the default reply and a custom reply

## 3. CLI and config

- [ ] 3.1 Add `templateDir` to `PublishConfig` and `PublishConfigOverrides` in `src/config.ts`, with `PUBLISH_TEMPLATE_DIR` as the fallback and an empty value as a `ConfigError`; verify `config.test.ts` covers flag, variable, flag-wins, and empty
- [ ] 3.2 Add the `--template-dir` flag to `parsePublishCliOptions` only; verify `index.test.ts` shows that `review` rejects the flag and `publish` accepts it
- [ ] 3.3 In `runPublishCommand`, call `loadTemplates` before `host.restore` and pass the templates to `Publisher`; verify a CLI test shows that an invalid template exits with code 2 and makes no host call

## 4. Documentation and final checks

- [ ] 4.1 Add a short section to `README.md` that lists the two files, the `${name}` placeholders, the `\${` escape, the `warn` line for an unknown name, and an example in another language; verify the placeholders in the README match the spec
- [ ] 4.2 Run `npm run build`, `npm test`, `npm run lint`, and `npm run format:check`; verify all four commands pass
