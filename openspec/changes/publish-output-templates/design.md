## Context

`publisher.ts` builds the text of a comment in two places: `formatDiscussionBody` for findings, and `resolveDiscussion` for the reply to a resolved discussion. Both put the hidden marker first. A later run finds its own comments by that marker (`marker.ts`, `discussion.ts`), so the marker is part of the behavior, not of the wording. See `proposal.md` for the motivation.

`runPublishCommand` reads the settings and the findings file, then calls `host.restore`. `host.restore` is the first step that touches the host. The `DiscussionGateway` port carries only finished text, so the host providers need no change.

## Goals / Non-Goals

**Goals:**
- Let a team change the wording of a finding comment and of a resolved reply, with no new dependency.
- Find a wrong template before the first host API call.
- Ship the default text as files that a person can read and copy.

**Non-Goals:**
- Templates for the comment on files too large to review. A later change can add `UNREVIEWED.md` to the same directory.
- The review prompt. The file `src/template/REVIEW_PROMPT.md` belongs to a later change. The build does not copy it, and no code reads it.
- Loops, conditions, or helpers in a template.
- A way to change the marker or the way the program joins findings.
- Templates for the `review` command or for its prompt. A separate change adds extra review instructions.

## Decisions

### Decision 1: One directory with one file per text

`--template-dir` (or `PUBLISH_TEMPLATE_DIR`) names a directory. The program looks for `FINDING.md` and `RESOLVED.md` in it. A missing file means the built-in file with the same name. The names use upper case, to match the files in `src/template`. A case-sensitive file system, such as the one on Linux, finds only these names.

Alternatives:
- One flag per template. This adds flags for every new text, and mixes inline strings with paths.
- One JSON file with one field per text. A person must escape line breaks and quotes, which is poor for multi-line text.

A directory keeps each text in a plain file that a person edits as it is, and a new template adds only a file name. The flag wins over the variable, as for every other setting (`settings.ts`). An empty value is a `ConfigError`. The flag belongs to `publish` only, so `review` rejects it as an unknown flag, and the host flag lists stay unchanged.

### Decision 2: Placeholder `${name}` for known names only, `\${` as the escape

The syntax is the braced form of variable interpolation in a Docker Compose file. A template is one pass over the text. The program replaces each `${name}` whose name is on the list for that file, and replaces `\${` with a literal `${`. The program does not look at a value again after it replaces it, so a summary that contains `${severity}` stays as it is.

The allowed names are fixed per file:
- `FINDING.md`: `severity`, `summary`, `file`, `line`.
- `RESOLVED.md`: `reason`.

All other text is plain text, and the program does not change it. This includes `{`, `}`, a lone `$`, `$name`, any other `${name}`, and a backslash that is not followed by `${`. A review comment often holds a price, a JSON sample, a regular expression, or a shell example such as `${HOME}`, so a template can hold them with no escape. The one case that needs an escape is a literal `${summary}`, for example in a note about the template itself.

`anchor` and `relatesTo` are internal values, so a template cannot use them. A name is never looked up in the process environment, so a template cannot print a secret. A later change can add a fixed list of environment names if a team needs a link to a pipeline. If a later change adds a new name, a template that holds that name as plain text changes its output. The change that adds a name must handle this.

A backslash before a placeholder cannot be written, because `\${` is always the escape. A person who needs it can put the backslash in a separate part of the text. This case is rare, so the design accepts it.

Alternatives:
- `$$` as the escape, with Docker Compose rules that reject `$name` and a lone `$`. A person who does not know Docker Compose does not expect `$$`, and the rules force escapes for text such as `$HOME` that is common in review comments.
- `{name}` with `{{` and `}}` as the escapes. Braces are common in review comments, so this form needs escapes in many places.
- A template engine such as Mustache. It adds a dependency and a second language to learn, and a team needs neither for these two texts.
- The full Docker Compose syntax, with defaults and environment lookup. It gives no value here and opens the secret risk.

### Decision 3: Check the templates before the first host call

The program loads and checks both templates after it reads the settings and before `host.restore`. The check stops `publish` in these cases only: the directory does not exist, a file cannot be read as UTF-8, `FINDING.md` has no `${summary}`, or `RESOLVED.md` has no `${reason}`. An escaped `\${summary}` does not count as the main field. The error names the file and the cause. The command exits with code 2, as for any error that stops `publish`.

The program checks the built-in files with the same rules. A built-in file that is missing or not valid is a defect of the package, not of the user. The program stops with an error that names the file, and does not use other text.

The main field is required, because a comment without it loses the content of the finding. This check also catches the worst typo, a misspelled `${summary}`.

An unknown `${name}` does not stop `publish`, because it can be a valid example in the text. The program writes one `warn` log line for it, with the file and the text, so a typo such as `${severty}` is easy to find. A person silences the line for a real example by writing `\${name}`.

Alternatives:
- Stop on an unknown name. This blocks a template that holds a shell example, unless the person escapes it.
- Write no log line. A typo then goes to a live merge request with no trace.

### Decision 4: The program writes the marker and the join

`Publisher` keeps `formatDiscussionBody` as the owner of the comment shape: the marker line, then the paragraphs joined by one blank line. A template only gives the text of one paragraph. The resolved reply is the marker line, then the text of the resolved template. A marker inside a template body is plain text and has no effect, because detection reads only the start of a comment (`hasMarker`, `ANCHOR_IN_MARKER`).

The built-in templates are the files `src/template/FINDING.md` and `src/template/RESOLVED.md`. A test pins the default output to the text of those files.

The program converts CRLF line breaks to LF when it reads a template file. A checkout with CRLF line breaks, such as a Windows checkout, then gives the same comment text as a checkout with LF line breaks.

### Decision 5: Module and wiring

A new module `src/core/publish/template.ts` owns the load, the check, and the fill. It exports a `CommentTemplates` value with the two templates, and a `loadTemplates(dir | undefined)` function. The function loads the built-in files first. The files in `dir` then replace the built-in files with the same name. The constant `DEFAULT_TEMPLATES` is removed. `PublisherOptions` keeps an optional `templates` field, and the default is the built-in files, loaded once, so existing `Publisher` callers and tests keep working. `src/config.ts` gets the `templateDir` setting in `PublishConfig`. `runPublishCommand` calls `loadTemplates` and passes the result through `runPublish`.

Capability to module map:
- `review-output`: `src/core/publish` and `src/template` (`SPEC.md` to refresh).
- `review-cli`: `src/cli` and `src/config.ts` (`src/cli/SPEC.md` to refresh).

### Decision 6: Ship the built-in files with the build

The files stay in `src/template`. The `build` script runs a copy step after `tsc`. The step copies only `FINDING.md` and `RESOLVED.md` to `dist/template`, so it does not copy `REVIEW_PROMPT.md`. The program reads the files from `../../template`, relative to `template.ts`. This path gives `src/template` in development with `tsx`, and `dist/template` in the package. The `files` field of `package.json` already includes `dist`.

Alternatives:
- Write the text as strings in TypeScript. This has no packaging step, but the `.md` files become a copy that can drift from the code.
- Use a bundler or text imports. This adds tooling for two files.

## Risks / Trade-offs

- [A team writes a template that hides the severity] → The program allows it, because wording is the team's choice. The pass or fail decision does not read comment text, so exit codes are not affected.
- [A misspelled placeholder other than the main field, such as `${severty}`, goes to a live merge request as plain text] → The program writes a `warn` log line for it. The main field is checked, so a comment never loses the content of the finding.
- [A template changes how a future run reads old comments] → Detection and anchors use only the marker line, and the program always writes it. The review agent reads the text after the marker, so a new wording changes what the agent sees. This is accepted.
- [The directory is read on every `publish` run] → The cost is two small file reads, with no cache needed.
- [Existing teams see new default comment text] → The README and the release notes describe the change. A team restores the old text with two template files.
- [A built-in file is missing from the package] → The program stops with an error that names the file. A build check lists both files in `dist/template` and in the output of `npm pack`.

## Pending sync notes

Done by the first `openspec-sync-specs` run:

- `src/core/publish/SPEC.md` (capability `review-output`): updated, because `template.ts` is a new file in that directory.
- `src/cli/SPEC.md` (capability `review-cli`): no update. This change added, removed, and renamed no file there, so the folder guide is still current.

Open after tasks 5.1 to 5.7:

- `src/core/publish/SPEC.md` (capability `review-output`): refresh the template file names and the built-in files.
- `src/template` (capability `review-output`): a new directory with the two built-in files. Ask the user whether it needs a `SPEC.md`.
