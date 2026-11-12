import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ReviewContext } from '../types.ts';
import { AgentReviewEngine, MAX_RUN_TRIES } from './engine.ts';
import { confirmAll, logicOnly, perFocus } from './fauxFocus.ts';
import { ReviewFailureError } from './findings.ts';

// Tests for `harden-run-failures`: the request timeout, the retry for the
// token limit, the failure categories, and the warnings of a degraded step.

const LOGIC = 0;
const SECURITY = 1;

const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

function submitGroups(groups: number[][]) {
  return fauxAssistantMessage([fauxToolCall('submit_groups', { groups } as never)], { stopReason: 'toolUse' });
}

const cut = () => fauxAssistantMessage('{"fin', { stopReason: 'length' });
const failed = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });

function files(paths: string[]): ReviewContext {
  const lines = ['+one', '+two', '+three', '+four', '+five'];
  return {
    title: 'Small change',
    description: '',
    changedFiles: paths.map((path) => ({
      oldPath: path,
      newPath: path,
      hunks: ['@@ -0,0 +1,5 @@', ...lines].join('\n'),
    })),
    listDiscussions: async () => [],
    async getFileContent() {
      return 'content';
    },
  };
}

function recordingLogger() {
  const warnings: Record<string, unknown>[] = [];
  const logger = {
    debug() {},
    info() {},
    warn: (o: Record<string, unknown>) => warnings.push(o),
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, warnings };
}

function engineFor(
  faux: ReturnType<typeof fauxProvider>,
  options: Partial<ConstructorParameters<typeof AgentReviewEngine>[0]> = {},
) {
  return new AgentReviewEngine({
    provider: faux.provider,
    model: faux.getModel(),
    apiKey: 'k',
    sleep: noSleep,
    ...options,
  });
}

async function failureOf(run: () => Promise<unknown>): Promise<ReviewFailureError> {
  try {
    await run();
  } catch (caught) {
    assert.ok(caught instanceof ReviewFailureError, 'expected a ReviewFailureError');
    return caught;
  }
  throw new Error('the review did not fail');
}

// --- The request timeout ---

test('the engine passes the request timeout to the model client and never sets maxRetries', async () => {
  const faux = fauxProvider();
  const seen: { timeoutMs?: number; maxRetries?: number }[] = [];
  logicOnly(faux, [
    (_context, options) => {
      seen.push({ timeoutMs: options?.timeoutMs, maxRetries: options?.maxRetries });
      return submitReview();
    },
  ]);

  await engineFor(faux, { timeoutMs: 120_000 }).review(files(['a.ts']));

  assert.deepEqual(seen, [{ timeoutMs: 120_000, maxRetries: undefined }]);
});

test('the engine passes no request timeout when none is set', async () => {
  const faux = fauxProvider();
  const seen: unknown[] = [];
  logicOnly(faux, [
    (_context, options) => {
      seen.push(options?.timeoutMs);
      return submitReview();
    },
  ]);

  await engineFor(faux).review(files(['a.ts']));

  assert.deepEqual(seen, [undefined]);
});

// --- The retry for the token limit ---

test('a log line names the review focus and the two limits when a run is tried again after the token limit', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [cut, submitReview()]);
  const { logger, warnings } = recordingLogger();
  const model = { ...faux.getModel(), maxTokens: 500 };

  await engineFor(faux, { logger, model }).review(files(['a.ts']));

  const lines = warnings.filter((line) => 'retryMaxTokens' in line);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.focus, 'logic correctness');
  assert.equal(lines[0]!.maxTokens, 500);
  assert.equal(lines[0]!.retryMaxTokens, 1000);
});

test('a run cut at the token limit does not use a try: an error after the cut still gets its three tries', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [cut, failed, failed, submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'S.' }])]);
  const waits: number[] = [];

  const { findings } = await engineFor(faux, {
    sleep: async (ms) => {
      waits.push(ms);
    },
  }).review(files(['a.ts']));

  assert.equal(findings.length, 1);
  assert.deepEqual(waits, [2000, 4000]);
});

test('the retry for the token limit happens one time only, also after an error', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [cut, failed, cut]);

  const error = await failureOf(() => engineFor(faux).review(files(['a.ts'])));

  assert.equal(error.category, 'output_cut');
});

test('only the run that was cut gets the larger limit', async () => {
  const faux = fauxProvider();
  const securityLimits: number[] = [];
  perFocus(faux, {
    [LOGIC]: [cut, submitReview()],
    [SECURITY]: [
      (_context, _options, _state, model) => {
        securityLimits.push(model.maxTokens);
        return submitReview();
      },
    ],
  });
  const model = { ...faux.getModel(), maxTokens: 700 };

  await engineFor(faux, { model }).review(files(['a.ts']));

  assert.deepEqual(securityLimits, [700]);
});

test('the deduplication step is tried again with twice the limit after the token limit', async () => {
  const faux = fauxProvider();
  const limits: number[] = [];
  const two = [
    { file: 'a.ts', line: 1, severity: 'low', summary: 'First.' },
    { file: 'a.ts', line: 2, severity: 'low', summary: 'Second.' },
  ];
  perFocus(faux, { [LOGIC]: [submitReview(two)] }, [
    (_context, _options, _state, model) => {
      limits.push(model.maxTokens);
      return cut();
    },
    (_context, _options, _state, model) => {
      limits.push(model.maxTokens);
      return submitGroups([[1], [2]]);
    },
  ]);
  const model = { ...faux.getModel(), maxTokens: 900 };

  const { findings, warnings } = await engineFor(faux, { model }).review(files(['a.ts']));

  assert.deepEqual(limits, [900, 1800]);
  assert.equal(findings.length, 2);
  assert.deepEqual(warnings, []);
});

test('a verifier run is tried again with twice the limit after the token limit', async () => {
  const faux = fauxProvider();
  const limits: number[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'One.' }])] },
    undefined,
    [
      (_context, _options, _state, model) => {
        limits.push(model.maxTokens);
        return cut();
      },
      (context, _options, _state, model) => {
        limits.push(model.maxTokens);
        return confirmAll(context);
      },
    ],
  );
  const model = { ...faux.getModel(), maxTokens: 800 };

  const { findings, warnings } = await engineFor(faux, { model }).review(files(['a.ts']));

  assert.deepEqual(limits, [800, 1600]);
  assert.equal(findings.length, 1);
  assert.deepEqual(warnings, []);
});

test('a verifier run that stays cut keeps the findings of its file and records a warning', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'One.' }])] },
    undefined,
    [cut, cut],
  );

  const { findings, warnings } = await engineFor(faux).review(files(['a.ts']));

  assert.equal(findings.length, 1);
  assert.deepEqual(warnings, [{ code: 'verification_failed', file: 'a.ts' }]);
});

// --- The category of a failure ---

test('a run that fails after three tries gives the category model_failed', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [failed, failed, failed]);

  const error = await failureOf(() => engineFor(faux).review(files(['a.ts'])));

  assert.equal(error.category, 'model_failed');
});

test('a run that never makes an accepted submission gives the category model_failed', async () => {
  const faux = fauxProvider();
  logicOnly(
    faux,
    Array.from({ length: MAX_RUN_TRIES }, () => fauxAssistantMessage('No tool call.', { stopReason: 'stop' })),
  );

  const error = await failureOf(() => engineFor(faux).review(files(['a.ts'])));

  assert.equal(error.category, 'model_failed');
});

test('a run that stops with aborted gives the category model_failed', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [fauxAssistantMessage('', { stopReason: 'aborted', errorMessage: 'Aborted.' })]);

  const error = await failureOf(() => engineFor(faux).review(files(['a.ts'])));

  assert.equal(error.category, 'model_failed');
});

test('a change that does not fit the context window gives the category too_large', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview()]);
  const model = { ...faux.getModel(), contextWindow: 1500 };

  const error = await failureOf(() => engineFor(faux, { model }).review(files(['a.ts'])));

  assert.equal(error.category, 'too_large');
  assert.equal(faux.state.callCount, 0);
});

test('a failure with no category gives the category other', () => {
  assert.equal(new ReviewFailureError('Any text.').category, 'other');
});

test('the category stays when the failure of a batch is described', async () => {
  const faux = fauxProvider();
  const lines = Array.from({ length: 400 }, (_, i) => `+const v${i} = "${'x'.repeat(70)}";`);
  const big: ReviewContext = {
    title: 'Large change',
    description: '',
    changedFiles: ['f1.ts', 'f2.ts', 'f3.ts'].map((path) => ({
      oldPath: path,
      newPath: path,
      hunks: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join('\n'),
    })),
    listDiscussions: async () => [],
    async getFileContent() {
      return '';
    },
  };
  logicOnly(faux, [failed, failed, failed]);
  const model = { ...faux.getModel(), contextWindow: 30_000 };

  const error = await failureOf(() => engineFor(faux, { model }).review(big));

  assert.match(error.message, /Batch \d+ of \d+ failed/);
  assert.equal(error.category, 'model_failed');
});

// --- The warnings of a degraded step ---

test('the list of warnings is empty when no step is degraded', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'One.' }])]);

  const { warnings } = await engineFor(faux).review(files(['a.ts']));

  assert.deepEqual(warnings, []);
});

test('a failed verifier run gives the warning verification_failed with the file path', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'One.' }])] },
    undefined,
    [failed, failed, failed],
  );

  const { findings, warnings } = await engineFor(faux).review(files(['a.ts']));

  assert.equal(findings.length, 1);
  assert.deepEqual(warnings, [{ code: 'verification_failed', file: 'a.ts' }]);
});

test('a file that is too large for the verifier gives the warning verification_skipped with the file path', async () => {
  const faux = fauxProvider();
  const long = 'word '.repeat(8000);
  perFocus(faux, { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: long }])] });
  const model = { ...faux.getModel(), contextWindow: 20_000 };

  const { warnings } = await engineFor(faux, { model }).review(files(['a.ts']));

  assert.deepEqual(warnings, [{ code: 'verification_skipped', file: 'a.ts' }]);
});
