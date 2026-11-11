import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { decidePassFail } from '../passFail.ts';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine, MAX_RUN_TRIES } from './engine.ts';
import { confirmAll, perFocus } from './fauxFocus.ts';

// Tests for `add-verification-step`: one verifier run for each file with
// findings, the effect of the verdicts, and the failure rules.

const LOGIC = 0;
const SECURITY = 1;

const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = [], resolved: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved } as never)], {
    stopReason: 'toolUse',
  });
}

function submitVerdicts(verdicts: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_verdicts', { verdicts } as never)], { stopReason: 'toolUse' });
}

function verdict(number: number, value: string, severity: string, reason = 'The code shows it.') {
  return { number, verdict: value, severity, reason };
}

function files(paths: string[], overrides: Partial<ReviewContext> = {}): ReviewContext {
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
    ...overrides,
  };
}

function recordingLogger() {
  const infos: Record<string, unknown>[] = [];
  const warnings: Record<string, unknown>[] = [];
  const debugs: Record<string, unknown>[] = [];
  const logger = {
    debug: (o: Record<string, unknown>) => debugs.push(o),
    info: (o: Record<string, unknown>) => infos.push(o),
    warn: (o: Record<string, unknown>) => warnings.push(o),
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, infos, warnings, debugs };
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

const error = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });

/** Logic reports one finding in `a.ts`, security reports one in `b.ts`. */
function twoFiles(faux: ReturnType<typeof fauxProvider>, verify?: Parameters<typeof perFocus>[3]) {
  perFocus(
    faux,
    {
      [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A is wrong.' }])],
      [SECURITY]: [submitReview([{ file: 'b.ts', line: 2, severity: 'low', summary: 'B is wrong.' }])],
    },
    undefined,
    verify,
  );
}

// --- Which runs start ---

test('the verification step starts one verifier run for each file with findings', async () => {
  const faux = fauxProvider();
  const prompts: string[] = [];
  const record = (ctx: Parameters<typeof confirmAll>[0]) => (
    prompts.push(JSON.stringify((ctx as { messages: unknown }).messages)),
    confirmAll(ctx)
  );
  twoFiles(faux, [record, record]);

  await engineFor(faux).review(files(['a.ts', 'b.ts']));

  assert.equal(faux.state.callCount, 5);
  assert.equal(prompts.length, 2);
});

test('the verification step starts no verifier run when no finding remains', async () => {
  const faux = fauxProvider();
  perFocus(faux, {});

  const { findings } = await engineFor(faux).review(files(['a.ts']));

  assert.deepEqual(findings, []);
  assert.equal(faux.state.callCount, 3);
});

test('a verifier run handles the findings of one file and sees the diff of that file only', async () => {
  const faux = fauxProvider();
  const prompts: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'First.', relatesTo: 'd1' },
          { file: 'a.ts', line: 2, severity: 'low', summary: 'Second.' },
        ]),
      ],
    },
    [
      () =>
        fauxAssistantMessage([fauxToolCall('submit_groups', { groups: [[1], [2]] } as never)], {
          stopReason: 'toolUse',
        }),
    ],
    [(ctx) => (prompts.push(JSON.stringify((ctx as { messages: unknown }).messages)), confirmAll(ctx))],
  );
  const known: ReviewDiscussion = {
    id: 'd1',
    file: 'a.ts',
    line: 1,
    positionCommit: 'h',
    resolved: false,
    fromThisTool: true,
    anchor: null,
    notes: [],
  };

  const { findings } = await engineFor(faux).review(files(['a.ts', 'b.ts'], { listDiscussions: async () => [known] }));

  assert.equal(findings.length, 2);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!, /### a\.ts/);
  assert.doesNotMatch(prompts[0]!, /### b\.ts/);
  // A finding with relatesTo is verified like the others, and its link is not shown to the verifier.
  assert.doesNotMatch(prompts[0]!, /relatesTo|d1/);
});

test('the verifier gets the review instructions and the tool that reads a file', async () => {
  const faux = fauxProvider();
  let seen = '';
  twoFiles(faux, [(ctx) => ((seen = JSON.stringify(ctx)), confirmAll(ctx)), (ctx) => confirmAll(ctx)]);

  await engineFor(faux, { instructions: 'Ignore style findings.' }).review(files(['a.ts', 'b.ts']));

  assert.match(seen, /Ignore style findings\./);
  assert.match(seen, /get_file_content/);
  assert.match(seen, /submit_verdicts/);
  assert.doesNotMatch(seen, /list_discussions/);
});

// --- Effect of the verdicts ---

test('a rejected finding is dropped, and the log names the reason', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [submitVerdicts([verdict(1, 'rejected', 'high', 'The type check already covers this.')]), confirmAll]);
  const { logger, infos } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => f.summary),
    ['B is wrong.'],
  );
  assert.deepEqual(
    infos.filter((i) => 'reason' in i && 'summary' in i),
    [{ file: 'a.ts', line: 1, summary: 'A is wrong.', reason: 'The type check already covers this.' }],
  );
});

test('the severity is lowered and raised to the reviewed severity, and nothing else changes', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [
    submitVerdicts([verdict(1, 'confirmed', 'medium')]),
    submitVerdicts([verdict(1, 'confirmed', 'high')]),
  ]);

  const { findings } = await engineFor(faux).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => [f.file, f.line, f.summary, f.severity, f.anchor === computeAnchor(f.file, 'x') ? 'x' : 'ok']),
    [
      ['a.ts', 1, 'A is wrong.', 'medium', 'ok'],
      ['b.ts', 2, 'B is wrong.', 'high', 'ok'],
    ],
  );
});

test('an uncertain finding is kept with the reviewed severity, and the log names the reason', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [submitVerdicts([verdict(1, 'uncertain', 'medium', 'The caller is not in the diff.')]), confirmAll]);
  const { logger, infos } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => [f.summary, f.severity]),
    [
      ['A is wrong.', 'medium'],
      ['B is wrong.', 'low'],
    ],
  );
  assert.deepEqual(
    infos.filter((i) => 'reason' in i && !('summary' in i)),
    [{ file: 'a.ts', line: 1, reason: 'The caller is not in the diff.' }],
  );
});

test('the log has one summary line with the numbers before, after, rejected, and changed', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [
    submitVerdicts([verdict(1, 'rejected', 'high')]),
    submitVerdicts([verdict(1, 'confirmed', 'medium')]),
  ]);
  const { logger, infos } = recordingLogger();

  await engineFor(faux, { logger }).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    infos.filter((i) => 'rejected' in i),
    [{ before: 2, after: 1, rejected: 1, severityChanged: 1 }],
  );
});

test('the pass or fail result uses the reviewed severity', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'Too severe.' }])] },
    undefined,
    [submitVerdicts([verdict(1, 'confirmed', 'medium')])],
  );

  const { findings } = await engineFor(faux).review(files(['a.ts']));

  assert.equal(decidePassFail(findings, 'high'), true);
});

test('the findings keep their order', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [submitVerdicts([verdict(1, 'confirmed', 'low')]), confirmAll]);

  const { findings } = await engineFor(faux).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => f.file),
    ['a.ts', 'b.ts'],
  );
});

test('a finding that the verification step drops cannot keep a fixed declaration invalid', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'Linked.', relatesTo: 'd1' }])],
      [SECURITY]: [submitReview([], [{ discussionId: 'd1', reason: 'The loop is fixed.' }])],
    },
    undefined,
    [submitVerdicts([verdict(1, 'rejected', 'low')])],
  );
  const discussion: ReviewDiscussion = {
    id: 'd1',
    file: 'a.ts',
    line: 1,
    positionCommit: 'h',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor('a.ts', 'the old line'),
    notes: [],
  };

  const { findings, resolved } = await engineFor(faux).review(
    files(['a.ts'], { listDiscussions: async () => [discussion] }),
  );

  assert.deepEqual(findings, []);
  assert.deepEqual(resolved, [{ discussionId: 'd1', reason: 'The loop is fixed.' }]);
});

// --- Failures ---

test('the findings of a file stay and the review does not fail when its verifier run fails on every try', async () => {
  const faux = fauxProvider();
  twoFiles(faux, [error, error, error, confirmAll]);
  const { logger, warnings } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => [f.summary, f.severity]),
    [
      ['A is wrong.', 'high'],
      ['B is wrong.', 'low'],
    ],
  );
  const failed = warnings.filter((w) => w.file === 'a.ts' && 'error' in w && !('attempt' in w));
  assert.equal(failed.length, 1);
});

test('the other files are still verified when one verifier run fails', async () => {
  const faux = fauxProvider();
  // The two verifier runs read the queue in the order they start: a.ts first.
  twoFiles(faux, [error, error, error, submitVerdicts([verdict(1, 'rejected', 'low')])]);

  const { findings } = await engineFor(faux).review(files(['a.ts', 'b.ts']));

  assert.deepEqual(
    findings.map((f) => f.summary),
    ['A is wrong.'],
  );
});

test('a verifier run is tried again and uses the verdicts of the second try', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A.' }])] }, undefined, [
    error,
    submitVerdicts([verdict(1, 'confirmed', 'low')]),
  ]);
  const { logger, warnings } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(files(['a.ts']));

  assert.equal(findings[0]!.severity, 'low');
  const retries = warnings.filter((w) => w.step === 'verification' && 'attempt' in w);
  assert.equal(retries.length, 1);
  assert.equal(retries[0]!.file, 'a.ts');
});

test('a verifier run that never gives a valid call fails after the tries and keeps the findings', async () => {
  const faux = fauxProvider();
  const bad = () => submitVerdicts([]);
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A.' }])] },
    undefined,
    Array.from({ length: 5 * MAX_RUN_TRIES }, () => bad),
  );

  const { findings } = await engineFor(faux).review(files(['a.ts']));

  assert.deepEqual(
    findings.map((f) => f.severity),
    ['high'],
  );
});

test('the findings of a file stay and the model is not called when the first request is too large', async () => {
  const faux = fauxProvider();
  // The summary is only in the request of the verifier, not in the request of the review agents.
  const long = 'word '.repeat(8000);
  perFocus(faux, { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: long }])] });
  const { logger, warnings } = recordingLogger();
  const model = { ...faux.getModel(), contextWindow: 20_000 };

  const { findings } = await engineFor(faux, { logger, model }).review(files(['a.ts']));

  assert.equal(findings.length, 1);
  assert.equal(faux.state.callCount, 3);
  assert.equal(warnings.filter((w) => w.file === 'a.ts' && 'tokens' in w).length, 1);
});

// --- Pool ---

test('at most 3 verifier runs are active at the same time', async () => {
  const faux = fauxProvider();
  let active = 0;
  let peak = 0;
  const slow = async (ctx: Parameters<typeof confirmAll>[0]) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return confirmAll(ctx);
  };
  const paths = ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts'];
  perFocus(
    faux,
    { [LOGIC]: [submitReview(paths.map((file) => ({ file, line: 1, severity: 'low', summary: `In ${file}.` })))] },
    undefined,
    paths.map(() => slow),
  );

  const { findings } = await engineFor(faux).review(files(paths));

  assert.equal(findings.length, 5);
  assert.equal(peak, 3);
});
