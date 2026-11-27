# Customization

You can change what `review` looks for with [review instructions](#review-instructions), and the text of what `publish` posts with [comment templates](#comment-templates). You can send a trace of each run to an OpenTelemetry endpoint with [tracing](#tracing).

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

| File          | Text                                                                              | Placeholders                                                          |
| ------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `FINDING.md`  | One finding. It must contain `${summary}`.                                        | `${severity}`, `${confidence}`, `${summary}`, `${file}`, `${line}` |
| `RESOLVED.md` | The reply that explains a discussion declared fixed. It must contain `${reason}`. | `${reason}`                                                           |

`${confidence}` is `high`, `medium`, or `low`: how sure the review is that the problem is real. It comes from the number of review focuses that found the problem and from the verdict of the verifier. It does not change the severity or the pass or fail result. A finding from a findings file that an older `review` wrote has no confidence, and the placeholder gives `unknown`.

The file names use upper case. A case-sensitive file system, such as the one on Linux, finds only these names.

The package ships a default for each file (`src/template/FINDING.md` and `src/template/RESOLVED.md`). A file with the same name in your directory replaces the default. A file that is not in your directory keeps the default. The default `FINDING.md` is:

```text
**Severity**: ${severity}
  
**Confidence**: ${confidence}
  
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

## Tracing

`review` and `publish` can send one trace for each run with OTLP over HTTP. Tracing is off until you set an endpoint. The commands send traces only, no logs and no metrics.

| Variable | Meaning |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | The base URL of the receiver, for example `http://collector:4318`. The traces go to `/v1/traces` under it. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | The full URL for traces. Use it in place of the base URL. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Headers for the receiver, for example `authorization=Bearer abc`. |
| `OTEL_EXPORTER_OTLP_TIMEOUT` | The time limit of one export, in milliseconds. Without it, the limit is 5000. |
| `OTEL_SDK_DISABLED` | `true` turns tracing off, also when an endpoint is set. |

Each trace has the resource attributes `service.name` (`pi-code-review`) and `service.version`.

### What a trace holds

- `picr.review`: the root span of `review`, with the source, the head commit, the model, the language, and the counts of the result. Under it:
  - `picr.step.read_change`, `picr.step.review_agents`, `picr.step.deduplication`, `picr.step.verification`, `picr.step.discussion_judgment`, `picr.step.verify_agent`. A step that makes no model call has no span. A step that changes the findings has `picr.findings.before` and `picr.findings.after`.
  - `picr.agent_run` under its step: the kind, the review focus or the file, the batch, the try number, the system prompt, the user prompt, and one `picr.response` event for each model response.
  - `picr.model_request` under its agent run: the provider, the model, `usage.input`, `usage.output`, `usage.cache_read`, `usage.cache_write`, `cost.total`, and `stop`.
  - `picr.tool_call` under its agent run: the tool name, the path of `get_file_content`, and the result.
  - `picr.host_request`: one span for each request to GitLab, with the method, the URL path, and the status.
  - A `picr.finding.dropped` event for each finding that a check drops, with the file, the line, the end line, and the reason.
  - A `picr.log` event on the root span for each `info` and `warn` log line.
- `picr.publish`: the root span of `publish`, with one span for each created, replied, resolved, or reopened discussion and for the status comment. It links to the trace of `review` through `trace.traceparent` in the findings file.

### Limits

- Each prompt, response, and tool result is cut at 100,000 characters. A cut text has `<name>.truncated` and `<name>.length`.
- The trace never holds the GitLab token, the OpenAI API key, or a request header. The tool replaces these known values with `[REDACTED]` in every text. Other secrets in the reviewed code, for example a password in a changed file, are sent as they are.
- A failed or slow export never changes the exit code, the findings file, or the comments. The command waits at most 5 seconds at its end, and writes one `warn` line when the export failed.
