## Why

A person cannot see what one `review` run did. The log shows step counts, but not the time of each step, the tokens of each agent run, or the tool calls of an agent. In a recent test, a run gave no findings, and only a count of GitLab requests showed that the agents did not read the files. The plan is a separate server with a web UI that receives the data of each run. This change adds the CLI side: the CLI sends traces with OTLP.

## What Changes

- `review` and `publish` send one trace for each run with OTLP over HTTP, when an OTLP endpoint is set. Without an endpoint, the CLI sends nothing.
- The trace of `review` has a span for the run, for each step, for each agent run, for each model request, and for each tool call.
- A model request span holds the model, the token counts, the cost, the stop reason, and the duration. The `pi-ai` library makes this span.
- The trace holds the prompts, the responses, and the tool results. Each text is cut at 100,000 characters, and the span records that the text was cut.
- The trace holds the number of findings after each step, and one event for each finding that a check drops, with the reason.
- The log lines at `info` and `warn` level become events on the root span of the run.
- Each request to the host API has a span with its method, its URL path, and its status.
- The trace never holds a token, an API key, or a request header.
- `review` writes the trace context to the findings file. The trace of `publish` links to the trace of `review`.
- A failure to send the trace never changes the exit code or the findings file. The CLI writes one `warn` log line, and waits at most 5 seconds at the end of a run for the export.
- The CLI sends traces only. It does not send logs or metrics with OTLP.

## Capabilities

### New Capabilities

- `review-tracing`: the traces that `review` and `publish` send with OTLP: when they are sent, the spans and their attributes, the content and its limit, the secrets that are never sent, the link from `publish` to `review`, and the rule that the export never changes a result.

### Modified Capabilities

(none)

## Impact

- Code: `src/cli/` (start and end of the trace, settings), a new tracing module in `src/` (the adapter from the `pi-telemetry` contract to the OpenTelemetry SDK, and the OTLP exporter), `src/core/review/` (spans for steps, agent runs, and tool calls; the `streamFn` passes the span to `pi-ai`), `src/core/publish/`, `src/providers/gitlab/` (a span for each GitLab request), `src/findingsFile.ts` (the trace context).
- Dependencies: new OpenTelemetry packages: the API, the trace SDK, and the OTLP HTTP trace exporter. `@earendil-works/pi-telemetry` becomes a direct dependency.
- Configuration: the standard OpenTelemetry environment variables, for example `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`.
- The receiving server and its web UI are not part of this change.
