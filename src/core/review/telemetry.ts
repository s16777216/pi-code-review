import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { NOOP_TELEMETRY_CONTEXT, type SpanAttributes, type TelemetrySpan } from '@earendil-works/pi-telemetry';
import type { Finding } from '../types.ts';

// The spans and the content of a review run (`export-review-traces` design,
// Decisions 3 and 4). This file names no telemetry backend: it uses only the
// `pi-telemetry` contract.

/** The longest text that a trace holds in one attribute. */
export const MAX_TRACE_TEXT_CHARS = 100_000;

/** Puts `text` into the attributes under `name`, cut at `MAX_TRACE_TEXT_CHARS`.
 * A cut text also gets `<name>.truncated` and `<name>.length`. */
export function textAttributes(name: string, text: string): SpanAttributes {
  if (text.length <= MAX_TRACE_TEXT_CHARS) return { [name]: text };
  return {
    [name]: text.slice(0, MAX_TRACE_TEXT_CHARS),
    [`${name}.truncated`]: true,
    [`${name}.length`]: text.length,
  };
}

/** A span that records nothing: the default when no telemetry is set. */
export const NOOP_SPAN: TelemetrySpan = (() => {
  let captured: TelemetrySpan | undefined;
  void NOOP_TELEMETRY_CONTEXT.startSpan({ name: 'noop' }, (span) => {
    captured = span;
  });
  return captured!;
})();

/** Called for each finding that a check drops, with its reason. */
export type OnDropped = (finding: Finding, reason: string, extra?: SpanAttributes) => void;

/** Adds one `picr.finding.dropped` event to `span` for each dropped finding. */
export function dropRecorder(span: TelemetrySpan): OnDropped {
  return (finding, reason, extra) =>
    span.addEvent('picr.finding.dropped', {
      'picr.file': finding.file,
      'picr.line': finding.line,
      'picr.end_line': finding.endLine,
      'picr.reason': reason,
      ...extra,
    });
}

function resultText(content: readonly { type: string; text?: string }[]): string {
  return content
    .flatMap((block) => (block.type === 'text' && typeof block.text === 'string' ? [block.text] : []))
    .join('\n');
}

/** The same tools, each call in a `picr.tool_call` span under `parent`. The
 * span holds the tool name, the path of `get_file_content`, and the result.
 * A result with `isError` gives the status `error` with the result text. */
// Each tool has its own parameter schema, as in the `tools` list of `pi-agent-core`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function traceTools<T extends AgentTool<any>>(tools: T[], parent: TelemetrySpan): T[] {
  return tools.map(
    (tool) =>
      ({
        ...tool,
        execute: (toolCallId: string, params: unknown, ...rest: unknown[]) =>
          parent.startSpan(
            {
              name: 'picr.tool_call',
              attributes: {
                'picr.tool.name': tool.name,
                'picr.tool.path':
                  typeof (params as { path?: unknown })?.path === 'string'
                    ? (params as { path: string }).path
                    : undefined,
              },
            },
            async (span) => {
              const result = await (tool.execute as (...args: unknown[]) => ReturnType<T['execute']>)(
                toolCallId,
                params,
                ...rest,
              );
              const text = resultText(result.content as { type: string; text?: string }[]);
              span.setAttributes({
                ...textAttributes('picr.tool.result', text),
                'picr.tool.error': result.isError === true,
              });
              if (result.isError === true) {
                span.setStatus({ status: 'error', error: { name: 'ToolError', message: text.slice(0, 500) } });
              }
              return result;
            },
          ),
      }) as T,
  );
}

/** The usage, the cost, and the stop reason of a model request, from its final
 * message. A final message with the stop reason `error` gives the status `error`. */
export function recordModelRequest(span: TelemetrySpan, message: AssistantMessage): void {
  span.setAttributes({
    stop: message.stopReason,
    'usage.input': message.usage.input,
    'usage.output': message.usage.output,
    'usage.cache_read': message.usage.cacheRead,
    'usage.cache_write': message.usage.cacheWrite,
    'cost.total': message.usage.cost.total,
  });
  if (message.stopReason === 'error') {
    span.setStatus({
      status: 'error',
      error: { name: 'provider_error', message: (message.errorMessage ?? '').slice(0, 500) },
    });
  }
}

/** One `picr.response` event for each assistant message: its text, the names
 * of its tool calls, and its stop reason. The thinking text is not recorded. */
export function recordResponses(span: TelemetrySpan, messages: readonly { role: string }[]): void {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const assistant = message as AssistantMessage;
    const text = assistant.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
    const tools = assistant.content.flatMap((block) => (block.type === 'toolCall' ? [block.name] : []));
    span.addEvent('picr.response', {
      ...textAttributes('picr.response.text', text),
      'picr.response.tool_calls': tools,
      'picr.response.stop_reason': assistant.stopReason,
    });
  }
}
