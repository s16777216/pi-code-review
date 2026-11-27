## 1. Dependencies and adapter

- [ ] 1.1 Add `@earendil-works/pi-telemetry` (same version as `pi-ai` uses) and the OpenTelemetry API, trace SDK, resources, core, and OTLP HTTP trace exporter packages. Pick releases that are at least two weeks old. Verify that `npm install` and `npm run build` pass.
- [ ] 1.2 Add `src/tracing.ts` with the adapter from `TelemetryContext` to the OpenTelemetry SDK, with W3C propagation. Verify that the conformance suite of `@earendil-works/pi-telemetry/testing` passes with an in-memory span exporter.
- [ ] 1.3 Add the secret removal to the adapter. Verify with tests: a string attribute, an event attribute, and a status message that hold a secret value get `[REDACTED]`.
- [ ] 1.4 Add the content helper that cuts a text at 100,000 characters and sets `.truncated` and `.length`. Verify with tests for a text at the limit and a text of 150,000 characters.
- [ ] 1.5 Add `buildTelemetry(env, logger, secrets)`. Verify with tests: no endpoint gives the no-op context, `OTEL_SDK_DISABLED=true` gives the no-op context, and an endpoint gives the adapter with `service.name` `pi-code-review` and the package version.
- [ ] 1.6 Add the exporter wrapper and the flush with a 5-second limit. Verify with tests: a failed export gives one `warn` line, and an exporter that never answers ends the flush in 5 seconds or less.

## 2. Review spans

- [ ] 2.1 Give `AgentReviewEngine` a `TelemetryContext` option (default: the no-op context). Start the step spans in `review()` and the step methods. Verify with an engine test on `InMemoryTelemetryContext` for "A review with every step" and "A step that does not run".
- [ ] 2.2 Start the agent run span in `runOnce` with the kind, the review focus or the file, the batch, and the try number. Verify with tests for "Three review agents" and "An agent run is tried again".
- [ ] 2.3 Pass the agent run span to `pi-ai` through `streamFn(span)`. Verify with a test with the faux provider: the agent run span has one `pi.ai.request` child for each model request.
- [ ] 2.4 Start a tool call span in `get_file_content` and in each submit tool. Verify with tests for "The agent reads a file" and "A rejected submit call".
- [ ] 2.5 Record the prompts, the responses, and the tool results with the content helper. Verify with tests for "The prompts of an agent run" and "A long tool result".
- [ ] 2.6 Record the findings before and after each step, and one `picr.finding.dropped` event for each dropped finding in `runChecks` and `Batch.filterFindings`. Verify with tests for "A finding outside the diff" and "The verification step rejects a finding".

## 3. CLI, publish, and host

- [ ] 3.1 In `runReviewCommand`, build the telemetry, start the root span with the host, project, merge request, head commit, model, and language, and add the result counts at the end. Verify with a CLI test on an in-memory context.
- [ ] 3.2 Add the log sink to `buildLogger`, and set it to the root span. Verify with a test: a `warn` line of a run becomes a `picr.log` event with the redacted fields.
- [ ] 3.3 Start a span for each GitLab request under the root span, with the method, the URL path, and the status. Verify with a client test that the span has no header and no token value.
- [ ] 3.4 Write `trace.traceparent` to the findings file, and read it in `readFindingsFile`. Verify with tests: a file with a valid trace context, a file without one, and a file with a value that is not valid.
- [ ] 3.5 In `runPublishCommand`, start the root span with a link to the trace context, and start a span for each discussion action and the status comment. Verify with tests for "Publish creates two discussions" and "Publish reads an older findings file".
- [ ] 3.6 Flush the trace at the end of both commands. Verify with a CLI test for "The endpoint cannot be reached": the same findings file, the same exit code, and one `warn` line.

## 4. Documents

- [ ] 4.1 Add a tracing section to `docs/how-it-works.md` or `docs/customization.md`: the environment variables, the spans, the content limit, and the limit that only known secrets are removed. Verify that the page names each environment variable of the spec.

## 5. Check

- [ ] 5.1 Run `npm run build`, `npm test`, `npm run lint`, and `npx tsc --noEmit`. Verify that all pass, and that the changed files pass `prettier --check --end-of-line auto`.
- [ ] 5.2 Run an OpenTelemetry Collector in Docker with the OTLP HTTP receiver and the debug exporter. Run `review` on a test merge request with `OTEL_EXPORTER_OTLP_ENDPOINT` set to the collector. Verify in the collector output that the spans of the spec are present and that no secret value is present.
- [ ] 5.3 Run `publish` of that findings file only after the user approves it. Verify the link to the `review` trace in the collector output, then delete the comments.
- [ ] 5.4 Run `openspec-sync-specs` to refresh the local `SPEC.md` files in the design. Ask the user to approve each file first.

Order: group 1 before groups 2 and 3, 2.1 before 2.2 to 2.6, 3.1 before 3.2 to 3.6, and group 5 last.
