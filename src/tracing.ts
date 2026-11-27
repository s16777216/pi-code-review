import {
  ROOT_CONTEXT,
  SpanStatusCode,
  TraceFlags,
  isSpanContextValid,
  trace,
  type Attributes,
  type Link,
  type Span,
  type SpanContext,
  type Tracer,
} from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, TracerProvider, type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace';
import {
  NOOP_TELEMETRY_CONTEXT,
  type SpanAttributes,
  type SpanLink,
  type SpanOptions,
  type SpanStatus,
  type TelemetryCarrier,
  type TelemetryContext,
  type TelemetryPropagation,
  type TelemetrySpan,
} from '@earendil-works/pi-telemetry';
import type { Logger } from './logger.ts';
export { MAX_TRACE_TEXT_CHARS, textAttributes } from './core/review/telemetry.ts';

// The adapter from the `pi-telemetry` contract to the OpenTelemetry trace SDK
// (`export-review-traces` design, Decisions 1, 2, 5, and 8). The core only
// sees `TelemetryContext`; this module is the only one that names
// OpenTelemetry.

/** The longest time that a command waits for the export at its end. */
export const TRACE_FLUSH_LIMIT_MS = 5_000;
/** The attribute that keeps the error name of a span status. */
const ERROR_TYPE = 'error.type';

/** Replaces each secret value in a text with `[REDACTED]` (Decision 5). */
export function secretScrubber(secrets: readonly (string | undefined)[]): (text: string) => string {
  const values = secrets.filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (values.length === 0) return (text) => text;
  return (text) => values.reduce((result, value) => result.split(value).join('[REDACTED]'), text);
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

function toCarrier(spanContext: SpanContext): TelemetryCarrier {
  const flags = (spanContext.traceFlags & TraceFlags.SAMPLED ? 1 : 0).toString(16).padStart(2, '0');
  return { traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-${flags}` };
}

/** Reads a W3C `traceparent` carrier, or `undefined` when it is not valid. */
export function parseTraceCarrier(carrier: TelemetryCarrier | undefined): SpanContext | undefined {
  const match = typeof carrier?.traceparent === 'string' ? TRACEPARENT.exec(carrier.traceparent) : null;
  if (!match) return undefined;
  const spanContext: SpanContext = {
    traceId: match[1]!,
    spanId: match[2]!,
    traceFlags: Number.parseInt(match[3]!, 16),
    isRemote: true,
  };
  return isSpanContextValid(spanContext) ? spanContext : undefined;
}

/** The state that every context of one adapter shares. */
interface Shared {
  tracer: Tracer;
  scrub: (text: string) => string;
  propagation: TelemetryPropagation;
  root: TelemetryContext;
  inert: TelemetrySpan;
}

/** Attributes without `undefined`, with arrays copied and secrets removed. */
function clean(shared: Shared, attributes: SpanAttributes | undefined): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value === undefined) continue;
    if (typeof value === 'string') result[key] = shared.scrub(value);
    else if (Array.isArray(value)) {
      result[key] = value.map((item: unknown) => (typeof item === 'string' ? shared.scrub(item) : item)) as
        string[] | number[] | boolean[];
    } else result[key] = value as number | boolean;
  }
  return result;
}

/** The span context of a link target, or `undefined` for a root, a no-op, or an unknown context. */
function linkTarget(context: TelemetryContext): SpanContext | undefined {
  if (context instanceof OtelSpan) return context.native.spanContext();
  if (context instanceof RemoteParent) return context.spanContext;
  return undefined;
}

function toLink(shared: Shared, link: SpanLink): Link | undefined {
  const target = linkTarget(link.context);
  return target === undefined ? undefined : { context: target, attributes: clean(shared, link.attributes) };
}

function errorStatus(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'Error', message: error === undefined ? 'undefined' : String(error) };
}

/** Starts a span under `parent` (or as a root), runs `callback` synchronously
 * once, and ends the span when the result settles. */
function runSpan<T>(
  shared: Shared,
  parent: SpanContext | undefined,
  options: SpanOptions,
  callback: (span: TelemetrySpan) => T | Promise<T>,
): Promise<T> {
  const parentContext = parent === undefined ? ROOT_CONTEXT : trace.setSpanContext(ROOT_CONTEXT, parent);
  const links = (options.links ?? []).flatMap((link) => {
    const converted = toLink(shared, link);
    return converted === undefined ? [] : [converted];
  });
  const native = shared.tracer.startSpan(
    options.name,
    { attributes: clean(shared, options.attributes), links },
    parentContext,
  );
  const span = new OtelSpan(shared, native);
  let result: T | Promise<T>;
  try {
    result = callback(span);
  } catch (error) {
    span.settle(error, true);
    return Promise.reject(error);
  }
  if (result !== null && typeof (result as Promise<T>)?.then === 'function') {
    return Promise.resolve(result).then(
      (value) => {
        span.settle(undefined, false);
        return value;
      },
      (error: unknown) => {
        span.settle(error, true);
        throw error;
      },
    );
  }
  span.settle(undefined, false);
  return Promise.resolve(result as T);
}

/** One recording span. After it settles, every recording call is inert, and a
 * child span is not recorded. */
class OtelSpan implements TelemetrySpan {
  private settled = false;
  private explicit: SpanStatus | undefined;

  constructor(
    private readonly shared: Shared,
    readonly native: Span,
  ) {}

  get propagation(): TelemetryPropagation {
    return this.shared.propagation;
  }

  get metrics(): undefined {
    return undefined;
  }

  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    if (this.settled) return this.shared.inert.startSpan(options, callback);
    return runSpan(this.shared, this.native.spanContext(), options, callback);
  }

  addLink(link: SpanLink): void {
    if (this.settled) return;
    const converted = toLink(this.shared, link);
    if (converted !== undefined) this.native.addLink(converted);
  }

  addEvent(name: string, attributes?: SpanAttributes): void {
    if (!this.settled) this.native.addEvent(name, clean(this.shared, attributes));
  }

  setAttributes(attributes: SpanAttributes): void {
    if (!this.settled) this.native.setAttributes(clean(this.shared, attributes));
  }

  setStatus(status: SpanStatus): void {
    if (!this.settled) this.explicit = status;
  }

  /** Ends the span: the last explicit status wins, else a throw gives `error`. */
  settle(error: unknown, failed: boolean): void {
    if (this.settled) return;
    const status: SpanStatus =
      this.explicit ?? (failed ? { status: 'error', error: errorStatus(error) } : { status: 'ok' });
    if (status.status === 'error') {
      const detail = status.error ?? { name: 'Error', message: '' };
      this.native.setAttribute(ERROR_TYPE, detail.name);
      this.native.setStatus({ code: SpanStatusCode.ERROR, message: this.shared.scrub(detail.message) });
    } else {
      this.native.setStatus({ code: SpanStatusCode.OK });
    }
    this.settled = true;
    this.native.end();
  }
}

/** A parent from another process, read from a carrier. */
class RemoteParent implements TelemetryContext {
  constructor(
    private readonly shared: Shared,
    readonly spanContext: SpanContext,
  ) {}

  get propagation(): TelemetryPropagation {
    return this.shared.propagation;
  }

  get metrics(): undefined {
    return undefined;
  }

  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    return runSpan(this.shared, this.spanContext, options, callback);
  }
}

/** A span that records nothing but keeps the capabilities of the adapter. */
class InertSpan implements TelemetrySpan {
  constructor(private readonly shared: () => Shared) {}

  get propagation(): TelemetryPropagation {
    return this.shared().propagation;
  }

  get metrics(): undefined {
    return undefined;
  }

  startSpan<T>(_options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    try {
      return Promise.resolve(callback(this));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  addLink(): void {}
  addEvent(): void {}
  setAttributes(): void {}
  setStatus(): void {}
}

/** The root context of the adapter. */
export class OtelTelemetry implements TelemetryContext {
  private readonly shared: Shared;

  constructor(tracer: Tracer, secrets: readonly (string | undefined)[] = []) {
    const inert = new InertSpan(() => this.shared);
    const propagation: TelemetryPropagation = {
      inject: (context) => {
        const target = linkTarget(context);
        return target === undefined ? undefined : toCarrier(target);
      },
      extract: (carrier) => {
        const spanContext = parseTraceCarrier(carrier);
        return spanContext === undefined ? this : new RemoteParent(this.shared, spanContext);
      },
    };
    this.shared = { tracer, scrub: secretScrubber(secrets), propagation, root: this, inert };
  }

  get propagation(): TelemetryPropagation {
    return this.shared.propagation;
  }

  get metrics(): undefined {
    return undefined;
  }

  startSpan<T>(options: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> {
    return runSpan(this.shared, undefined, options, callback);
  }
}

/** Wraps an exporter and remembers a failed export (Decision 8). */
export class FailureTrackingExporter implements SpanExporter {
  failed = false;

  constructor(private readonly inner: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.inner.export(spans, (result) => {
      if (result.code !== ExportResultCode.SUCCESS) this.failed = true;
      resultCallback(result);
    });
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve();
  }
}

/** The telemetry of one command run. */
export interface RunTelemetry {
  context: TelemetryContext;
  /** True when the run sends a trace. */
  enabled: boolean;
  /** Sends the rest of the trace, waits at most `TRACE_FLUSH_LIMIT_MS`, and
   * writes one `warn` line when the export failed or took too long. Never throws. */
  finish(): Promise<void>;
}

/** True when the environment turns tracing on (Decision 2). */
export function tracingEnabled(env: NodeJS.ProcessEnv): boolean {
  if ((env.OTEL_SDK_DISABLED ?? '').trim().toLowerCase() === 'true') return false;
  return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim());
}

export interface BuildTelemetryOptions {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  /** The values that a trace must never hold. */
  secrets: readonly (string | undefined)[];
  version: string;
  /** For tests: the exporter to use in place of the OTLP HTTP exporter. */
  exporter?: SpanExporter;
  /** For tests: the flush limit. */
  flushLimitMs?: number;
}

/** The no-op telemetry when tracing is off, else the adapter with the OTLP
 * HTTP exporter. The exporter reads the standard OTLP variables. */
export function buildTelemetry(options: BuildTelemetryOptions): RunTelemetry {
  if (!tracingEnabled(options.env) && options.exporter === undefined) {
    return { context: NOOP_TELEMETRY_CONTEXT, enabled: false, finish: async () => {} };
  }
  const timeoutSet = options.env.OTEL_EXPORTER_OTLP_TIMEOUT || options.env.OTEL_EXPORTER_OTLP_TRACES_TIMEOUT;
  const exporter = new FailureTrackingExporter(
    options.exporter ?? new OTLPTraceExporter(timeoutSet ? {} : { timeoutMillis: TRACE_FLUSH_LIMIT_MS }),
  );
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'pi-code-review', 'service.version': options.version }),
    spanProcessors: [new BatchSpanProcessor({ exporter })],
  });
  const context = new OtelTelemetry(provider.getTracer('pi-code-review', options.version), options.secrets);
  const limit = options.flushLimitMs ?? TRACE_FLUSH_LIMIT_MS;

  return {
    context,
    enabled: true,
    async finish() {
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), limit);
        timer.unref();
      });
      const done = provider
        .forceFlush({ timeoutMillis: limit })
        .then(() => provider.shutdown())
        .then(
          () => 'done' as const,
          () => 'error' as const,
        );
      const outcome = await Promise.race([done, timedOut]);
      clearTimeout(timer);
      if (outcome !== 'done' || exporter.failed) {
        options.logger.warn(
          { reason: outcome === 'timeout' ? 'timeout' : 'export_failed' },
          'could not send the trace to the OTLP endpoint',
        );
      }
    },
  };
}

/** The string, number, and boolean fields of `value` as attributes under
 * `prefix`, for example `picr.source.projectId`. Other fields are skipped. */
export function flattenAttributes(prefix: string, value: unknown): SpanAttributes {
  if (typeof value !== 'object' || value === null) return {};
  const result: SpanAttributes = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
      result[`${prefix}.${key}`] = field;
    }
  }
  return result;
}

/** The attributes of a `picr.log` event: the level, the message, and each
 * field. A field that is not a string, a number, or a boolean is JSON text. */
export function logEventAttributes(level: string, message: string, fields: Record<string, unknown>): SpanAttributes {
  const result: SpanAttributes = { 'picr.log.level': level, 'picr.log.message': message };
  for (const [key, field] of Object.entries(fields)) {
    if (field === undefined) continue;
    result[`picr.log.${key}`] =
      typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean'
        ? field
        : JSON.stringify(field);
  }
  return result;
}
