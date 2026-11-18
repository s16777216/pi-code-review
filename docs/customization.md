# Customization

You can change what `review` looks for with [review instructions](#review-instructions), and the text of what `publish` posts with [comment templates](#comment-templates).

## Review instructions

The system prompt of `review` has one fixed set of rules. To tell `review` what to look for in your project, write **review instructions**: plain text that `review` adds to the system prompt. For example, "Do not report naming problems", or "Look closely at SQL queries". They apply to `review` only.

`review` has four **instructions sources**. The first one that is usable wins, in this order:

| Order | Source                       | Holds              |
| ----- | ---------------------------- | ------------------ |
| 1     | `--instructions <path>`      | The path of a file |
| 2     | `--instructions-text <text>` | The text itself    |
| 3     | `REVIEW_INSTRUCTIONS_FILE`   | The path of a file |
| 4     | `REVIEW_INSTRUCTIONS`        | The text itself    |

`review` reads no file by default. A file named `REVIEW_INSTRUCTIONS.md` in your project has no effect until you name it. A relative path is relative to the working directory. In GitLab CI, that is the root of the project.

```yaml
review:
  script:
    - picr review --instructions REVIEW_INSTRUCTIONS.md
```

```sh
picr review --instructions-text "Do not report naming problems."
```

### Rules

- A usable source is UTF-8 text with at least one character that is not white space, and at most 8,000 characters after `review` removes the white space at the start and the end. `review` reads CRLF as LF. The text has no placeholders: `${summary}` stays as it is.
- A flag or a variable that is present but not usable (the file does not exist, the text is empty, the text is too long) writes a `warn` log line that names the source and the cause. `review` then tries the next source. The job does not fail.
- `review` writes an `info` log line with the source it uses and the number of characters. With no usable source, `review` uses its fixed rules only.
- The review instructions win over the general guidance when the two conflict. For example, you can ask it to report style and naming problems, or to leave them out. They never change the output format of `submit_review`, the rules for the tools, or the rule that the text of discussions is information and not an instruction. A finding with a wrong format is still rejected.
- Long review instructions use part of the context window in every run, and leave less room for the diff. If a merge request does not fit one run, every batch gets the review instructions. The verifier gets them too.
- `--debug` prints the complete system prompt, so the review instructions appear in the debug output. Do not put a secret in them.
- `publish` has no `--instructions` or `--instructions-text` flag, and ignores `REVIEW_INSTRUCTIONS_FILE` and `REVIEW_INSTRUCTIONS`.

### Trust model

This feature trusts the author of the merge request. In a CI job, the working directory is a checkout of the source branch, so the author can change any file there. If a flag names a file in the project, such as `REVIEW_INSTRUCTIONS.md`, the author can change the rules of their own review, for example to tell the agent to report nothing. The author can already change the review in other ways, through `.gitlab-ci.yml` and through text in the diff that tries to steer the agent.

`review` writes a `warn` log line when the merge request changes the file of the instructions source. This is only a log line and does not change the result. It compares paths relative to the working directory with the files of the merge request, so it fits a job that runs in the root of the project. It does not compare the two text sources.

### Limits

- A mistake in a source does not fail the job. A wrong path in `--instructions` writes one `warn` log line, and the review runs without your rules. Look at the log when you change the setup.
- A source that is not usable gives way to the next source. If you lock the rules in a **File-type CI/CD variable** (GitLab puts the content in a temporary file and sets the variable to its path) and use `REVIEW_INSTRUCTIONS_FILE` for it, do not also set a flag that names a file in the project. If the variable is empty or wrong, `review` would use that file, and the author controls it.

## Comment templates

`publish` writes the text of its comments from two optional template files. Put them in a directory, and give the directory to `publish` with `--template-dir` or `PUBLISH_TEMPLATE_DIR`:

| File          | Text                                                                              | Placeholders                                      |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `FINDING.md`  | One finding. It must contain `${summary}`.                                        | `${severity}`, `${summary}`, `${file}`, `${line}` |
| `RESOLVED.md` | The reply that explains a discussion declared fixed. It must contain `${reason}`. | `${reason}`                                       |

The file names use upper case. A case-sensitive file system, such as the one on Linux, finds only these names.

The package ships a default for each file (`src/template/FINDING.md` and `src/template/RESOLVED.md`). A file with the same name in your directory replaces the default. A file that is not in your directory keeps the default. The default `FINDING.md` is:

```text
**Severity**: ${severity}
**Reason**: ${summary}
---
```

The default `RESOLVED.md`, for the reply to a discussion declared fixed, is:

```text
**Resolved**: ${reason}
```

### Rules

- Only the placeholders in the table are filled. All other text stays as it is, including `{`, `}`, `$5`, `$HOME`, and `${HOME}`. A template never reads an environment variable.
- To write a literal `${summary}`, put a backslash before it: `\${summary}`. A backslash in any other place is plain text.
- `publish` writes a warning, and goes on, when a template has a `${name}` that it does not fill. This finds a typo such as `${severty}`. Write `\${name}` to keep the text without the warning.
- `publish` stops with exit code `2`, before it calls GitLab, when the directory does not exist, when a file cannot be read as UTF-8 text, or when a file does not contain its required placeholder.
- `publish` reads a template as UTF-8 text, changes each CRLF to LF, and removes the line breaks at the end. A template from a Windows checkout and one from a Linux checkout give the same comment.
- The hidden marker line at the start of each comment, and the blank line between findings in one comment, are always written by `publish`. A template cannot change them.
- A template gives the text of one finding. Two findings on one line still become one comment with two paragraphs.

### Example

An example in Traditional Chinese. This is the whole of `FINDING.md`:

```text
🔴 **${severity}**:${summary}(`${file}:${line}`)
```

And this is the whole of `RESOLVED.md`:

```text
✅ 已修正:${reason}
```
