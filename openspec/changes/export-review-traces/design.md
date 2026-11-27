## Context

See `proposal.md` (Why). Today:

- `src/logger.ts` builds one `pino` logger that writes pretty text to stderr. The logger redacts the `PRIVATE-TOKEN` header and `apiKey`. Nothing measures time, and no code adds the token counts of a run.
- `AgentReviewEngine` (`src/core/review/engine.ts`) runs every agent through `runWithRetries` and `runOnce`. Each `Agent` gets its model calls from `this.streamFn()`, which calls `provider.streamSimple` with the API key.
- `@earendil-works/pi-ai` 1.4.0 already makes a `pi.ai.request` span for each model request when the request options hold `telemetry: TelemetrySpan`. The span holds the provider, the model, the token counts, the cost, the stop reason, and one event for each content block. It never records the content.
- `@earendil-works/pi-telemetry` 1.4.0 (a dependency of `pi-ai`) defines the contract `TelemetryContext` / `TelemetrySpan`, a no-op context, an in-memory context, W3C-style propagation, and an adapter conformance suite. It has no exporter. `@earendil-works/pi-agent-core` 1.4.0 has no telemetry.
- `GitLabClient.request` (`src/providers/gitlab/client.ts`) logs each request at `debug` with the method, the URL, and the status.

## Goals / Non-Goals

**Goals:**

- Send one OTLP trace for each `review` and `publish` run, with the spans and the content in `specs/review-tracing/spec.md`.
- Keep the core free of OpenTelemetry types. The core gets a `TelemetryContext` and works the same with the no-op context.
- Make the export safe: no secret in a trace, no change of a result, and at most 5 seconds of extra wait.

**Non-Goals:**

- The receiving server and its web UI.
- OTLP logs and OTLP metrics.
- The OpenTelemetry GenAI semantic conventions. The attribute names use the `picr.*` namespace, and `pi-ai` keeps its own names. The server reads both.
- Sampling settings beyond the standard environment variables.

## Decisions

### Decision 1: The code uses the `pi-telemetry` contract, and one adapter maps it to the OpenTelemetry SDK

The engine, the publisher, and the host client take a `TelemetryContext` and start spans with `startSpan()`. A new module `src/tracing.ts` holds an adapter from that contract to the OpenTelemetry trace SDK. The CLI builds the adapter, or `NOOP_TELEMETRY_CONTEXT` when tracing is off.

- Reason: `pi-ai` takes a `TelemetrySpan`, so the spans of `pi-ai` and our spans are in one tree with no second model. The contract passes the parent explicitly, so parallel agent runs never mix their parents. Tests use `InMemoryTelemetryContext`.
- The adapter uses `BasicTracerProvider`, `BatchSpanProcessor`, and `OTLPTraceExporter` (HTTP). It sets the parent of each OpenTelemetry span from the `TelemetrySpan` that started it. It does not register a global provider and does not use automatic instrumentation.
- The adapter implements `propagation` with the W3C `traceparent` format, for Decision 7.
- The adapter must pass the conformance suite of `@earendil-works/pi-telemetry/testing`.
- Alternative: use `@opentelemetry/api` in the core. This puts a vendor type in the core, and `pi-ai` would still need an adapter.

### Decision 2: The standard environment variables turn tracing on

`buildTelemetry(env, logger, secrets)` returns the no-op context when `OTEL_SDK_DISABLED` is `true`, or when neither `OTEL_EXPORTER_OTLP_ENDPOINT` nor `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. Otherwise it builds the adapter. The exporter reads the endpoint, the headers, and the timeout from the standard variables. No new CLI flag is added.

- Alternative: a `--otlp-endpoint` flag. The standard variables already work in CI, and a flag would duplicate them.

### Decision 3: The engine starts the spans, and each agent run gets its own stream function

- `review()` and each step method (`runAll`, `deduplicate`, `verify`, `judgeDiscussions`, `decideFinal`) start a step span under the run span. A step that returns before its first model call starts no span.
- `runOnce` starts the agent run span with the kind, the review focus or the file, the batch, and the try number. `runWithRetries` passes the try number.
- `streamFn(span)` adds `telemetry: span` to the request options of `provider.streamSimple`, so `pi-ai` makes each `pi.ai.request` span under the agent run span.
- Each tool gets the agent run span when the engine builds it. The tool starts its tool call span in `execute`.
- `runChecks` and `Batch.filterFindings` add a `picr.finding.dropped` event for each finding that they drop, next to the existing `warn` line.

### Decision 4: The content goes into attributes and events, cut at 100,000 characters

- The agent run span holds `picr.prompt.system` and `picr.prompt.user`.
- At the end of `runOnce`, the engine adds one `picr.response` event for each assistant message of the run: its text, and the names of its tool calls. The thinking text is not recorded.
- The tool call span holds `picr.tool.result`.
- One helper cuts a text at 100,000 characters. For a cut text, it sets `<name>.truncated` to `true` and `<name>.length` to the full length.
- Alternative: no content limit. One `review` can read 30 files of 100,000 characters for each agent run, and an OTLP request of many megabytes can fail at the server.

### Decision 5: The adapter removes the secrets from every text

The CLI gives the adapter the values of the GitLab token and the OpenAI API key. The adapter replaces each value with `[REDACTED]` in every string attribute, event attribute, and status message before it hands the span to the SDK. The host request span gets only the method, the URL path, and the status, so no header reaches the trace.

- Reason: one place removes the secrets, so a new span cannot forget it. The logger redaction stays as it is for the stderr output.

### Decision 6: A pino hook copies `info` and `warn` lines to the root span

`buildLogger` gets an optional sink. The CLI sets the sink after it starts the root span. For each line at `info` or `warn`, the sink adds a `picr.log` event with the level, the message, and the fields after redaction. The host client starts its request span under the root span, because one client serves every step.

### Decision 7: The findings file holds the trace context, and `publish` links to it

`review` writes `trace: { traceparent: "<value>" }` from `propagation.inject(rootSpan)`. `readFindingsFile` keeps a `trace` object with a string `traceparent` and ignores a value that is not valid. `publish` starts its root span with a link to `propagation.extract(trace)`.

- Alternative: `publish` continues the trace of `review` as a child. The two runs are separate CI jobs, often minutes apart, and a link keeps each run a complete trace.

### Decision 8: The CLI flushes with a time limit and reports a failure once

The exporter is wrapped so that a failed export sets a flag. At the end of `runReviewCommand` and `runPublishCommand`, the CLI calls `forceFlush()` and `shutdown()` with a limit of 5 seconds in total. When the flag is set or the limit is reached, the CLI writes one `warn` line. The exit code and the findings file are set before the flush.

### Local `SPEC.md` files to refresh at sync

- `src/SPEC.md`: the new `tracing.ts`.
- `src/cli/SPEC.md`: the trace of each command, the flush, and the capability `review-tracing`.
- `src/core/review/SPEC.md`: the spans of the engine and the content attributes.
- `src/core/publish/SPEC.md`: the spans of the publisher.
- `src/providers/gitlab/SPEC.md`: the span of each request.

## Risks / Trade-offs

- [A trace with the content of many files is large] → Each text is cut at 100,000 characters. The `BatchSpanProcessor` sends the spans in batches.
- [A secret that the CLI does not know, for example a password in a changed file, reaches the server] → The server is inside the company network. The change records only the known secrets as a limit in `docs/`.
- [The adapter breaks the contract of `pi-telemetry`] → The conformance suite runs in the tests.
- [A slow endpoint makes CI jobs longer] → The flush waits at most 5 seconds.
- [`pi-ai` changes its span names in a later version] → The server reads the `pi.ai.*` names as they are. The package versions stay pinned in `package-lock.json`.

## Migration Plan

Tracing is off until a person sets an OTLP endpoint. The new `trace` field of the findings file is optional, so an older `publish` ignores it as an extra field, and a new `publish` reads an older file. Rollback is a revert of the change, or removing the endpoint variable.

## Open Questions

- The exact version of each OpenTelemetry package. The task that adds the packages picks a release that is at least two weeks old.
