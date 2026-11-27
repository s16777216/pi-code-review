## Purpose

Sends a trace of each `review` and `publish` run with OTLP over HTTP, so a separate server can show what the run did: the steps, the agent runs, the model requests, the tool calls, the content, and the findings that the checks drop. Tracing is off until an endpoint is set, it never sends a secret, and it never changes a result.

## Requirements

### Requirement: Send traces only when an endpoint is set
The `review` and `publish` commands SHALL send one trace for each run with OTLP over HTTP when the environment variable `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. The commands MUST NOT send any trace data when neither variable is set, or when `OTEL_SDK_DISABLED` is `true`. The commands SHALL read the other standard OpenTelemetry exporter variables, for example `OTEL_EXPORTER_OTLP_HEADERS`. The commands MUST NOT send logs or metrics with OTLP.

#### Scenario: No endpoint is set
- **WHEN** a `review` run starts and neither OTLP endpoint variable is set
- **THEN** the run sends no data to any OTLP endpoint

#### Scenario: An endpoint is set
- **WHEN** a `review` run starts and `OTEL_EXPORTER_OTLP_ENDPOINT` is `http://collector:4318`
- **THEN** the run sends its trace to `http://collector:4318/v1/traces`

#### Scenario: The SDK is disabled
- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` is set and `OTEL_SDK_DISABLED` is `true`
- **THEN** the run sends no data to any OTLP endpoint

#### Scenario: Only traces are sent
- **WHEN** a run sends its data to an OTLP endpoint
- **THEN** the run sends requests only to the traces path, and no request to the logs path or the metrics path

### Requirement: Identify the tool in each trace
Each trace SHALL have the resource attribute `service.name` with the value `pi-code-review`, and `service.version` with the version of the package.

#### Scenario: A trace names the tool
- **WHEN** a run sends its trace
- **THEN** the resource of each span has `service.name` `pi-code-review` and the package version in `service.version`

### Requirement: Trace the parts of a review run
The trace of a `review` run SHALL have one root span for the run. The root span SHALL hold the host, the project, the merge request, the head commit, the model, and the review language when one is set. The trace SHALL have one child span for each step of the review: reading the change, the review agents, the deduplication step, the verification step, the discussion judgment step, and the verify agent step. A step that does not run MUST NOT have a span. Each agent run SHALL have its own span under its step, with its kind, its review focus or its file, its batch when it has one, and its try number.

#### Scenario: A review with every step
- **WHEN** a `review` run uses the deduplication step, the verification step, the discussion judgment step, and the verify agent step
- **THEN** the trace has one root span, one span for each of these steps, one span for reading the change, and one span for the review agents

#### Scenario: A step that does not run
- **WHEN** a `review` run has no file with two or more findings, so the deduplication step makes no model call
- **THEN** the trace has no span for the deduplication step

#### Scenario: Three review agents
- **WHEN** a `review` run reviews the whole change in one run scope
- **THEN** the span of the review agents has three agent run spans, one for each review focus, each with the name of its review focus

#### Scenario: An agent run is tried again
- **WHEN** the first try of an agent run fails and the second try succeeds
- **THEN** the trace has one agent run span for each try, with the try numbers 1 and 2, and the first span has the status `error`

### Requirement: Trace each model request
Each model request of an agent run SHALL have one span under the span of its agent run. The span SHALL hold the provider, the model, the input tokens, the output tokens, the cache tokens, the cost, the stop reason, and the duration of the request. A request that ends with an error SHALL have the status `error`.

#### Scenario: An agent run with two model requests
- **WHEN** an agent run makes two model requests, the first one with a tool call and the second one with the `submit_review` call
- **THEN** the span of the agent run has two model request spans, each with its token counts and its stop reason

### Requirement: Trace each tool call
Each tool call of an agent run SHALL have one span under the span of its agent run. The span SHALL hold the tool name, the file path for `get_file_content`, and whether the tool returned an error. A `submit_review` call or another submit call that the system rejects SHALL have the status `error` and the rejection message.

#### Scenario: The agent reads a file
- **WHEN** an agent run calls `get_file_content` for `src/a.ts`
- **THEN** the trace has a tool call span with the tool name `get_file_content` and the path `src/a.ts`

#### Scenario: A rejected submit call
- **WHEN** the system rejects a `submit_review` call because one finding is invalid
- **THEN** the tool call span has the status `error` and holds the rejection message

### Requirement: Record the content of agent runs
The trace SHALL hold the system prompt and the user prompt of each agent run, the text of each model response, and the result of each tool call. The system SHALL cut each text at 100,000 characters. When the system cuts a text, the trace SHALL record that the text was cut and its full length in characters.

#### Scenario: The prompts of an agent run
- **WHEN** a review agent run starts
- **THEN** its span holds the system prompt and the user prompt of the run

#### Scenario: A long tool result
- **WHEN** a `get_file_content` call returns a text of 150,000 characters
- **THEN** the tool call span holds the first 100,000 characters of the result, a mark that the text was cut, and the full length 150,000

### Requirement: Record the findings of each step
The span of each step that changes the findings SHALL hold the number of findings before the step and after the step. The trace SHALL have one event for each finding that a check drops. The event SHALL hold the file, the line, the end line when the finding has one, and the reason. The root span SHALL hold the number of findings, of fixed declarations, of unreviewed files, and of warnings in the result.

#### Scenario: A finding outside the diff
- **WHEN** the diff check drops a finding on line 99 of `src/a.ts` with the reason `line_not_in_diff`
- **THEN** the trace has an event with the file `src/a.ts`, the line 99, and the reason `line_not_in_diff`

#### Scenario: The verification step rejects a finding
- **WHEN** the verification step gets 4 findings and rejects 1 of them
- **THEN** the span of the verification step holds 4 findings before the step and 3 after the step

### Requirement: Record log lines in the trace
Each log line at the level `info` or `warn` that a run writes SHALL also become an event on the root span of that run. The event SHALL hold the message and the fields of the log line, after the logger removes the secrets.

#### Scenario: A warning of a run
- **WHEN** a `review` run writes the `warn` log line for a discarded finding
- **THEN** the root span of the run has an event with that message and its fields

### Requirement: Trace a publish run
The trace of a `publish` run SHALL have one root span for the run, with the host, the project, and the merge request of the findings file source. The trace SHALL have one span for each discussion that the run creates, replies to, resolves, or reopens, and for the status comment. The root span SHALL hold the number of findings, the number of posted discussions, and the pass or fail outcome.

#### Scenario: Publish creates two discussions
- **WHEN** a `publish` run creates two discussions and updates the status comment
- **THEN** the trace has one root span, two spans for the created discussions, and one span for the status comment

### Requirement: Trace the requests to the host
Each request to the host API SHALL have one span under the root span of its run. The span SHALL hold the HTTP method, the URL path, and the response status. The span MUST NOT hold a request header, a response header, or a request body.

#### Scenario: A GitLab request
- **WHEN** a run reads the diff of a merge request from the GitLab API
- **THEN** the trace has a span with the method `GET`, the URL path of the request, and the response status

### Requirement: Link the trace of publish to the trace of review
The `review` command SHALL write the trace context of its root span to the findings file when it sends a trace. The `publish` command SHALL add a link from its root span to that trace context. A findings file without a trace context, or with a trace context that is not valid, MUST be valid for `publish`, and the root span of `publish` then has no link.

#### Scenario: Publish reads a file with a trace context
- **WHEN** `publish` reads a findings file that `review` wrote while it sent a trace
- **THEN** the root span of `publish` has a link to the root span of that `review` run

#### Scenario: Publish reads an older findings file
- **WHEN** `publish` reads a findings file with no trace context
- **THEN** `publish` runs as before, and its root span has no link

### Requirement: Never send a secret in a trace
The trace MUST NOT hold the value of `GITLAB_TOKEN`/`--token`, `OPENAI_API_KEY`/`--openai-api-key`, or the `PRIVATE-TOKEN` request header. When one of these values is part of a text that the trace holds, the system SHALL replace the value with `[REDACTED]` before it sends the text.

#### Scenario: A prompt holds a secret
- **WHEN** the text of a changed file that the agent reads holds the value of the GitLab token
- **THEN** the tool call span holds `[REDACTED]` in place of that value

#### Scenario: A host request is traced
- **WHEN** a run sends the span of a GitLab request
- **THEN** no attribute or event of the trace holds the value of the GitLab token

### Requirement: The export never changes a result
A failure to send a trace MUST NOT change the exit code of a command, the findings file, or the comments that `publish` posts. When the export fails, the command SHALL write one `warn` log line for the run. At the end of a run, the command SHALL wait at most 5 seconds for the export to finish.

#### Scenario: The endpoint cannot be reached
- **WHEN** `OTEL_EXPORTER_OTLP_ENDPOINT` names a host that refuses connections, and a `review` run completes
- **THEN** the command writes the same findings file and exits with the same code as without an endpoint, and writes one `warn` log line about the export

#### Scenario: The endpoint does not answer
- **WHEN** the OTLP endpoint accepts the connection but does not answer
- **THEN** the command exits at most 5 seconds after the end of the run
