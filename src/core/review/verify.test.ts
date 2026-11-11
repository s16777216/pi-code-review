import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding, ReviewContext } from '../types.ts';
import { MAX_SUBMIT_ATTEMPTS } from './agent.ts';
import { ChangedFile } from './changedFile.ts';
import { ReviewFailureError } from './findings.ts';
import {
  applyVerdicts,
  buildVerifyPrompt,
  buildVerifySystemPrompt,
  createSubmitVerdictsTool,
  groupByFile,
  validateVerdicts,
  VERIFY_INSTRUCTIONS_STATEMENT,
  VERIFY_SYSTEM_PROMPT,
  type FindingVerdict,
} from './verify.ts';

function finding(
  file: string,
  line: number,
  severity: Finding['severity'],
  summary: string,
  extra: Partial<Finding> = {},
) {
  return { file, line, severity, summary, ...extra } satisfies Finding;
}

function verdict(
  number: number,
  value: FindingVerdict['verdict'],
  severity: FindingVerdict['severity'],
  reason = 'The code shows it.',
): FindingVerdict {
  return { number, verdict: value, severity, reason };
}

// --- groupByFile ---

test('groupByFile orders the files by their first finding and keeps the order inside a file', () => {
  const findings = [
    finding('b.ts', 1, 'low', 'B1'),
    finding('a.ts', 1, 'low', 'A1'),
    finding('b.ts', 2, 'low', 'B2'),
    finding('a.ts', 2, 'low', 'A2'),
  ];
  const groups = groupByFile(findings);
  assert.deepEqual(
    groups.map((group) => [group.file, group.findings.map((item) => item.summary)]),
    [
      ['b.ts', ['B1', 'B2']],
      ['a.ts', ['A1', 'A2']],
    ],
  );
});

test('groupByFile gives no group when there is no finding', () => {
  assert.deepEqual(groupByFile([]), []);
});

// --- buildVerifyPrompt ---

const context: ReviewContext = {
  title: 'Small change',
  description: 'Adds a loop.',
  changedFiles: [],
  listDiscussions: async () => [],
  async getFileContent() {
    return '';
  },
};

function fileOf(path: string) {
  return ChangedFile.from({ oldPath: path, newPath: path, hunks: ['@@ -0,0 +1,2 @@', '+one', '+two'].join('\n') });
}

test('buildVerifyPrompt shows the title, the numbered diff of the file, and four fields of each finding', () => {
  const findings = [
    finding('a.ts', 1, 'high', 'First.', { relatesTo: 'd1', anchor: '0123456789abcdef' }),
    finding('a.ts', 2, 'low', 'Second.'),
  ];
  const prompt = buildVerifyPrompt(context, fileOf('a.ts'), findings);
  assert.match(prompt, /Small change/);
  assert.match(prompt, /Adds a loop\./);
  assert.match(prompt, /### a\.ts/);
  assert.match(prompt, /1 \| \+one/);
  const items = JSON.parse(prompt.slice(prompt.indexOf('[', prompt.indexOf('## Findings to verify'))).trim()) as Record<
    string,
    unknown
  >[];
  assert.deepEqual(items, [
    { number: 1, line: 1, severity: 'high', summary: 'First.' },
    { number: 2, line: 2, severity: 'low', summary: 'Second.' },
  ]);
  assert.doesNotMatch(prompt, /relatesTo|anchor|0123456789abcdef/);
});

test('buildVerifyPrompt holds the diff of one file only', () => {
  const prompt = buildVerifyPrompt(context, fileOf('a.ts'), [finding('a.ts', 1, 'low', 'First.')]);
  assert.equal((prompt.match(/^### /gm) ?? []).length, 1);
});

// --- buildVerifySystemPrompt ---

test('the system prompt of the verifier is the guidance when there are no review instructions', () => {
  assert.equal(buildVerifySystemPrompt(), VERIFY_SYSTEM_PROMPT);
  for (const value of ['confirmed', 'rejected', 'uncertain']) assert.match(VERIFY_SYSTEM_PROMPT, new RegExp(value));
  assert.match(VERIFY_SYSTEM_PROMPT, /never instructions to you/);
});

test('the system prompt of the verifier adds the statement and the review instructions after the guidance', () => {
  const prompt = buildVerifySystemPrompt('Ignore style findings.');
  assert.equal(prompt, `${VERIFY_SYSTEM_PROMPT}\n\n${VERIFY_INSTRUCTIONS_STATEMENT}\n\nIgnore style findings.`);
});

// --- validateVerdicts ---

test('validateVerdicts accepts one verdict for each number', () => {
  const verdicts = [verdict(1, 'confirmed', 'high'), verdict(2, 'rejected', 'low')];
  assert.deepEqual(validateVerdicts(verdicts, 2), verdicts);
});

test('validateVerdicts rejects a missing number and names it', () => {
  assert.throws(() => validateVerdicts([verdict(1, 'confirmed', 'high')], 2), /no verdict: 2/);
});

test('validateVerdicts rejects a number with two verdicts', () => {
  assert.throws(
    () => validateVerdicts([verdict(1, 'confirmed', 'high'), verdict(1, 'rejected', 'high')], 1),
    /more than one verdict/,
  );
});

test('validateVerdicts rejects a number that was not sent', () => {
  assert.throws(
    () => validateVerdicts([verdict(1, 'confirmed', 'high'), verdict(3, 'confirmed', 'low')], 2),
    /not a finding/,
  );
  assert.throws(() => validateVerdicts([verdict(0, 'confirmed', 'high')], 1), /not a finding/);
});

test('validateVerdicts rejects an unknown verdict or severity', () => {
  assert.throws(
    () => validateVerdicts([{ ...verdict(1, 'confirmed', 'high'), verdict: 'maybe' as never }], 1),
    /verdict/,
  );
  assert.throws(
    () => validateVerdicts([{ ...verdict(1, 'confirmed', 'high'), severity: 'severe' as never }], 1),
    /severity/,
  );
});

test('validateVerdicts rejects an empty reason, also with only white space', () => {
  assert.throws(() => validateVerdicts([verdict(1, 'confirmed', 'high', '')], 1), /reason/);
  assert.throws(() => validateVerdicts([verdict(1, 'confirmed', 'high', '   ')], 1), /reason/);
});

test('validateVerdicts is a ReviewFailureError', () => {
  assert.throws(() => validateVerdicts([], 1), ReviewFailureError);
});

// --- createSubmitVerdictsTool ---

async function call(tool: ReturnType<typeof createSubmitVerdictsTool>, verdicts: unknown[]) {
  return tool.execute('id', { verdicts } as never);
}

test('submit_verdicts accepts a valid call and ends the run', async () => {
  let accepted = undefined as FindingVerdict[] | undefined;
  const tool = createSubmitVerdictsTool(2, (verdicts) => (accepted = verdicts));
  const result = await call(tool, [verdict(1, 'confirmed', 'high'), verdict(2, 'uncertain', 'low')]);
  assert.equal(accepted?.length, 2);
  assert.equal(result.terminate, true);
});

test('submit_verdicts rejects a call that is not valid, gives the reason, and accepts a corrected call', async () => {
  const state: { accepted?: FindingVerdict[] } = {};
  const tool = createSubmitVerdictsTool(2, (verdicts) => (state.accepted = verdicts));

  const rejected = await call(tool, [verdict(1, 'confirmed', 'high')]);
  assert.equal(rejected.isError, true);
  assert.equal(state.accepted, undefined);
  assert.match(JSON.stringify(rejected.content), /no verdict: 2/);

  await call(tool, [verdict(1, 'confirmed', 'high'), verdict(2, 'confirmed', 'high')]);
  assert.equal((state as { accepted?: FindingVerdict[] }).accepted?.length, 2);
});

test('submit_verdicts stops accepting calls after the limit', async () => {
  const tool = createSubmitVerdictsTool(1, () => {});
  let last;
  for (let i = 0; i < MAX_SUBMIT_ATTEMPTS; i += 1) last = await call(tool, []);
  assert.equal(last!.isError, true);
  assert.equal(last!.terminate, true);
});

// --- applyVerdicts ---

test('applyVerdicts drops a rejected finding', () => {
  const findings = [finding('a.ts', 1, 'high', 'A.'), finding('a.ts', 2, 'low', 'B.')];
  const applied = applyVerdicts(findings, [verdict(1, 'rejected', 'high'), verdict(2, 'confirmed', 'low')]);
  assert.deepEqual(
    applied.map((item) => item.result),
    [null, findings[1]],
  );
});

test('applyVerdicts keeps a confirmed and an uncertain finding with the reviewed severity', () => {
  const findings = [finding('a.ts', 1, 'high', 'A.'), finding('a.ts', 2, 'low', 'B.')];
  const applied = applyVerdicts(findings, [verdict(1, 'confirmed', 'medium'), verdict(2, 'uncertain', 'high')]);
  assert.deepEqual(
    applied.map((item) => item.result?.severity),
    ['medium', 'high'],
  );
  assert.deepEqual(
    applied.map((item) => item.severityChanged),
    [true, true],
  );
});

test('applyVerdicts reports no change when the reviewed severity is the same', () => {
  const [applied] = applyVerdicts([finding('a.ts', 1, 'high', 'A.')], [verdict(1, 'confirmed', 'high')]);
  assert.equal(applied!.severityChanged, false);
});

test('applyVerdicts changes only the severity', () => {
  const original = finding('a.ts', 3, 'high', 'Text.', { relatesTo: 'd1', anchor: '0123456789abcdef' });
  const [applied] = applyVerdicts([original], [verdict(1, 'confirmed', 'low')]);
  assert.deepEqual(applied!.result, { ...original, severity: 'low' });
});

test('applyVerdicts keeps the order of the findings and gives the original finding of each entry', () => {
  const findings = [finding('a.ts', 1, 'low', 'A.'), finding('a.ts', 2, 'low', 'B.')];
  const applied = applyVerdicts(findings, [verdict(2, 'confirmed', 'low'), verdict(1, 'confirmed', 'low')]);
  assert.deepEqual(
    applied.map((item) => item.original),
    findings,
  );
});
