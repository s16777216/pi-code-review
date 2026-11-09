## Why

The `publish` command writes the text of its comments in code. A team cannot change the wording, the language of the fixed words, or the way a severity looks. A team that reviews in another language gets English words such as `Resolved:` next to its own summaries.

## What Changes

- Add a template directory for `publish`, set by the `--template-dir` flag or the `PUBLISH_TEMPLATE_DIR` environment variable.
- Read two optional plain-text files from that directory: `finding.md` for one finding, and `resolved.md` for the reply that explains a resolved discussion.
- Fill a template with placeholders in the `${name}` form, as in a Docker Compose file: `${severity}`, `${summary}`, `${file}`, and `${line}` for a finding, and `${reason}` for a resolved reply. The text `\${` stands for a literal `${`. All other text, including any other `${name}`, stays as it is. The templates do not read environment variables.
- Use the built-in text for a template file that is not in the directory. The built-in text gives the same comments as today.
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

- `review-output`: The text of a finding comment and of a resolved reply comes from an optional template. The marker and the merge rule stay fixed.
- `review-cli`: The `publish` command accepts the template directory. The `review` command does not. A template that is not valid stops `publish` before a host API call.

## Impact

- `src/cli/index.ts`: a new `publish` flag, and the load of the templates before `host.restore`.
- `src/config.ts`: the template directory setting for `publish`.
- `src/core/publish`: a new module that loads, checks, and fills templates. `publisher.ts` uses it in place of the fixed text in `formatDiscussionBody` and `resolveDiscussion`.
- Local `SPEC.md` files of `src/core/publish` and `src/cli`.
- No new dependency. No change to the findings file, to the `DiscussionGateway` port, or to a host provider.
