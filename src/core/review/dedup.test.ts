import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../types.ts';
import { MAX_SUBMIT_ATTEMPTS } from './agent.ts';
import { buildDedupPrompt, createSubmitGroupsTool, keepOnePerGroup, selectForDedup, validateGroups } from './dedup.ts';
import { ReviewFailureError } from './findings.ts';

function finding(
  file: string,
  line: number,
  severity: Finding['severity'],
  summary: string,
  extra: Partial<Finding> = {},
) {
  return { file, line, severity, summary, ...extra } satisfies Finding;
}

// --- selectForDedup ---

test('selectForDedup sends nothing when no file has two findings', () => {
  const findings = [finding('a.ts', 1, 'low', 'A'), finding('b.ts', 1, 'low', 'B'), finding('c.ts', 1, 'low', 'C')];
  assert.deepEqual(selectForDedup(findings), []);
});

test('selectForDedup sends only the findings of files that have two or more findings, with their numbers', () => {
  const findings = [
    finding('a.ts', 1, 'low', 'A1'),
    finding('b.ts', 1, 'low', 'B1'),
    finding('a.ts', 2, 'low', 'A2'),
    finding('c.ts', 1, 'low', 'C1'),
  ];
  assert.deepEqual(
    selectForDedup(findings).map(({ number, finding: item }) => [number, item.summary]),
    [
      [1, 'A1'],
      [3, 'A2'],
    ],
  );
});

// --- buildDedupPrompt ---

test('buildDedupPrompt shows the number, file, line, severity, and summary and nothing else', () => {
  const sent = selectForDedup([
    finding('a.ts', 1, 'high', 'First.', { relatesTo: 'd1', anchor: '0123456789abcdef' }),
    finding('a.ts', 2, 'low', 'Second.'),
  ]);
  const prompt = buildDedupPrompt(sent);
  const items = JSON.parse(prompt.slice(prompt.indexOf('['))) as Record<string, unknown>[];
  assert.deepEqual(items, [
    { number: 1, file: 'a.ts', line: 1, severity: 'high', summary: 'First.' },
    { number: 2, file: 'a.ts', line: 2, severity: 'low', summary: 'Second.' },
  ]);
  assert.doesNotMatch(prompt, /relatesTo|anchor|0123456789abcdef/);
});

// --- validateGroups ---

const SENT = selectForDedup([
  finding('a.ts', 1, 'low', 'A1'),
  finding('a.ts', 2, 'low', 'A2'),
  finding('b.ts', 1, 'low', 'B1'),
  finding('b.ts', 2, 'low', 'B2'),
]);

test('validateGroups accepts groups that hold every number once, in one file each', () => {
  assert.deepEqual(validateGroups([[1, 2], [3], [4]], SENT), [[1, 2], [3], [4]]);
});

test('validateGroups rejects a group with findings of two files', () => {
  assert.throws(() => validateGroups([[1, 3], [2], [4]], SENT), ReviewFailureError);
});

test('validateGroups rejects a missing number', () => {
  assert.throws(() => validateGroups([[1, 2], [3]], SENT), /no group: 4/);
});

test('validateGroups rejects a repeated number', () => {
  assert.throws(() => validateGroups([[1, 2], [2], [3], [4]], SENT), /more than one group/);
});

test('validateGroups rejects a number that was not sent', () => {
  assert.throws(() => validateGroups([[1, 2], [3], [4], [9]], SENT), /not a finding that was sent/);
});

test('validateGroups rejects an empty group', () => {
  assert.throws(() => validateGroups([[1, 2], [], [3], [4]], SENT), /empty/);
});

// --- keepOnePerGroup ---

test('keepOnePerGroup keeps the higher severity', () => {
  const findings = [finding('a.ts', 1, 'low', 'Low.'), finding('a.ts', 2, 'high', 'High.')];
  assert.deepEqual(keepOnePerGroup(findings, [[1, 2]]), [findings[1]]);
});

test('keepOnePerGroup keeps a finding that the diff introduces over a pre_existing one', () => {
  const findings = [finding('a.ts', 1, 'pre_existing', 'Old.'), finding('a.ts', 2, 'low', 'New.')];
  assert.deepEqual(keepOnePerGroup(findings, [[1, 2]]), [findings[1]]);
});

test('keepOnePerGroup keeps the first finding when the severities are equal', () => {
  const findings = [finding('a.ts', 1, 'medium', 'First.'), finding('a.ts', 2, 'medium', 'Second.')];
  assert.deepEqual(keepOnePerGroup(findings, [[2, 1]]), [findings[0]]);
});

test('keepOnePerGroup does not change the text of the kept finding', () => {
  const findings = [finding('a.ts', 1, 'low', 'Low.'), finding('a.ts', 2, 'high', 'High.')];
  const [kept] = keepOnePerGroup(findings, [[1, 2]]);
  assert.deepEqual(kept, { file: 'a.ts', line: 2, severity: 'high', summary: 'High.' });
});

test('keepOnePerGroup gives the kept finding the first relatesTo of its group when it has none', () => {
  const findings = [
    finding('a.ts', 1, 'low', 'Low.', { relatesTo: 'd1' }),
    finding('a.ts', 2, 'high', 'High.'),
    finding('a.ts', 3, 'low', 'Other.', { relatesTo: 'd2' }),
  ];
  assert.deepEqual(keepOnePerGroup(findings, [[1, 2, 3]]), [{ ...findings[1], relatesTo: 'd1' }]);
});

test('keepOnePerGroup keeps the own relatesTo of the kept finding', () => {
  const findings = [
    finding('a.ts', 1, 'high', 'High.', { relatesTo: 'd1' }),
    finding('a.ts', 2, 'low', 'Low.', { relatesTo: 'd2' }),
  ];
  assert.deepEqual(keepOnePerGroup(findings, [[1, 2]]), [findings[0]]);
});

test('keepOnePerGroup keeps the order of the findings and every finding in a group of one', () => {
  const findings = [
    finding('a.ts', 1, 'low', 'A1.'),
    finding('b.ts', 1, 'medium', 'B1.'),
    finding('a.ts', 2, 'high', 'A2.'),
  ];
  assert.deepEqual(keepOnePerGroup(findings, [[1, 3], [2]]), [findings[1], findings[2]]);
});

// --- createSubmitGroupsTool ---

async function call(tool: ReturnType<typeof createSubmitGroupsTool>, groups: number[][]) {
  return tool.execute('id', { groups } as never);
}

test('submit_groups accepts a valid result and ends the run', async () => {
  let accepted: number[][] | undefined;
  const tool = createSubmitGroupsTool(SENT, (groups) => (accepted = groups));
  const result = await call(tool, [[1, 2], [3], [4]]);
  assert.deepEqual(accepted, [[1, 2], [3], [4]]);
  assert.equal(result.terminate, true);
});

test('submit_groups rejects a result that is not valid, gives the reason, and accepts a corrected result', async () => {
  let accepted: number[][] | undefined;
  const tool = createSubmitGroupsTool(SENT, (groups) => (accepted = groups));

  const rejected = await call(tool, [[1, 3], [2], [4]]);
  assert.equal(rejected.isError, true);
  assert.equal(accepted, undefined);
  assert.match(JSON.stringify(rejected.content), /more than one file/);

  await call(tool, [[1, 2], [3], [4]]);
  assert.deepEqual(accepted, [[1, 2], [3], [4]]);
});

test('submit_groups stops accepting calls after the limit', async () => {
  const tool = createSubmitGroupsTool(SENT, () => {});
  let last;
  for (let i = 0; i < MAX_SUBMIT_ATTEMPTS; i += 1) last = await call(tool, [[9]]);
  assert.equal(last!.isError, true);
  assert.equal(last!.terminate, true);
});
