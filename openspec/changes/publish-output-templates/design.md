## Context

`publisher.ts` builds the text of a comment in two places: `formatDiscussionBody` for findings, and `resolveDiscussion` for the reply to a resolved discussion. Both put the hidden marker first. A later run finds its own comments by that marker (`marker.ts`, `discussion.ts`), so the marker is part of the behavior, not of the wording. See `proposal.md` for the motivation.

`runPublishCommand` reads the settings and the findings file, then calls `host.restore`. `host.restore` is the first step that touches the host. The `DiscussionGateway` port carries only finished text, so the host providers need no change.

## Goals / Non-Goals

**Goals:**
- Let a team change the wording of a finding comment and of a resolved reply, with no new dependency.
- Find a wrong template before the first host API call.
- Keep the default comments the same as today.

**Non-Goals:**
- Templates for the comment on files too large to review. A later change can add `unreviewed.md` to the same directory.
- Loops, conditions, or helpers in a template.
- A way to change the marker or the way the program joins findings.
- Templates for the `review` command or for its prompt. A separate change adds extra review instructions.

## Decisions

### Decision 1: One directory with one file per text

`--template-dir` (or `PUBLISH_TEMPLATE_DIR`) names a directory. The program looks for `finding.md` and `resolved.md` in it. A missing file means the built-in template for that text.

Alternatives:
- One flag per template. This adds flags for every new text, and mixes inline strings with paths.
- One JSON file with one field per text. A person must escape line breaks and quotes, which is poor for multi-line text.

A directory keeps each text in a plain file that a person edits as it is, and a new template adds only a file name. The flag wins over the variable, as for every other setting (`settings.ts`). An empty value is a `ConfigError`. The flag belongs to `publish` only, so `review` rejects it as an unknown flag, and the host flag lists stay unchanged.

### Decision 2: Placeholder `${name}` for known names only, `\${` as the escape

The syntax is the braced form of variable interpolation in a Docker Compose file. A template is one pass over the text. The program replaces each `${name}` whose name is on the list for that file, and replaces `\${` with a literal `${`. The program does not look at a value again after it replaces it, so a summary that contains `${severity}` stays as it is.

The allowed names are fixed per file:
- `finding.md`: `severity`, `summary`, `file`, `line`.
- `resolved.md`: `reason`.

All other text is plain text, and the program does not change it. This includes `{`, `}`, a lone `$`, `$name`, any other `${name}`, and a backslash that is not followed by `${`. A review comment often holds a price, a JSON sample, a regular expression, or a shell example such as `${HOME}`, so a template can hold them with no escape. The one case that needs an escape is a literal `${summary}`, for example in a note about the template itself.

`anchor` and `relatesTo` are internal values, so a template cannot use them. A name is never looked up in the process environment, so a template cannot print a secret. A later change can add a fixed list of environment names if a team needs a link to a pipeline. If a later change adds a new name, a template that holds that name as plain text changes its output. The change that adds a name must handle this.

A backslash before a placeholder cannot be written, because `\${` is always the escape. A person who needs it can put the backslash in a separate part of the text. This case is rare, so the design accepts it.

Alternatives:
- `$$` as the escape, with Docker Compose rules that reject `$name` and a lone `$`. A person who does not know Docker Compose does not expect `$$`, and the rules force escapes for text such as `$HOME` that is common in review comments.
- `{name}` with `{{` and `}}` as the escapes. Braces are common in review comments, so this form needs escapes in many places.
- A template engine such as Mustache. It adds a dependency and a second language to learn, and a team needs neither for these two texts.
- The full Docker Compose syntax, with defaults and environment lookup. It gives no value here and opens the secret risk.

### Decision 3: Check the templates before the first host call

The program loads and checks both templates after it reads the settings and before `host.restore`. The check stops `publish` in these cases only: the directory does not exist, a file cannot be read as UTF-8, `finding.md` has no `${summary}`, or `resolved.md` has no `${reason}`. An escaped `\${summary}` does not count as the main field. The error names the file and the cause. The command exits with code 2, as for any error that stops `publish`.

The main field is required, because a comment without it loses the content of the finding. This check also catches the worst typo, a misspelled `${summary}`.

An unknown `${name}` does not stop `publish`, because it can be a valid example in the text. The program writes one `warn` log line for it, with the file and the text, so a typo such as `${severty}` is easy to find. A person silences the line for a real example by writing `\${name}`.

Alternatives:
- Stop on an unknown name. This blocks a template that holds a shell example, unless the person escapes it.
- Write no log line. A typo then goes to a live merge request with no trace.

### Decision 4: The program writes the marker and the join

`Publisher` keeps `formatDiscussionBody` as the owner of the comment shape: the marker line, then the paragraphs joined by one blank line. A template only gives the text of one paragraph. The resolved reply is the marker line, then the text of the resolved template. A marker inside a template body is plain text and has no effect, because detection reads only the start of a comment (`hasMarker`, `ANCHOR_IN_MARKER`).

The built-in templates are `**[${severity}]** ${summary}` and `Resolved: ${reason}`. A golden test keeps the default output the same as today.

### Decision 5: Module and wiring

A new module `src/core/publish/template.ts` owns the load, the check, and the fill. It exports a `CommentTemplates` value with the two compiled templates, and a `loadTemplates(dir | undefined)` function. `PublisherOptions` gets an optional `templates` field, and the default is the built-in templates, so existing `Publisher` callers and tests keep working. `src/config.ts` gets the `templateDir` setting in `PublishConfig`. `runPublishCommand` calls `loadTemplates` and passes the result through `runPublish`.

Capability to module map:
- `review-output`: `src/core/publish` (`SPEC.md` to refresh).
- `review-cli`: `src/cli` and `src/config.ts` (`src/cli/SPEC.md` to refresh).

## Risks / Trade-offs

- [A team writes a template that hides the severity] → The program allows it, because wording is the team's choice. The pass or fail decision does not read comment text, so exit codes are not affected.
- [A misspelled placeholder other than the main field, such as `${severty}`, goes to a live merge request as plain text] → The program writes a `warn` log line for it. The main field is checked, so a comment never loses the content of the finding.
- [A template changes how a future run reads old comments] → Detection and anchors use only the marker line, and the program always writes it. The review agent reads the text after the marker, so a new wording changes what the agent sees. This is accepted.
- [The directory is read on every `publish` run] → The cost is two small file reads, with no cache needed.
