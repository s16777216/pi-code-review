import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { FauxResponseStep } from '@earendil-works/pi-ai';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine } from './engine.ts';
import { perFocus } from './fauxFocus.ts';

// Tests for `judge-open-discussions`: the engine runs the discussion judgment
// step after the verification step, one judge run for each file.

const LOGIC = 0;
const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

function submitJudgments(judgments: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_judgments', { judgments } as never)], { stopReason: 'toolUse' });
}

function judgment(number: number, value: string, reason = 'The code shows it.') {
  return { number, judgment: value, reason };
}

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

function contextFor(
  paths: string[],
  discussions: ReviewDiscussion[] | { error: string },
  overrides: Partial<ReviewContext> = {},
): ReviewContext {
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
    ...overrides,
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

/** The file of a judge run, read from its prompt. */
function fileOf(context: unknown): string {
  const text = JSON.stringify(context);
  return /refers to the new version of (.+?) at its commit/.exec(text)?.[1] ?? 'unknown';
}

/** A judge script that is as long as any test needs, and picks each answer by file. */
function judgeBy(answer: (file: string, call: number, context: unknown) => ReturnType<typeof submitJudgments>) {
  const calls = new Map<string, number>();
  const step: FauxResponseStep = (context) => {
    const file = fileOf(context);
    const call = (calls.get(file) ?? 0) + 1;
    calls.set(file, call);
    return answer(file, call, context);
  };
  return Array.from({ length: 100 }, () => step);
}

// --- Selection and no model call ---

test('the judgment step makes no model call when no discussion is selected', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, []);
  const picked = [
    discussion('d1', 'a.ts', 'x', { fromThisTool: false }),
    discussion('d2', 'a.ts', 'x', { resolved: true }),
    discussion('d3', 'a.ts', 'x', { anchor: null }),
  ];

  await engineFor(faux).review(contextFor(['a.ts'], picked));

  assert.equal(faux.state.callCount, 3);
});

test('the judgment step makes no model call when listDiscussions returns an error object', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, []);

  const result = await engineFor(faux).review(contextFor(['a.ts'], { error: 'Failed to list discussions: 500' }));

  assert.equal(faux.state.callCount, 3);
  assert.deepEqual(result.resolved, []);
});

test('a discussion that a finding links to is still judged', async () => {
  const faux = fauxProvider();
  const judgePrompts: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'A is wrong.', relatesTo: 'd1' },
          { file: 'b.ts', line: 1, severity: 'high', summary: 'B is wrong.', relatesTo: 'd2' },
        ]),
      ],
    },
    undefined,
    undefined,
    judgeBy(
      (_file, _call, context) => (
        judgePrompts.push(JSON.stringify(context)),
        submitJudgments([judgment(1, 'uncertain')])
      ),
    ),
  );
  const discussions = [discussion('d1', 'a.ts', 'x'), discussion('d2', 'b.ts', 'x')];

  const { findings } = await engineFor(faux).review(contextFor(['a.ts', 'b.ts'], discussions));

  assert.equal(findings.length, 2);
  assert.equal(judgePrompts.length, 2);
  assert.ok(judgePrompts.some((prompt) => prompt.includes('Note of d1.')));
  assert.ok(judgePrompts.some((prompt) => prompt.includes('Note of d2.')));
});

test('a fixed judgment for a discussion that a finding links to stays open when the verify agent keeps the finding', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'A is wrong.' }])] },
    undefined,
    undefined,
    judgeBy(() => submitJudgments([judgment(1, 'fixed')])),
    [
      fauxAssistantMessage(
        [
          fauxToolCall('submit_decisions', {
            findings: [{ number: 1, decision: 'keep', relatesTo: 1, reason: 'The same problem.' }],
            declarations: [{ number: 1, decision: 'keep_open', reason: 'The finding is still open.' }],
          } as never),
        ],
        { stopReason: 'toolUse' },
      ),
    ],
  );
  const { logger, warnings } = recordingLogger();

  const { resolved, findings } = await engineFor(faux, { logger }).review(
    contextFor(['a.ts'], [discussion('d1', 'a.ts', 'gone line')]),
  );

  assert.deepEqual(resolved, []);
  assert.equal(findings[0]?.relatesTo, 'd1');
  assert.equal(
    warnings.some((warning) => warning.discussionId === 'd1'),
    false,
  );
});

// --- Shared run rules ---

test('the judgment step runs at most 3 judge runs at the same time', async () => {
  const faux = fauxProvider();
  let active = 0;
  let maxActive = 0;
  const step: FauxResponseStep = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return submitJudgments([judgment(1, 'uncertain')]);
  };
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    Array.from({ length: 5 }, () => step),
  );
  const paths = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];

  await engineFor(faux).review(
    contextFor(
      paths,
      paths.map((path, i) => discussion(`d${i}`, path, 'x')),
    ),
  );

  assert.equal(faux.state.callCount, 8);
  assert.equal(maxActive, 3);
});

test('a judge run with a first try that ends with an error is tried again, and the log names the file', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeBy((_file, call) => (call === 1 ? (error() as never) : submitJudgments([judgment(1, 'uncertain')]))),
  );
  const { logger, warnings } = recordingLogger();

  await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.equal(faux.state.callCount, 5);
  const retry = warnings.find((fields) => fields.attempt === 2);
  assert.equal(retry?.file, 'a.ts');
  assert.equal(retry?.step, 'discussion_judgment');
});

// --- Failures ---

test('a failed judge run gives no declaration, writes a warn line, and the other files are still judged', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeBy((file) => (file === 'a.ts' ? (error() as never) : submitJudgments([judgment(1, 'fixed')]))),
  );
  const { logger, warnings, infos, messages } = recordingLogger();
  const discussions = [discussion('d1', 'a.ts', 'gone'), discussion('d2', 'b.ts', 'gone')];

  const result = await engineFor(faux, { logger }).review(contextFor(['a.ts', 'b.ts'], discussions));

  assert.deepEqual(
    result.resolved.map((item) => item.discussionId),
    ['d2'],
  );
  assert.deepEqual(result.warnings, []);
  const failure = warnings.find(
    (fields) => fields.file === 'a.ts' && typeof fields.error === 'string' && !fields.attempt,
  );
  assert.ok(failure);
  // The discussion of the failed file counts as selected and in no judgment value.
  const summary = infos.find((fields) => 'selected' in fields);
  assert.deepEqual(summary, { selected: 2, fixed: 1, notFixed: 0, uncertain: 0 });
  assert.ok(messages.some((message) => message.startsWith('Discussion judgment step: 2 discussion(s) selected')));
});

test('a judge run that stops with aborted gives no declaration and does not fail the review', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeBy(() => fauxAssistantMessage('', { stopReason: 'aborted', errorMessage: 'Aborted.' }) as never),
  );
  const { logger, warnings } = recordingLogger();

  const result = await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(warnings.some((fields) => fields.file === 'a.ts' && typeof fields.error === 'string'));
});

test('a judge run that stays at the token limit gives no declaration and does not fail the review', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {},
    undefined,
    undefined,
    judgeBy(() => fauxAssistantMessage('cut', { stopReason: 'length' }) as never),
  );
  const { logger, warnings } = recordingLogger();

  const result = await engineFor(faux, { logger }).review(contextFor(['a.ts'], [discussion('d1', 'a.ts', 'x')]));

  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(warnings.some((fields) => fields.file === 'a.ts' && typeof fields.error === 'string'));
});

test('a judge run whose first request is larger than half of the context window makes no model call', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, []);
  const { logger, warnings } = recordingLogger();
  const big = discussion('d1', 'a.ts', 'x', { notes: [{ author: 'picr', body: 'word '.repeat(20_000) }] });
  const model = { ...faux.getModel(), contextWindow: 30_000 };

  const result = await engineFor(faux, { logger, model }).review(contextFor(['a.ts'], [big]));

  assert.equal(faux.state.callCount, 3);
  assert.deepEqual(result.warnings, []);
  assert.ok(warnings.some((fields) => fields.file === 'a.ts' && typeof fields.tokens === 'number'));
});

// --- Logs and output ---

test('the judgment step writes a summary, a line for each fixed judgment, and a debug line for each judgment', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [
    submitJudgments([
      judgment(1, 'fixed', 'Gone.'),
      judgment(2, 'not_fixed', 'Still there.'),
      judgment(3, 'uncertain'),
    ]),
  ]);
  const { logger, infos, debugs, messages } = recordingLogger();
  const discussions = [
    discussion('d1', 'a.ts', 'gone', { line: 1 }),
    discussion('d2', 'a.ts', 'gone', { line: 2 }),
    discussion('d3', 'a.ts', 'gone', { line: 3 }),
  ];

  await engineFor(faux, { logger }).review(contextFor(['a.ts'], discussions));

  assert.deepEqual(
    infos.find((fields) => 'selected' in fields),
    { selected: 3, fixed: 1, notFixed: 1, uncertain: 1 },
  );
  assert.ok(
    messages.includes('Discussion judgment step: 3 discussion(s) selected, 1 fixed, 1 not fixed, 1 uncertain.'),
  );
  assert.deepEqual(
    infos.find((fields) => 'discussionId' in fields),
    { file: 'a.ts', line: 1, discussionId: 'd1', reason: 'Gone.' },
  );
  const judgments = debugs.filter((entry) => entry.message === 'discussion judgment').map((entry) => entry.fields);
  assert.deepEqual(judgments, [
    { file: 'a.ts', line: 1, judgment: 'fixed', reason: 'Gone.' },
    { file: 'a.ts', line: 2, judgment: 'not_fixed', reason: 'Still there.' },
    { file: 'a.ts', line: 3, judgment: 'uncertain', reason: 'The code shows it.' },
  ]);
  // The prompt of a judge run uses the existing 'review prompt' debug line.
  const prompts = debugs.filter(
    (entry) => entry.message === 'review prompt' && entry.fields.step === 'discussion_judgment',
  );
  assert.equal(prompts.length, 1);
});

test('the review result has no field for a judgment', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [submitJudgments([judgment(1, 'fixed', 'Gone.')])]);
  const gone = discussion('d1', 'a.ts', 'gone');

  const result = await engineFor(faux).review(contextFor(['a.ts'], [gone]));

  assert.deepEqual(Object.keys(result).sort(), ['findings', 'resolved', 'unreviewedFiles', 'warnings']);
  assert.deepEqual(result.resolved, [{ discussionId: 'd1', reason: 'The code shows it.' }]);
  assert.equal(JSON.stringify(result).includes('judgment'), false);
});

// --- End to end ---

test('the verify agent resolves each fixed judgment, with no warn line for a discussion whose anchor is present', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [
    submitJudgments([
      judgment(1, 'fixed', 'The line is gone.'),
      judgment(2, 'fixed', 'It looks fixed.'),
      judgment(3, 'not_fixed', 'The code still has it.'),
      judgment(4, 'uncertain', 'Cannot tell.'),
    ]),
  ]);
  const { logger, warnings } = recordingLogger();
  const discussions = [
    discussion('d1', 'a.ts', 'removed line'),
    discussion('d2', 'a.ts', 'two'),
    discussion('d3', 'a.ts', 'three'),
    discussion('d4', 'a.ts', 'three'),
  ];

  const result = await engineFor(faux, { logger }).review(contextFor(['a.ts'], discussions));

  assert.deepEqual(
    result.resolved.map((item) => item.discussionId),
    ['d1', 'd2'],
  );
  // No rule of the code checks a resolve (`remove-evidence-line`).
  assert.equal(
    warnings.some((fields) => 'comparison' in fields || 'reason' in fields),
    false,
  );
});

// --- No evidence line (`remove-evidence-line`) ---

const evidenceContent = 'one\nreturn guard(value);\ntwo';

function evidenceContext(discussions: ReviewDiscussion[]) {
  return contextFor(['a.ts'], discussions, { getFileContent: async () => evidenceContent });
}

test('a call of the judge with an evidence field is accepted, and the declaration resolves with no log of the line', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [
    submitJudgments([{ ...judgment(1, 'fixed', 'The guard is new.'), evidence: 'return guard(value);' }]),
  ]);
  const { logger, infos, warnings } = recordingLogger();

  const result = await engineFor(faux, { logger }).review(evidenceContext([discussion('d1', 'a.ts', 'two')]));

  assert.deepEqual(result.resolved, [{ discussionId: 'd1', reason: 'The code shows it.' }]);
  assert.equal(
    infos.some((fields) => 'evidence' in fields),
    false,
  );
  assert.deepEqual(warnings, []);
});

test('the findings result has no field for the evidence line', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [
    submitJudgments([{ ...judgment(1, 'fixed', 'The guard is new.'), evidence: 'return guard(value);' }]),
  ]);

  const result = await engineFor(faux).review(evidenceContext([discussion('d1', 'a.ts', 'two')]));

  assert.equal(JSON.stringify(result).includes('evidence'), false);
});

test('four fixed judgments with or without an evidence field: the verify agent resolves all, with no warn line', async () => {
  const faux = fauxProvider();
  perFocus(faux, {}, undefined, undefined, [
    submitJudgments([
      judgment(1, 'fixed', 'The line is gone.'),
      { ...judgment(2, 'fixed', 'The guard is new.'), evidence: 'return guard(value);' },
      { ...judgment(3, 'fixed', 'Invented.'), evidence: 'return other(value);' },
      judgment(4, 'fixed', 'No evidence.'),
    ]),
  ]);
  const { logger, warnings } = recordingLogger();
  const discussions = [
    discussion('d1', 'a.ts', 'removed line'),
    discussion('d2', 'a.ts', 'two'),
    discussion('d3', 'a.ts', 'two'),
    discussion('d4', 'a.ts', 'two'),
  ];

  const result = await engineFor(faux, { logger }).review(evidenceContext(discussions));

  assert.deepEqual(
    result.resolved.map((item) => item.discussionId),
    ['d1', 'd2', 'd3', 'd4'],
  );
  assert.deepEqual(warnings, []);
});
