import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { FauxResponseStep } from '@earendil-works/pi-ai';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine } from './engine.ts';
import { perFocus } from './fauxFocus.ts';

// Pins the `warn` lines and the warnings of the three steps that run one agent
// for one file: the verification step, the discussion judgment step, and the
// verify agent step (`refactor-engine-steps`). Each step has two ways to give
// up: the run fails, or the first request is too large.

const LOGIC = 0;
const failed = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });
const failures = (): FauxResponseStep[] => Array.from({ length: 10 }, () => failed as FauxResponseStep);
const finding = (summary: string) => ({ file: 'a.ts', line: 1, severity: 'high', summary });

function submitReview(findings: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

function discussion(extra: Partial<ReviewDiscussion> = {}): ReviewDiscussion {
  return {
    id: 'd1',
    file: 'a.ts',
    line: 1,
    positionCommit: 'abc',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor('a.ts', 'gone'),
    notes: [{ author: 'picr', body: 'Note of d1.' }],
    ...extra,
  };
}

function contextFor(discussions: ReviewDiscussion[]): ReviewContext {
  return {
    title: 'Small change',
    description: '',
    changedFiles: [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -0,0 +1,3 @@', '+one', '+two', '+three'].join('\n') },
    ],
    listDiscussions: async () => discussions,
    async getFileContent() {
      return 'one\ntwo\nthree';
    },
  };
}

function recordingLogger() {
  const warns: { fields: Record<string, unknown>; message: string }[] = [];
  const logger = {
    debug() {},
    info() {},
    warn: (fields: Record<string, unknown>, message: string) => warns.push({ fields, message }),
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, warns };
}

function runStep(
  faux: ReturnType<typeof fauxProvider>,
  context: ReviewContext,
  options: { contextWindow?: number } = {},
) {
  const { logger, warns } = recordingLogger();
  const model =
    options.contextWindow === undefined
      ? faux.getModel()
      : { ...faux.getModel(), contextWindow: options.contextWindow };
  const engine = new AgentReviewEngine({ provider: faux.provider, model, apiKey: 'k', logger, sleep: async () => {} });
  return engine.review(context).then((result) => ({ result, warns }));
}

const noRetryLines = <T extends { fields: Record<string, unknown> }>(warns: T[]) =>
  warns.filter((w) => !('attempt' in w.fields));

// --- The verification step ---

test('a failed verifier run writes its warn line and the warning verification_failed', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding('One.')])] }, undefined, failures());

  const { result, warns } = await runStep(faux, contextFor([]));

  assert.deepEqual(result.warnings, [{ code: 'verification_failed', file: 'a.ts' }]);
  const line = noRetryLines(warns).find((w) => w.message.startsWith('did not verify'));
  assert.deepEqual(line, {
    fields: { file: 'a.ts', error: line?.fields.error },
    message: 'did not verify the findings of a file: the run failed',
  });
  assert.equal(typeof line?.fields.error, 'string');
});

test('a verifier request that is too large writes its warn line and the warning verification_skipped', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding('word '.repeat(8000))])] });

  const { result, warns } = await runStep(faux, contextFor([]), { contextWindow: 20_000 });

  assert.deepEqual(result.warnings, [{ code: 'verification_skipped', file: 'a.ts' }]);
  const line = warns.find((w) => w.message.startsWith('did not verify'));
  assert.equal(
    line?.message,
    'did not verify the findings of a file: the first request is larger than half of the context window',
  );
  assert.deepEqual(Object.keys(line?.fields ?? {}).sort(), ['file', 'tokens']);
  assert.equal(line?.fields.file, 'a.ts');
});

// --- The discussion judgment step ---

test('a failed judge run writes its warn line and adds no warning', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, failures());

  const { result, warns } = await runStep(faux, contextFor([discussion()]));

  assert.deepEqual(result.warnings, []);
  const line = noRetryLines(warns).find((w) => w.message.startsWith('did not judge'));
  assert.deepEqual(line, {
    fields: { file: 'a.ts', error: line?.fields.error },
    message: 'did not judge the discussions of a file: the run failed',
  });
  assert.equal(typeof line?.fields.error, 'string');
});

test('a judge request that is too large writes its warn line and adds no warning', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, []);
  const big = discussion({ notes: [{ author: 'picr', body: 'word '.repeat(20_000) }] });

  const { result, warns } = await runStep(faux, contextFor([big]), { contextWindow: 30_000 });

  assert.deepEqual(result.warnings, []);
  const line = warns.find((w) => w.message.startsWith('did not judge'));
  assert.equal(
    line?.message,
    'did not judge the discussions of a file: the first request is larger than half of the context window',
  );
  assert.deepEqual(Object.keys(line?.fields ?? {}).sort(), ['file', 'tokens']);
  assert.equal(line?.fields.file, 'a.ts');
});

// --- The verify agent step ---

const fixedJudgments = (): FauxResponseStep[] =>
  Array.from(
    { length: 10 },
    () =>
      (() =>
        fauxAssistantMessage(
          [
            fauxToolCall('submit_judgments', {
              judgments: [{ number: 1, judgment: 'fixed', reason: 'Fixed.' }],
            } as never),
          ],
          { stopReason: 'toolUse' },
        )) as FauxResponseStep,
  );

test('a failed verify agent run writes its warn line and adds no warning', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding('A.')])] }, undefined, undefined, fixedJudgments(), failures());

  const { result, warns } = await runStep(faux, contextFor([discussion()]));

  assert.deepEqual(result.warnings, []);
  const line = noRetryLines(warns).find((w) => w.message.startsWith('did not run the verify agent'));
  assert.deepEqual(line, {
    fields: { file: 'a.ts', error: line?.fields.error },
    message: 'did not run the verify agent for a file: the run failed',
  });
  assert.equal(typeof line?.fields.error, 'string');
});

test('a verify agent request that is too large writes its warn line and adds no warning', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding('A is wrong.')])] });
  const long = discussion({ notes: [{ author: 'sam', body: 'long '.repeat(6000) }] });

  const { result, warns } = await runStep(faux, contextFor([long]), { contextWindow: 7000 });

  assert.deepEqual(result.warnings, []);
  const line = warns.find((w) => w.message.startsWith('did not run the verify agent'));
  assert.equal(
    line?.message,
    'did not run the verify agent for a file: the first request is larger than half of the context window',
  );
  assert.deepEqual(Object.keys(line?.fields ?? {}).sort(), ['file', 'tokens']);
  assert.equal(line?.fields.file, 'a.ts');
});
