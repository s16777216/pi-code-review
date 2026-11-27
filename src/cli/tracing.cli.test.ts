import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxProvider } from '@earendil-works/pi-ai';
import { InMemoryTelemetryContext } from '@earendil-works/pi-telemetry';
import type { ReviewConfig } from '../config.ts';
import type { ChangeRequest, DiscussionGateway } from '../core/ports.ts';
import type { FindingsFile } from '../findingsFile.ts';
import { logicOnly } from '../core/review/fauxFocus.ts';
import { buildLogger } from '../logger.ts';
import { flattenAttributes, logEventAttributes } from '../tracing.ts';
import { runPublish, runReview } from './index.ts';

// Tests for `export-review-traces`: the spans of the commands.

const SNAPSHOT = { baseSha: 'base', startSha: 'start', headSha: 'head' };
const SOURCE = { host: 'gitlab', projectId: '1', mergeRequestIid: '2' };

const config: ReviewConfig = {
  openai: { apiKey: 'k', model: 'm', baseUrl: 'http://127.0.0.1:9/v1', maxTokens: 32_000, contextWindow: 128_000 },
};

const changeRequest: ChangeRequest<unknown> = {
  async load() {
    return {
      context: {
        title: 'Change',
        description: '',
        changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -0,0 +1,1 @@\n+one' }],
        getFileContent: async () => 'one',
        listDiscussions: async () => [],
      },
      snapshot: SNAPSHOT,
    };
  },
};

test('runReview records the read of the change and the steps under the root span', async () => {
  const faux = fauxProvider();
  logicOnly(faux, []);
  const memory = new InMemoryTelemetryContext();

  await memory.startSpan({ name: 'picr.review' }, (root) =>
    runReview({ config, changeRequest, source: SOURCE, provider: faux.provider, telemetry: root }),
  );

  const spans = memory.getSpans();
  const root = spans.find((span) => span.name === 'picr.review')!;
  const children = spans.filter((span) => span.parentId === root.id).map((span) => span.name);
  assert.ok(children.includes('picr.step.read_change'));
  assert.ok(children.includes('picr.step.review_agents'));
});

test('flattenAttributes gives the source and the snapshot of a run as attributes', () => {
  assert.deepEqual(flattenAttributes('picr.source', SOURCE), {
    'picr.source.host': 'gitlab',
    'picr.source.projectId': '1',
    'picr.source.mergeRequestIid': '2',
  });
  assert.deepEqual(flattenAttributes('picr.snapshot', SNAPSHOT)['picr.snapshot.headSha'], 'head');
  assert.deepEqual(flattenAttributes('x', null), {});
});

test('a warn line goes to the log sink without the redacted keys', () => {
  const lines: [string, string, Record<string, unknown>][] = [];
  const logger = buildLogger(false, (level, message, fields) => lines.push([level, message, fields]));
  logger.warn({ file: 'a.ts', apiKey: 'sk-secret', headers: { 'PRIVATE-TOKEN': 't' } }, 'discarded a finding');
  logger.info('Plain line.');
  logger.debug({ x: 1 }, 'not sent');
  assert.deepEqual(lines, [
    ['warn', 'discarded a finding', { file: 'a.ts' }],
    ['info', 'Plain line.', {}],
  ]);
});

test('logEventAttributes keeps the level, the message, and each field', () => {
  assert.deepEqual(logEventAttributes('warn', 'm', { file: 'a.ts', line: 3, extra: { a: 1 }, none: undefined }), {
    'picr.log.level': 'warn',
    'picr.log.message': 'm',
    'picr.log.file': 'a.ts',
    'picr.log.line': 3,
    'picr.log.extra': '{"a":1}',
  });
});

/** A gateway that records nothing and has no discussions. */
function emptyGateway(): DiscussionGateway {
  return {
    list: async () => [],
    createDiscussion: async () => {},
    reply: async () => {},
    setResolved: async () => {},
    createNote: async () => {},
    updateNote: async () => {},
  };
}

test('publish has one span for each created discussion and one for the status comment', async () => {
  const memory = new InMemoryTelemetryContext();
  const findingsFile: FindingsFile<unknown, unknown> = {
    diffRefs: SNAPSHOT,
    source: SOURCE,
    findings: [
      { file: 'a.ts', line: 1, severity: 'low', summary: 'One.' },
      { file: 'a.ts', line: 5, endLine: 9, severity: 'low', summary: 'Two.' },
    ],
    resolved: [],
    unreviewedFiles: [],
    warnings: [{ code: 'deduplication_failed' }],
  };

  await memory.startSpan({ name: 'picr.publish' }, (root) =>
    runPublish({ config: { failOnSeverity: 'high' }, gateway: emptyGateway(), findingsFile, telemetry: root }),
  );

  const spans = memory.getSpans();
  const root = spans.find((span) => span.name === 'picr.publish')!;
  const created = spans.filter((span) => span.name === 'picr.publish.create_discussion');
  assert.deepEqual(
    created.map((span) => [span.attributes['picr.line'], span.attributes['picr.end_line']]),
    [
      [1, undefined],
      [5, 9],
    ],
  );
  assert.equal(spans.filter((span) => span.name === 'picr.publish.status_comment').length, 1);
  assert.equal(root.attributes['picr.discussions.created'], 2);
  assert.equal(root.attributes['picr.outcome'], 'pass');
});
