import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ReviewContext } from '../types.ts';
import { AgentReviewEngine, buildSystemPrompt, SYSTEM_PROMPT } from './engine.ts';
import { logicOnly, perFocus } from './fauxFocus.ts';
import { REVIEW_FOCUSES } from './focus.ts';
import { buildVerifySystemPrompt, validateVerdicts, VERIFY_SYSTEM_PROMPT } from './verify.ts';

// Tests for `fix-finding-line-accuracy`: the rule for the line in the prompt
// of the review agents, the evidence rules in the prompt of the verifier, and
// the `debug` line for each verdict.

const LOGIC = 0;

const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

function submitVerdicts(verdicts: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_verdicts', { verdicts } as never)], { stopReason: 'toolUse' });
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

/** A change with one file: a context line, a changed line, and a context line. */
function contextChange(): ReviewContext {
  return {
    title: 'Small change',
    description: '',
    changedFiles: [
      {
        oldPath: 'a.ts',
        newPath: 'a.ts',
        hunks: ['@@ -1,3 +1,3 @@', ' watch(', '-  old();', '+  changed();', ' );'].join('\n'),
      },
    ],
    listDiscussions: async () => [],
    async getFileContent() {
      return 'content';
    },
  };
}

/** A change with one file of five added lines. */
function fiveLines(): ReviewContext {
  const lines = ['+one', '+two', '+three', '+four', '+five'];
  return {
    title: 'Small change',
    description: '',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -0,0 +1,5 @@', ...lines].join('\n') }],
    listDiscussions: async () => [],
    async getFileContent() {
      return 'content';
    },
  };
}

function capturingLogger() {
  const debug: { fields: Record<string, unknown>; message: string }[] = [];
  const info: { fields: Record<string, unknown>; message: string }[] = [];
  const logger = {
    debug: (fields: Record<string, unknown>, message: string) => debug.push({ fields, message }),
    info: (fields: Record<string, unknown> | string, message?: string) =>
      info.push(typeof fields === 'string' ? { fields: {}, message: fields } : { fields, message: message ?? '' }),
    warn() {},
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, debug, info };
}

// --- The prompt of the review agents (task 1.1) ---

test('the prompt of a review agent tells it to report the line that holds the problem', () => {
  assert.match(SYSTEM_PROMPT, /Report in "line" the line that holds the problem\./);
});

test('the prompt of a review agent keeps a changed problem inside the added or changed lines', () => {
  assert.match(
    SYSTEM_PROMPT,
    /When the problem is in lines that the diff adds or changes, report a line of that run of added or changed lines, not a context line outside it\./,
  );
});

test('the prompt of a review agent allows the line of unchanged code for an unchanged problem', () => {
  assert.match(
    SYSTEM_PROMPT,
    /When the problem is in code that the diff does not change, report the line of that code that holds the problem\./,
  );
});

test('the prompt of a review agent tells it not to report the line that opens the block around the problem', () => {
  assert.match(
    SYSTEM_PROMPT,
    /Do not report the line that opens the function, the block, or the call around the problem, unless that line holds the problem\./,
  );
});

test('the rule for the line reaches the prompt of every review focus', () => {
  for (const focus of REVIEW_FOCUSES) {
    const prompt = buildSystemPrompt(undefined, undefined, undefined, focus);
    assert.match(prompt, /Report in "line" the line that holds the problem\./, focus.name);
    assert.match(prompt, /not a context line outside it/, focus.name);
  }
});

// --- The checks on the line do not change (task 1.2) ---

test('a finding on a context line of the diff is still kept', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview([{ file: 'a.ts', line: 1, severity: 'low', summary: 'On the context line.' }])]);

  const { findings } = await engineFor(faux).review(contextChange());

  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.line, 1);
});

test('a finding on a line that is not the line of the problem is still kept', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview([{ file: 'a.ts', line: 3, severity: 'low', summary: 'Problem is on line 2.' }])]);

  const { findings } = await engineFor(faux).review(contextChange());

  assert.equal(findings.length, 1);
});

// --- The prompt of the verifier (tasks 2.1 and 2.2) ---

test('the prompt of the verifier asks for a quote of the code in the reason', () => {
  assert.match(VERIFY_SYSTEM_PROMPT, /In the "reason", quote the code that shows your verdict\./);
  assert.match(VERIFY_SYSTEM_PROMPT, /from the line of the finding or from a line near it/);
});

test('the prompt of the verifier asks to reject a summary that the code contradicts', () => {
  assert.match(VERIFY_SYSTEM_PROMPT, /When the code contradicts the summary of the finding, use "rejected"\./);
  assert.match(VERIFY_SYSTEM_PROMPT, /the code of the line has the argument/);
});

test('the prompt of the verifier still names the three verdict values and keeps the order of its parts', () => {
  for (const value of ['confirmed', 'rejected', 'uncertain']) assert.match(VERIFY_SYSTEM_PROMPT, new RegExp(value));
  const verdicts = VERIFY_SYSTEM_PROMPT.indexOf('"uncertain":');
  const quote = VERIFY_SYSTEM_PROMPT.indexOf('quote the code');
  const severity = VERIFY_SYSTEM_PROMPT.indexOf('Also give the severity');
  assert.ok(verdicts > 0 && verdicts < quote && quote < severity);
  assert.ok(buildVerifySystemPrompt('Rule.').startsWith(VERIFY_SYSTEM_PROMPT));
});

test('submit_verdicts still accepts a valid verdict whose reason has no quote', () => {
  const verdicts = [{ number: 1, verdict: 'confirmed' as const, severity: 'high' as const, reason: 'It is a bug.' }];
  assert.deepEqual(validateVerdicts(verdicts, 1), verdicts);
});

// --- The debug line for each verdict (tasks 3.1 and 3.2) ---

test('every verdict gets one debug line with the file, the line, the verdict, the severity, and the reason', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    {
      [LOGIC]: [
        submitReview([
          { file: 'a.ts', line: 1, severity: 'high', summary: 'First.' },
          { file: 'a.ts', line: 3, severity: 'high', summary: 'Second.' },
          { file: 'a.ts', line: 5, severity: 'high', summary: 'Third.' },
        ]),
      ],
    },
    [
      fauxAssistantMessage([fauxToolCall('submit_groups', { groups: [[1], [2], [3]] } as never)], {
        stopReason: 'toolUse',
      }),
    ],
    [
      submitVerdicts([
        { number: 1, verdict: 'confirmed', severity: 'low', reason: 'Line 1 shows `one`.' },
        { number: 2, verdict: 'rejected', severity: 'high', reason: 'Line 3 shows `three`.' },
        { number: 3, verdict: 'uncertain', severity: 'medium', reason: 'Line 5 is not clear.' },
      ]),
    ],
  );
  const { logger, debug } = capturingLogger();

  await engineFor(faux, { logger }).review(fiveLines());

  const lines = debug.filter((entry) => entry.message === 'verification step verdict').map((entry) => entry.fields);
  assert.deepEqual(lines, [
    { file: 'a.ts', line: 1, verdict: 'confirmed', severity: 'low', reason: 'Line 1 shows `one`.' },
    { file: 'a.ts', line: 3, verdict: 'rejected', severity: 'high', reason: 'Line 3 shows `three`.' },
    { file: 'a.ts', line: 5, verdict: 'uncertain', severity: 'medium', reason: 'Line 5 is not clear.' },
  ]);
});

test('the verdict lines are debug lines only, and the info lines of the step do not change', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'First.' }])] },
    undefined,
    [submitVerdicts([{ number: 1, verdict: 'confirmed', severity: 'low', reason: 'Line 1 shows `one`.' }])],
  );
  const { logger, info } = capturingLogger();

  await engineFor(faux, { logger }).review(fiveLines());

  assert.equal(info.filter((entry) => entry.message === 'verification step verdict').length, 0);
  const summary = info.filter((entry) => /^Verification step: /.test(entry.message));
  assert.equal(summary.length, 1);
  assert.deepEqual(summary[0]!.fields, { before: 1, after: 1, rejected: 0, severityChanged: 1 });
});

test('a verification step with no finding writes no verdict line', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview()]);
  const { logger, debug } = capturingLogger();

  await engineFor(faux, { logger }).review(fiveLines());

  assert.equal(debug.filter((entry) => entry.message === 'verification step verdict').length, 0);
});
