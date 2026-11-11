import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { estimateContextTokens } from '@earendil-works/pi-ai/utils/estimate';
import type { Finding, ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import {
  AgentReviewEngine,
  buildSystemPrompt,
  INSTRUCTIONS_STATEMENT,
  MAX_RUN_TRIES,
  SYSTEM_PROMPT,
} from './engine.ts';
import { focusOfCall, perFocus } from './fauxFocus.ts';
import { REVIEW_FOCUSES } from './focus.ts';
import { ReviewFailureError } from './findings.ts';
import { Batch } from './scope.ts';

// Tests for `add-multi-agent-review`: one agent for each review focus on every
// run scope, the merge, and the deduplication step. Most tests give a script to
// each focus with `perFocus`.

const LOGIC = 0;
const SECURITY = 1;
const RESOURCES = 2;

const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = [], resolved: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved } as never)], {
    stopReason: 'toolUse',
  });
}

function submitGroups(groups: number[][]) {
  return fauxAssistantMessage([fauxToolCall('submit_groups', { groups } as never)], { stopReason: 'toolUse' });
}

/** A change with one file of five added lines, so lines 1 to 5 can have findings. */
function context(overrides: Partial<ReviewContext> = {}): ReviewContext {
  const lines = ['+one', '+two', '+three', '+four', '+five'];
  return {
    title: 'Small change',
    description: '',
    changedFiles: [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -0,0 +1,5 @@', ...lines].join('\n') },
      { oldPath: 'b.ts', newPath: 'b.ts', hunks: ['@@ -0,0 +1,5 @@', ...lines].join('\n') },
    ],
    listDiscussions: async () => [],
    async getFileContent() {
      return { error: 'not used' };
    },
    ...overrides,
  };
}

function bigContext(count: number): ReviewContext {
  const lines = Array.from({ length: 400 }, (_, i) => `+const v${i} = "${'x'.repeat(70)}";`);
  return {
    title: 'Large change',
    description: '',
    changedFiles: Array.from({ length: count }, (_, i) => ({
      oldPath: `f${i + 1}.ts`,
      newPath: `f${i + 1}.ts`,
      hunks: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join('\n'),
    })),
    listDiscussions: async () => [],
    async getFileContent() {
      return '';
    },
  };
}

/** A window whose half holds one big file with the system message, but not two. */
const BATCH_WINDOW = 26_000;

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

// --- Review focuses and the system prompt ---

test('there are three review focuses, in a fixed order', () => {
  assert.deepEqual(
    REVIEW_FOCUSES.map((focus) => focus.name),
    ['logic correctness', 'security', 'resources and concurrency'],
  );
});

test('the paragraph of every review focus says it is a main area and not a limit', () => {
  for (const focus of REVIEW_FOCUSES) {
    assert.match(focus.paragraph, /main area, not a limit/);
    assert.match(focus.paragraph, /report it too/);
  }
});

test('buildSystemPrompt puts the review focus after the scope and before the review instructions and the language', () => {
  const focus = REVIEW_FOCUSES[SECURITY]!;
  const scope = new Batch([], 1, 2);
  const prompt = buildSystemPrompt('Japanese', scope, 'Skip naming problems.', focus);

  const parts = [
    SYSTEM_PROMPT,
    scope.systemPromptParagraph()!,
    focus.paragraph,
    INSTRUCTIONS_STATEMENT,
    'Skip naming problems.',
    'Write every "summary" in Japanese.',
  ];
  const positions = parts.map((part) => prompt.indexOf(part));
  assert.equal(positions.includes(-1), false);
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
});

test('buildSystemPrompt with no review focus gives the text that it gave before', () => {
  assert.equal(buildSystemPrompt(), SYSTEM_PROMPT);
});

// --- Runs ---

test('a change that fits one run scope runs three agents, one for each review focus', async () => {
  const faux = fauxProvider();
  perFocus(faux, {});
  const { logger, debugs } = recordingLogger();

  await engineFor(faux, { logger, instructions: 'Skip naming problems.' }).review(context());

  assert.equal(faux.state.callCount, 3);
  const prompts = debugs.filter((d) => 'prompt' in d) as { systemPrompt: string; prompt: string }[];
  assert.equal(prompts.length, 3);
  // The agents get the same user prompt and the same review instructions. They differ in the focus.
  assert.equal(new Set(prompts.map((p) => p.prompt)).size, 1);
  for (const p of prompts) assert.match(p.systemPrompt, /Skip naming problems\./);
  assert.deepEqual(
    prompts.map((p) => p.systemPrompt).sort(),
    REVIEW_FOCUSES.map((focus) => buildSystemPrompt(undefined, undefined, 'Skip naming problems.', focus)).sort(),
  );
});

test('a change in two batches runs six agents, three for each batch', async () => {
  const faux = fauxProvider();
  perFocus(faux, {});
  const { logger, debugs } = recordingLogger();

  await engineFor(faux, {
    logger,
    model: { ...faux.getModel(), contextWindow: BATCH_WINDOW },
  }).review(bigContext(2));

  assert.equal(faux.state.callCount, 6);
  const prompts = debugs.filter((d) => 'prompt' in d) as { batch: number }[];
  assert.deepEqual(prompts.map((p) => p.batch).sort(), [1, 1, 1, 2, 2, 2]);
});

test('the first request of every agent is within the budget, for every review focus', async () => {
  const faux = fauxProvider();
  const sizes: number[] = [];
  perFocus(faux, {
    [LOGIC]: [(ctx) => (sizes.push(estimateContextTokens(ctx.messages as never).tokens), submitReview())],
  });
  const model = { ...faux.getModel(), contextWindow: BATCH_WINDOW };
  const { logger, infos } = recordingLogger();

  await engineFor(faux, { model, logger }).review(bigContext(3));

  // The plan is the same for the three review focuses: three batches.
  assert.deepEqual(
    infos.filter((i) => 'batches' in i),
    [{ batches: 3 }],
  );
  assert.equal(faux.state.callCount, 9);
  // The prompt of a batch fits half of the window without its system message.
  for (const size of sizes) assert.ok(size <= BATCH_WINDOW / 2, `size ${size}`);
});

test('the three agents of one run scope run at the same time', async () => {
  const faux = fauxProvider();
  let active = 0;
  let peak = 0;
  const barrier = async () => {
    active += 1;
    peak = Math.max(peak, active);
    // Wait until all three agents are active, or give up.
    const start = Date.now();
    while (active < 3 && Date.now() - start < 2000) await new Promise((resolve) => setTimeout(resolve, 5));
    return submitReview();
  };
  perFocus(faux, { [LOGIC]: [barrier], [SECURITY]: [barrier], [RESOURCES]: [barrier] });

  await engineFor(faux).review(context());

  assert.equal(peak, 3);
});

// --- Merge ---

test('the merge lists the findings of the review focuses in their fixed order', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    [SECURITY]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'Security.' }])],
    [LOGIC]: [submitReview([{ file: 'b.ts', line: 1, severity: 'high', summary: 'Logic.' }])],
  });

  const { findings } = await engineFor(faux).review(context());

  assert.deepEqual(
    findings.map((f) => f.summary),
    ['Logic.', 'Security.'],
  );
});

test('two review focuses that declare the same discussion fixed give one declaration, from the first focus', async () => {
  const faux = fauxProvider();
  const discussion: ReviewDiscussion = {
    id: 'd1',
    file: 'a.ts',
    line: 1,
    positionCommit: 'old',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor('a.ts', 'for (;;)'),
    notes: [{ author: 'bot', body: 'Old.' }],
  };
  perFocus(faux, {
    [SECURITY]: [submitReview([], [{ discussionId: 'd1', reason: 'From security.' }])],
    [LOGIC]: [submitReview([], [{ discussionId: 'd1', reason: 'From logic.' }])],
  });
  const ctx = context({
    listDiscussions: async () => [discussion],
    async getFileContent() {
      return 'fixed();\n';
    },
  });

  const { resolved } = await engineFor(faux).review(ctx);

  assert.deepEqual(resolved, [{ discussionId: 'd1', reason: 'From logic.' }]);
});

test('each review focus writes one info line with the number of its findings', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'One.' },
          { file: 'b.ts', line: 1, severity: 'high', summary: 'Two.' },
        ]),
      ],
      [RESOURCES]: [submitReview([{ file: 'a.ts', line: 3, severity: 'low', summary: 'Three.' }])],
    },
    [submitGroups([[1, 3]])],
  );
  const { logger, infos } = recordingLogger();

  await engineFor(faux, { logger }).review(context());

  assert.deepEqual(
    infos.filter((i) => 'focus' in i),
    [
      { focus: 'logic correctness', findings: 2 },
      { focus: 'security', findings: 0 },
      { focus: 'resources and concurrency', findings: 1 },
    ],
  );
});

// --- Retry and failure ---

test('the retry line names the review focus', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    [SECURITY]: [fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Timed out.' }), submitReview()],
  });
  const { logger, warnings } = recordingLogger();

  await engineFor(faux, { logger }).review(context());

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.focus, 'security');
  assert.equal(warnings[0]!.attempt, 2);
});

test('a run of the whole change that fails names the review focus and the cause', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    [RESOURCES]: Array.from({ length: MAX_RUN_TRIES }, () =>
      fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Server error.' }),
    ),
  });

  await assert.rejects(
    () => engineFor(faux).review(context()),
    (error: unknown) =>
      error instanceof ReviewFailureError &&
      /^The agent for the resources and concurrency review focus failed: .*Server error\./.test(error.message),
  );
});

// --- Deduplication step ---

function findingsIn(files: [string, number][]): Record<string, unknown>[] {
  return files.map(([file, line]) => ({ file, line, severity: 'medium', summary: `${file}:${line}` }));
}

test('the deduplication step makes no model call when no file has two findings', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    [LOGIC]: [submitReview(findingsIn([['a.ts', 1]]))],
    [SECURITY]: [submitReview(findingsIn([['b.ts', 1]]))],
  });
  const { logger, infos } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(context());

  assert.equal(findings.length, 2);
  assert.equal(faux.state.callCount, 5);
  assert.equal(
    infos.some((i) => 'before' in i && !('rejected' in i)),
    false,
  );
});

test('the deduplication step runs once for two findings in one file, and keeps one of them', async () => {
  const faux = fauxProvider();
  const prompts: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'Low.' }])],
      [SECURITY]: [submitReview([{ file: 'a.ts', line: 2, severity: 'high', summary: 'High.' }])],
    },
    [(ctx) => (prompts.push(JSON.stringify(ctx.messages)), submitGroups([[1, 2]]))],
  );
  const { logger, infos } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(context());

  assert.equal(faux.state.callCount, 5);
  assert.deepEqual(
    findings.map((f) => f.summary),
    ['High.'],
  );
  assert.deepEqual(
    infos.filter((i) => 'before' in i && !('rejected' in i)),
    [{ before: 2, after: 1 }],
  );
  // The model gets the four fields and no other field.
  assert.equal(prompts.length, 1);
  assert.doesNotMatch(prompts[0]!, /anchor|relatesTo/);
});

test('the deduplication step sends only the findings of files that have two findings', async () => {
  const faux = fauxProvider();
  const prompts: string[] = [];
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview(
          findingsIn([
            ['a.ts', 1],
            ['b.ts', 1],
            ['a.ts', 2],
          ]),
        ),
      ],
    },
    [(ctx) => (prompts.push(JSON.stringify(ctx.messages)), submitGroups([[1], [3]]))],
  );

  const { findings } = await engineFor(faux).review(context());

  assert.equal(findings.length, 3);
  assert.match(prompts[0]!, /a\.ts:1/);
  assert.match(prompts[0]!, /a\.ts:2/);
  assert.doesNotMatch(prompts[0]!, /b\.ts:1/);
});

test('the deduplication step runs after the diff line check, so a dropped finding cannot win a group', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 999, severity: 'critical', summary: 'Outside the diff.' },
          { file: 'a.ts', line: 1, severity: 'low', summary: 'In the diff.' },
        ]),
      ],
    },
    [],
  );

  const { findings } = await engineFor(faux).review(context());

  // Only one finding stays in the file, so the step makes no call and no group drops the valid finding.
  assert.deepEqual(
    findings.map((f: Finding) => f.summary),
    ['In the diff.'],
  );
  assert.equal(faux.state.callCount, 4);
});

test('a result of the deduplication step that is not valid is corrected in the same run', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview(
          findingsIn([
            ['a.ts', 1],
            ['a.ts', 2],
          ]),
        ),
      ],
    },
    [submitGroups([[1]]), submitGroups([[1, 2]])],
  );
  const { logger, warnings } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(context());

  assert.equal(findings.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]!.error), /no group: 2/);
});

test('the review fails when the deduplication step gives no valid result on any try', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview(
          findingsIn([
            ['a.ts', 1],
            ['a.ts', 2],
          ]),
        ),
      ],
    },
    Array.from({ length: MAX_RUN_TRIES * 5 }, () => submitGroups([[1]])),
  );

  await assert.rejects(
    () => engineFor(faux).review(context()),
    (error: unknown) => error instanceof ReviewFailureError && /^The deduplication step failed: /.test(error.message),
  );
});

test('the deduplication step is tried again after an error', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview(
          findingsIn([
            ['a.ts', 1],
            ['a.ts', 2],
          ]),
        ),
      ],
    },
    [fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Timed out.' }), submitGroups([[1], [2]])],
  );
  const { logger, warnings } = recordingLogger();

  const { findings } = await engineFor(faux, { logger }).review(context());

  assert.equal(findings.length, 2);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.step, 'deduplication');
});

test('the review fails when the deduplication step fails on its last try', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview(
          findingsIn([
            ['a.ts', 1],
            ['a.ts', 2],
          ]),
        ),
      ],
    },
    Array.from({ length: MAX_RUN_TRIES }, () =>
      fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Server error.' }),
    ),
  );

  await assert.rejects(() => engineFor(faux).review(context()), /deduplication step failed: .*Server error\./);
});

test('the kept finding takes the relatesTo of the first finding of its group that has one', async () => {
  const faux = fauxProvider();
  const discussion: ReviewDiscussion = {
    id: 'd1',
    file: 'a.ts',
    line: 1,
    positionCommit: 'old',
    resolved: false,
    fromThisTool: false,
    anchor: null,
    notes: [{ author: 'person', body: 'Known.' }],
  };
  perFocus(
    faux,
    {
      [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'Low.', relatesTo: 'd1' }])],
      [SECURITY]: [submitReview([{ file: 'a.ts', line: 2, severity: 'high', summary: 'High.' }])],
    },
    [submitGroups([[1, 2]])],
  );

  const { findings } = await engineFor(faux).review(context({ listDiscussions: async () => [discussion] }));

  assert.deepEqual(
    findings.map(({ anchor: _anchor, ...rest }) => rest),
    [{ file: 'a.ts', line: 2, severity: 'high', summary: 'High.', relatesTo: 'd1' }],
  );
});

test('the agent for a review focus sees only its own focus', () => {
  // `focusOfCall` finds the focus of an agent from its system prompt.
  for (const [index, focus] of REVIEW_FOCUSES.entries()) {
    assert.equal(focusOfCall({ systemPrompt: buildSystemPrompt(undefined, undefined, undefined, focus) }), index);
  }
});

test('at most 3 agent runs are active at the same time, for all batches and review focuses', async () => {
  const faux = fauxProvider();
  let active = 0;
  let peak = 0;
  const slow = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return submitReview();
  };
  const script = Array.from({ length: 5 }, () => slow);
  perFocus(faux, { [LOGIC]: script, [SECURITY]: script, [RESOURCES]: script });

  await engineFor(faux, { model: { ...faux.getModel(), contextWindow: BATCH_WINDOW } }).review(bigContext(5));

  assert.equal(faux.state.callCount, 15);
  assert.equal(peak, 3);
});
