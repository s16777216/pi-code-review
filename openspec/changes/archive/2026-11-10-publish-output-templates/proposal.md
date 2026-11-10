## Why

The `publish` command writes the text of its comments in code. A team cannot change the wording, the language of the fixed words, or the way a severity looks. A team that reviews in another language gets English words such as `Resolved:` next to its own summaries.

## What Changes

- Add a template directory for `publish`, set by the `--template-dir` flag or the `PUBLISH_TEMPLATE_DIR` environment variable.
- Read two optional plain-text files from that directory: `FINDING.md` for one finding, and `RESOLVED.md` for the reply that explains a resolved discussion. The names use upper case, because some file systems are case sensitive.
- Fill a template with placeholders in the `${name}` form, as in a Docker Compose file: `${severity}`, `${summary}`, `${file}`, and `${line}` for a finding, and `${reason}` for a resolved reply. The text `\${` stands for a literal `${`. All other text, including any other `${name}`, stays as it is. The templates do not read environment variables.
- Ship the built-in templates as the files `src/template/FINDING.md` and `src/template/RESOLVED.md`. The build copies them to `dist/template`. A file with the same name in the template directory replaces the built-in file.
- **BREAKING**: The default comment text changes, because the built-in files replace the fixed text in the code. A finding comment was `**[severity]** summary`. It is now `**Severity**: severity`, a blank line, and `**Reason**: summary`. A resolved reply was `Resolved: reason`. It is now `**Resolved**: reason`. A team can keep the old text with its own template files.
- The file `src/template/REVIEW_PROMPT.md` is not part of this change. The build does not copy it.
- Keep the hidden marker line fixed. The program writes it as the first line of each comment, and a template cannot change it.
- Keep the merge rule fixed. The program joins the findings of one comment with a blank line.
- Stop `publish` before any host API call when a template has no main field (`${summary}` or `${reason}`), or when a file or the directory cannot be read.
- Write a `warn` log line, and go on, when a template has an unknown `${name}`.
- Reject `--template-dir` on the `review` command.
- The comment on files too large to review is not part of this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-output`: The text of a finding comment and of a resolved reply comes from a template file. The package ships the default files, and the default text changes. The marker and the merge rule stay fixed.
- `review-cli`: The `publish` command accepts the template directory. The `review` command does not. A template that is not valid stops `publish` before a host API call.

## Impact

- `src/cli/index.ts`: a new `publish` flag, and the load of the templates before `host.restore`.
- `src/config.ts`: the template directory setting for `publish`.
- `src/core/publish`: a new module that loads, checks, and fills templates, and that also loads the built-in files. `publisher.ts` uses it in place of the fixed text in `formatDiscussionBody` and `resolveDiscussion`.
- `src/template`: the two built-in template files.
- `package.json` and a copy script: the build copies the two files to `dist/template`.
- Local `SPEC.md` files of `src/core/publish` and `src/cli`.
- No new dependency. No change to the findings file, to the `DiscussionGateway` port, or to a host provider.
