import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { FauxResponseStep } from '@earendil-works/pi-ai';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine, REVIEW_PRIORITY, runPool, RunLimit, STEP_PRIORITY } from './engine.ts';
import { perFocus } from './fauxFocus.ts';

// Tests for `run-judge-with-review-agents`: one limit of 3 runs for all steps,
// the judge that starts with the review agents, and the stop of the judge when
// the review fails.

const LOGIC = 0;
const SECURITY = 1;
const RESOURCES = 2;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function submitReview() {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings: [] } as never)], { stopReason: 'toolUse' });
}

function submitJudgments() {
  return fauxAssistantMessage(
    [
      fauxToolCall('submit_judgments', {
        judgments: [{ number: 1, judgment: 'uncertain', reason: 'Not sure.' }],
      } as never),
    ],
    { stopReason: 'toolUse' },
  );
}

const failing = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });

function discussion(id: string, file: string): ReviewDiscussion {
  return {
    id,
    file,
    line: 1,
    positionCommit: 'abc',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor(file, 'x'),
    notes: [{ author: 'picr', body: `Note of ${id}.` }],
  };
}

/** `count` changed files. Each file in `discussed` has one open discussion of this tool. */
function contextFor(
  count: number,
  discussed: string[],
  listDiscussions?: ReviewContext['listDiscussions'],
  lineCount = 3,
): ReviewContext {
  const lines = Array.from({ length: lineCount }, (_, i) => `+const v${i} = "${'x'.repeat(lineCount > 3 ? 70 : 1)}";`);
  return {
    title: 'Change',
    description: '',
    changedFiles: Array.from({ length: count }, (_, i) => ({
      oldPath: `f${i + 1}.ts`,
      newPath: `f${i + 1}.ts`,
      hunks: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join('\n'),
    })),
    listDiscussions: listDiscussions ?? (async () => discussed.map((file, i) => discussion(`d${i + 1}`, file))),
    async getFileContent() {
      return 'one\ntwo\nthree';
    },
  };
}

function engineFor(faux: ReturnType<typeof fauxProvider>, options: { contextWindow?: number } = {}) {
  const model = faux.getModel();
  return new AgentReviewEngine({
    provider: faux.provider,
    model: options.contextWindow === undefined ? model : { ...model, contextWindow: options.contextWindow },
    apiKey: 'k',
    sleep: async () => {},
  });
}

// --- The shared limit ---

test('two pools on one limit never run more than 3 jobs at the same time', async () => {
  const limit = new RunLimit(3);
  let active = 0;
  let peak = 0;
  const job = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await wait(5);
    active -= 1;
  };
  await Promise.all([runPool(limit, REVIEW_PRIORITY, 7, job), runPool(limit, STEP_PRIORITY, 5, job)]);
  assert.equal(peak, 3);
  assert.equal(active, 0);
});

test('a job that throws gives back its slot', async () => {
  const limit = new RunLimit(3);
  const failures = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      runPool(limit, REVIEW_PRIORITY, 1, async () => {
        throw new Error('boom');
      }),
    ),
  );
  assert.equal(failures.filter((f) => f.status === 'rejected').length, 4);
  // All 3 slots are free again: three jobs can start at once.
  let started = 0;
  await runPool(limit, REVIEW_PRIORITY, 3, async () => {
    started += 1;
    await wait(5);
    assert.equal(started, 3);
  });
});

test('a pool with fewer jobs than 3 runs all of them at the same time', async () => {
  const limit = new RunLimit(3);
  let active = 0;
  let peak = 0;
  await runPool(limit, REVIEW_PRIORITY, 2, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await wait(5);
    active -= 1;
  });
  assert.equal(peak, 2);
});

test('a waiting job of a higher priority number starts after the waiting jobs of a lower one, and equal ones in the order of the requests', async () => {
  const limit = new RunLimit(1);
  const order: string[] = [];
  await limit.acquire(0);
  const waiting = [
    limit.acquire(1).then(() => order.push('step1')),
    limit.acquire(0).then(() => order.push('review')),
    limit.acquire(1).then(() => order.push('step2')),
  ];
  // Each waiter gives its slot back when it has run.
  const done = (async () => {
    for (let i = 0; i < 3; i += 1) {
      await wait(2);
      limit.release();
    }
  })();
  limit.release();
  await Promise.all([...waiting, done]);
  assert.deepEqual(order, ['review', 'step1', 'step2']);
});

// --- The judge starts with the review agents ---

test('the judge call starts before the last review agent call ends', async () => {
  const faux = fauxProvider();
  const events: string[] = [];
  const slow: FauxResponseStep = async () => {
    await wait(40);
    events.push('logic ended');
    return submitReview();
  };
  const judge: FauxResponseStep = () => {
    events.push('judge started');
    return submitJudgments();
  };
  perFocus(faux, { [LOGIC]: [slow] }, undefined, undefined, [judge]);

  await engineFor(faux).review(contextFor(1, ['f1.ts']));

  assert.deepEqual(events, ['judge started', 'logic ended']);
});

// --- The review fails ---

test('a failed review starts no new judge run, and reports the failure of the review agent run', async () => {
  const faux = fauxProvider();
  let judgeCalls = 0;
  const judge: FauxResponseStep = () => {
    judgeCalls += 1;
    return submitJudgments();
  };
  const slow: FauxResponseStep = async () => {
    await wait(20);
    return submitReview();
  };
  perFocus(
    faux,
    { [LOGIC]: [failing, failing, failing], [SECURITY]: [slow], [RESOURCES]: [slow] },
    undefined,
    undefined,
    [judge, judge, judge],
  );

  await assert.rejects(engineFor(faux).review(contextFor(3, ['f1.ts', 'f2.ts', 'f3.ts'])), /logic correctness/);
  await wait(50);

  assert.equal(judgeCalls, 0);
});

test('a judge run that fails after the review failed leaves no unhandled rejection', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [failing, failing, failing] }, undefined, undefined, []);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const context = contextFor(1, [], async () => {
      await wait(30);
      throw new Error('The list of discussions broke.');
    });
    await assert.rejects(engineFor(faux).review(context), /logic correctness/);
    await wait(80);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

// --- Review runs and judge runs share the limit ---

test('at most 3 of 6 review agent runs and 2 judge runs are active at the same time', async () => {
  const faux = fauxProvider();
  let active = 0;
  let peak = 0;
  const tracked = (answer: () => ReturnType<typeof submitReview>): FauxResponseStep => {
    return async () => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(15);
      active -= 1;
      return answer();
    };
  };
  const review = tracked(submitReview);
  const judge = tracked(submitJudgments);
  const script = [review, review];
  perFocus(faux, { [LOGIC]: script, [SECURITY]: script, [RESOURCES]: script }, undefined, undefined, [judge, judge]);

  await engineFor(faux, { contextWindow: 26_000 }).review(contextFor(2, ['f1.ts', 'f2.ts'], undefined, 400));

  assert.equal(faux.state.callCount, 8);
  assert.equal(peak, 3);
});
