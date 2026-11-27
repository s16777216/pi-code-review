import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpanStatusCode } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
  type SpanExporter,
} from '@opentelemetry/sdk-trace';
import type { SpanAttributes } from '@earendil-works/pi-telemetry';
import { createTelemetryAdapterConformance } from '@earendil-works/pi-telemetry/testing';
import type { Logger } from './logger.ts';
import {
  MAX_TRACE_TEXT_CHARS,
  OtelTelemetry,
  buildTelemetry,
  parseTraceCarrier,
  secretScrubber,
  textAttributes,
  tracingEnabled,
} from './tracing.ts';

function carrierOf(spanContext: { traceId: string; spanId: string; traceFlags: number }) {
  return { traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-0${spanContext.traceFlags & 1}` };
}

/** A fresh adapter on an in-memory exporter, with the normalized snapshots of the conformance suite. */
function fixture(secrets: string[] = []) {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const context = new OtelTelemetry(provider.getTracer('test'), secrets);
  const normalize = () => {
    const finished = exporter.getFinishedSpans();
    const ids = new Map(finished.map((span, index) => [span.spanContext().spanId, index + 1]));
    return finished.map((span: ReadableSpan, index) => {
      const { ['error.type']: errorType, ...attributes } = span.attributes;
      const parent = span.parentSpanContext;
      return {
        id: index + 1,
        parentId: parent ? (ids.get(parent.spanId) ?? null) : null,
        context: carrierOf(span.spanContext()),
        parentContext: parent ? carrierOf(parent) : null,
        links: span.links.map((link) => ({
          context: carrierOf(link.context),
          attributes: (link.attributes ?? {}) as SpanAttributes,
        })),
        name: span.name,
        attributes: attributes as SpanAttributes,
        events: span.events.map((event) => ({
          name: event.name,
          attributes: (event.attributes ?? {}) as SpanAttributes,
        })),
        status:
          span.status.code === SpanStatusCode.ERROR
            ? { status: 'error' as const, error: { name: String(errorType), message: span.status.message ?? '' } }
            : { status: 'ok' as const },
        settled: true,
        endSequence: index,
      };
    });
  };
  return { exporter, provider, context, normalize };
}

for (const testCase of createTelemetryAdapterConformance(async () => {
  const { context, provider, normalize } = fixture();
  return {
    context,
    propagation: context.propagation,
    getSpans: async () => normalize(),
    async [Symbol.asyncDispose]() {
      await provider.shutdown();
    },
  };
})) {
  test(`adapter conformance: ${testCase.group}: ${testCase.name}`, () => testCase.run());
}

test('the adapter replaces a secret in attributes, event attributes, and the status message', async () => {
  const { context, exporter } = fixture(['tok-123', 'sk-456']);
  await context
    .startSpan({ name: 'run', attributes: { prompt: 'token tok-123 here', list: ['sk-456'] } }, (span) => {
      span.addEvent('log', { msg: 'key sk-456' });
      span.setStatus({ status: 'error', error: { name: 'E', message: 'failed with tok-123' } });
    })
    .catch(() => {});
  const [span] = exporter.getFinishedSpans();
  assert.equal(span!.attributes.prompt, 'token [REDACTED] here');
  assert.deepEqual(span!.attributes.list, ['[REDACTED]']);
  assert.equal(span!.events[0]!.attributes!.msg, 'key [REDACTED]');
  assert.equal(span!.status.message, 'failed with [REDACTED]');
});

test('secretScrubber ignores empty secrets', () => {
  assert.equal(secretScrubber(['', undefined])('a b'), 'a b');
});

test('textAttributes keeps a text at the limit and cuts a longer text with its length', () => {
  const atLimit = 'x'.repeat(MAX_TRACE_TEXT_CHARS);
  assert.deepEqual(textAttributes('picr.tool.result', atLimit), { 'picr.tool.result': atLimit });
  const long = 'y'.repeat(150_000);
  assert.deepEqual(textAttributes('picr.tool.result', long), {
    'picr.tool.result': 'y'.repeat(MAX_TRACE_TEXT_CHARS),
    'picr.tool.result.truncated': true,
    'picr.tool.result.length': 150_000,
  });
});

test('parseTraceCarrier reads a valid traceparent and rejects others', () => {
  const valid = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
  assert.equal(parseTraceCarrier({ traceparent: valid })?.spanId, 'b7ad6b7169203331');
  assert.equal(parseTraceCarrier({ traceparent: 'nope' }), undefined);
  assert.equal(parseTraceCarrier({ traceparent: `00-${'0'.repeat(32)}-b7ad6b7169203331-01` }), undefined);
  assert.equal(parseTraceCarrier(undefined), undefined);
});

test('tracingEnabled needs an endpoint and no OTEL_SDK_DISABLED=true', () => {
  assert.equal(tracingEnabled({}), false);
  assert.equal(tracingEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318' }), true);
  assert.equal(tracingEnabled({ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://c:4318/v1/traces' }), true);
  assert.equal(tracingEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://c:4318', OTEL_SDK_DISABLED: 'true' }), false);
});

function warnings() {
  const lines: Record<string, unknown>[] = [];
  const logger = { warn: (fields: Record<string, unknown>) => lines.push(fields) } as unknown as Logger;
  return { logger, lines };
}

test('buildTelemetry gives the no-op context when tracing is off', async () => {
  const { logger, lines } = warnings();
  const telemetry = buildTelemetry({ env: {}, logger, secrets: [], version: '1.0.0' });
  assert.equal(telemetry.enabled, false);
  assert.equal(await telemetry.context.startSpan({ name: 'x' }, () => 1), 1);
  await telemetry.finish();
  assert.deepEqual(lines, []);
});

test('buildTelemetry names the tool and its version in the resource', async () => {
  // `InMemorySpanExporter` drops its spans at shutdown, so keep them here.
  const kept: ReadableSpan[] = [];
  const exporter: SpanExporter = {
    export: (spans, done) => {
      kept.push(...spans);
      done({ code: ExportResultCode.SUCCESS });
    },
    shutdown: async () => {},
  };
  const { logger, lines } = warnings();
  const telemetry = buildTelemetry({ env: {}, logger, secrets: [], version: '1.2.3', exporter });
  await telemetry.context.startSpan({ name: 'review' }, () => {});
  await telemetry.finish();
  const [span] = kept;
  assert.equal(span!.resource.attributes['service.name'], 'pi-code-review');
  assert.equal(span!.resource.attributes['service.version'], '1.2.3');
  assert.deepEqual(lines, []);
});

test('a failed export gives one warn line', async () => {
  const failing: SpanExporter = {
    export: (_spans, done) => done({ code: ExportResultCode.FAILED }),
    shutdown: async () => {},
  };
  const { logger, lines } = warnings();
  const telemetry = buildTelemetry({ env: {}, logger, secrets: [], version: '1', exporter: failing });
  await telemetry.context.startSpan({ name: 'review' }, () => {});
  await telemetry.finish();
  assert.deepEqual(lines, [{ reason: 'export_failed' }]);
});

test('an exporter that never answers ends the flush at the limit', async () => {
  const hanging: SpanExporter = { export: () => {}, shutdown: () => new Promise(() => {}) };
  const { logger, lines } = warnings();
  const telemetry = buildTelemetry({
    env: {},
    logger,
    secrets: [],
    version: '1',
    exporter: hanging,
    flushLimitMs: 200,
  });
  await telemetry.context.startSpan({ name: 'review' }, () => {});
  const started = Date.now();
  await telemetry.finish();
  assert.ok(Date.now() - started < 1_000);
  assert.equal(lines.length, 1);
});

test('a publish root span links to the review trace from the findings file', async () => {
  const { context, exporter } = fixture();
  let traceparent: string | undefined;
  await context.startSpan({ name: 'picr.review' }, (span) => {
    traceparent = context.propagation.inject(span)?.traceparent;
  });
  const reviewTrace = context.propagation.extract({ traceparent: traceparent! });
  await context.startSpan({ name: 'picr.publish', links: [{ context: reviewTrace }] }, () => {});
  const [review, publish] = exporter.getFinishedSpans();
  assert.equal(publish!.parentSpanContext, undefined);
  assert.equal(publish!.links[0]!.context.spanId, review!.spanContext().spanId);
  assert.equal(publish!.links[0]!.context.traceId, review!.spanContext().traceId);
});

test('an endpoint that refuses connections gives one warn line and ends within the limit', async () => {
  const { logger, lines } = warnings();
  const telemetry = buildTelemetry({
    env: { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9' },
    logger,
    secrets: [],
    version: '1',
  });
  assert.equal(telemetry.enabled, true);
  await telemetry.context.startSpan({ name: 'picr.review' }, () => {});
  const started = Date.now();
  await telemetry.finish();
  assert.ok(Date.now() - started <= 6_000);
  assert.equal(lines.length, 1);
});
