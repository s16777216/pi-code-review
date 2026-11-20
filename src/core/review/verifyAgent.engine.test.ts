import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { FauxResponseStep } from '@earendil-works/pi-ai';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine } from './engine.ts';
import { perFocus } from './fauxFocus.ts';

// Tests for `add-verify-agent`: the engine runs the verify agent step after the
// discussion judgment step, one run for each file that has a discussion and at
// least one finding or declaration.

const LOGIC = 0;
const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings } as never)], { stopReason: 'toolUse' });
}

function submitJudgments(judgments: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_judgments', { judgments } as never)], { stopReason: 'toolUse' });
}

const fixed = (number: number) => ({ number, judgment: 'fixed', reason: 'Fixed in the code.' });

function submitDecisions(findings: Record<string, unknown>[], declarations: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_decisions', { findings, declarations } as never)], {
    stopReason: 'toolUse',
  });
}

const keep = (number: number, relatesTo: number | null = null) => ({
  number,
  decision: 'keep',
  relatesTo,
  reason: 'The code shows it.',
});
const drop = (number: number) => ({ number, decision: 'drop', reason: 'A person explained it.' });
const resolve = (number: number) => ({ number, decision: 'resolve', reason: 'The code is fixed.' });
const keepOpen = (number: number) => ({ number, decision: 'keep_open', reason: 'The problem is still there.' });

const error = () => fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });

function discussion(id: string, file: string, text: string, extra: Partial<ReviewDiscussion> = {}): ReviewDiscussion {
  return {
    id,
    file,
    line: 1,
    positionCommit: 'abc',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor(file, text),
    notes: [{ author: 'picr', body: `Note of ${id}.` }],
    ...extra,
  };
}

function contextFor(paths: string[], discussions: ReviewDiscussion[]): ReviewContext {
  return {
    title: 'Small change',
    description: '',
    changedFiles: paths.map((path) => ({
      oldPath: path,
      newPath: path,
      hunks: ['@@ -0,0 +1,3 @@', '+one', '+two', '+three'].join('\n'),
    })),
    listDiscussions: async () => discussions,
    async getFileContent() {
      return 'one\ntwo\nthree';
    },
  };
}

function recordingLogger() {
  const infos: Record<string, unknown>[] = [];
  const warnings: Record<string, unknown>[] = [];
  const debugs: { fields: Record<string, unknown>; message: string }[] = [];
  const messages: string[] = [];
  const logger = {
    debug: (fields: Record<string, unknown>, message: string) => debugs.push({ fields, message }),
    info: (fields: Record<string, unknown>, message: string) => (infos.push(fields), messages.push(message)),
    warn: (fields: Record<string, unknown>) => warnings.push(fields),
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, infos, warnings, debugs, messages };
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

/** The file of a run, read from its prompt. */
function fileOf(context: unknown): string {
  const text = JSON.stringify(context);
  return /refers to the new version of (.+?) at its commit/.exec(text)?.[1] ?? 'unknown';
}

/** A verify agent script that is as long as any test needs. It records the file of each run. */
function decideBy(
  runs: string[],
  answer: (file: string, call: number, context: unknown) => ReturnType<typeof submitDecisions>,
) {
  const calls = new Map<string, number>();
  const step: FauxResponseStep = (context) => {
    const file = fileOf(context);
    runs.push(file);
    const call = (calls.get(file) ?? 0) + 1;
    calls.set(file, call);
    return answer(file, call, context);
  };
  return Array.from({ length: 100 }, () => step);
}

const judgeFixedAll = () => [
  ...Array.from({ length: 100 }, () => (() => submitJudgments([fixed(1)])) as FauxResponseStep),
];

// --- When a run starts ---

test('a file with a discussion and a finding gets one verify agent run', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A is wrong.' }])] },
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => submitDecisions([keep(1)])),
  );

  await engineFor(faux).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.deepEqual(runs, ['a.ts']);
});

test('a file with a discussion and a declaration gets one verify agent run', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => submitDecisions([], [resolve(1)])),
  );

  const result = await engineFor(faux).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone')]));

  assert.deepEqual(runs, ['a.ts']);
  assert.deepEqual(result.resolved, [{ discussionId: 'd1', reason: 'The code is fixed.' }]);
});

test('a file with a finding and no discussion gets no run, and the finding stays', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'b.ts', line: 1, severity: 'high', summary: 'B is wrong.' }])] },
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => submitDecisions([drop(1)])),
  );

  const result = await engineFor(faux).review(contextFor(['a.ts', 'b.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.deepEqual(runs, []);
  assert.deepEqual(
    result.findings.map((finding) => finding.file),
    ['b.ts'],
  );
});

test('a file with a discussion and nothing to decide gets no run', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => submitDecisions([])),
  );

  await engineFor(faux).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.deepEqual(runs, []);
});

test('the verify agent step runs after the judgment step and gets its declarations', async () => {
  const faux = fauxProvider();
  const order: string[] = [];
  const decidePrompts: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    Array.from({ length: 100 }, () => (() => (order.push('judge'), submitJudgments([fixed(1)]))) as FauxResponseStep),
    Array.from(
      { length: 100 },
      () =>
        ((context: unknown) => (
          order.push('decide'),
          decidePrompts.push(JSON.stringify(context)),
          submitDecisions([], [resolve(1)])
        )) as FauxResponseStep,
    ),
  );

  await engineFor(faux).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone')]));

  assert.deepEqual(order, ['judge', 'decide']);
  assert.ok(decidePrompts[0]!.includes('Fixed in the code.'));
});

// --- What the decisions do ---

test('a dropped finding leaves the result, and a kept finding gets the chosen discussion', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'One.' },
          { file: 'a.ts', line: 2, severity: 'high', summary: 'Two.' },
          { file: 'a.ts', line: 3, severity: 'high', summary: 'Three.', relatesTo: 'd1' },
        ]),
      ],
    },
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => submitDecisions([drop(1), keep(2, 2), keep(3, null)])),
  );

  const result = await engineFor(faux).review(
    contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x'), discussion('d2', 'a.ts', 'y', { resolved: true })]),
  );

  assert.deepEqual(
    result.findings.map((finding) => [finding.summary, finding.relatesTo]),
    [
      ['Two.', 'd2'],
      ['Three.', undefined],
    ],
  );
  assert.equal('relatesTo' in result.findings[1]!, false);
});

test('a declaration that the agent keeps open does not resolve the discussion', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => submitDecisions([], [keepOpen(1)])),
  );

  const result = await engineFor(faux).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone')]));

  assert.deepEqual(result.resolved, []);
});

test('the verify agent resolves a discussion whose anchored line is still in the file, with no warn line and no file read', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => submitDecisions([], [resolve(1)])),
  );
  const { logger, warnings } = recordingLogger();
  let reads = 0;
  const context = contextFor(['a.ts'], [discussion('d1', 'a.ts', 'two')]);
  context.getFileContent = async () => {
    reads += 1;
    return 'one\ntwo';
  };

  // The anchored line "two" is still in the file, and no rule of the code rejects the resolve.
  const result = await engineFor(faux, { logger }).review(context);

  assert.deepEqual(result.resolved, [{ discussionId: 'd1', reason: 'The code is fixed.' }]);
  assert.equal(
    warnings.some((fields) => fields.discussionId === 'd1'),
    false,
  );
  assert.equal(reads, 0);
});

test('a declaration that stays open gets no warn line', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => submitDecisions([], [keepOpen(1)])),
  );
  const { logger, warnings } = recordingLogger();

  await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'two')]));

  assert.equal(
    warnings.some((fields) => fields.discussionId === 'd1'),
    false,
  );
});

// --- Failures ---

test('a failed run keeps the findings with no relatesTo, resolves nothing, and adds no warning', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A.', relatesTo: 'd1' }])] },
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => error() as never),
  );
  const { logger, warnings } = recordingLogger();

  const result = await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone')]));

  assert.deepEqual(
    result.findings.map((finding) => [finding.summary, finding.relatesTo]),
    [['A.', undefined]],
  );
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(warnings.some((fields) => fields.file === 'a.ts' && typeof fields.error === 'string' && !fields.attempt));
});

test('the other files are still decided when one run fails', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    Array.from({ length: 100 }, () => (() => submitJudgments([fixed(1)])) as FauxResponseStep),
    decideBy(runs, (file) => (file === 'a.ts' ? (error() as never) : submitDecisions([], [resolve(1)]))),
  );

  const result = await engineFor(faux).review(
    contextFor(['a.ts', 'b.ts'], [discussion('d1', 'a.ts', 'gone'), discussion('d2', 'b.ts', 'gone')]),
  );

  assert.deepEqual(
    result.resolved.map((item) => item.discussionId),
    ['d2'],
  );
});

test('a first request that is too large starts no run, keeps the findings, and writes a warn line', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A is wrong.' }])] },
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => submitDecisions([drop(1)])),
  );
  const { logger, warnings } = recordingLogger();
  const long = discussion('d1', 'a.ts', 'x', { notes: [{ author: 'sam', body: 'long '.repeat(6000) }] });

  const result = await engineFor(faux, { logger, model: { ...faux.getModel(), contextWindow: 7000 } }).review(
    contextFor(['a.ts'], [long]),
  );

  assert.deepEqual(runs, []);
  assert.equal(result.findings.length, 1);
  assert.ok(warnings.some((fields) => fields.file === 'a.ts' && 'tokens' in fields));
});

// --- Logs ---

test('the step writes one summary line, and one debug line for each decision', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'One.' },
          { file: 'a.ts', line: 2, severity: 'high', summary: 'Two.' },
        ]),
      ],
    },
    undefined,
    undefined,
    judgeFixedAll(),
    decideBy(runs, () => submitDecisions([keep(1), drop(2)], [resolve(1)])),
  );
  const { logger, infos, debugs, messages } = recordingLogger();

  await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone')]));

  const summary = infos.find((fields) => 'leftOpen' in fields);
  assert.deepEqual(summary, { files: 1, kept: 1, dropped: 1, resolved: 1, leftOpen: 0 });
  assert.ok(messages.some((message) => message.startsWith('Verify agent step: 1 file(s)')));
  assert.equal(debugs.filter((entry) => entry.message.startsWith('verify agent decision')).length, 3);
});

test('a failed file is not counted in the summary line', async () => {
  const faux = fauxProvider();
  const runs: string[] = [];
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'One.' }])] },
    undefined,
    undefined,
    undefined,
    decideBy(runs, () => error() as never),
  );
  const { logger, infos } = recordingLogger();

  await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  const summary = infos.find((fields) => 'leftOpen' in fields);
  assert.deepEqual(summary, { files: 0, kept: 0, dropped: 0, resolved: 0, leftOpen: 0 });
});
