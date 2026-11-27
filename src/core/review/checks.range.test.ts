import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../../logger.ts';
import type { Finding } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { ChangeSet } from './changedFile.ts';
import { runChecks } from './checks.ts';

// The diff shows the lines 553 to 568: line 553 is `}`, line 562 is added.
const lines = Array.from({ length: 16 }, (_, i) => (i === 0 ? ' }' : i === 9 ? '+lock.Release();' : ` code${553 + i}`));
const hunks = ['@@ -553,15 +553,16 @@', ...lines].join('\n');
const changes = ChangeSet.from([{ oldPath: 'a.cs', newPath: 'a.cs', hunks }]);

function setup() {
  const warns: Array<Record<string, unknown>> = [];
  const logger = { warn: (obj: Record<string, unknown>) => warns.push(obj), info() {} } as unknown as Logger;
  return { warns, logger };
}

const finding = (line: number, endLine?: number): Finding => ({
  file: 'a.cs',
  line,
  ...(endLine === undefined ? {} : { endLine }),
  severity: 'high',
  summary: 'Race.',
});

test('a range that starts in the diff and ends outside it is kept with its line and end line', async () => {
  const { logger, warns } = setup();
  const result = await runChecks({ findings: [finding(562, 600)] }, changes, logger);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.line, 562);
  assert.equal(result.findings[0]!.endLine, 600);
  assert.deepEqual(warns, []);
});

test('a range with no line in the diff is discarded, and the warn line has the end line', async () => {
  const { logger, warns } = setup();
  const result = await runChecks({ findings: [finding(574, 600)] }, changes, logger);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(warns, [{ file: 'a.cs', line: 574, endLine: 600, reason: 'line_not_in_diff' }]);
});

test('a single line outside the diff is discarded, and the warn line has no end line', async () => {
  const { logger, warns } = setup();
  await runChecks({ findings: [finding(600)] }, changes, logger);
  assert.deepEqual(warns, [{ file: 'a.cs', line: 600, reason: 'line_not_in_diff' }]);
});

test('the anchor of a range that starts outside the diff uses its first visible line', async () => {
  const { logger } = setup();
  const result = await runChecks({ findings: [finding(548, 560)] }, changes, logger);
  assert.equal(result.findings[0]!.anchor, computeAnchor('a.cs', '}'));
});

test('a single-line finding keeps its old anchor', async () => {
  const { logger } = setup();
  const result = await runChecks({ findings: [finding(562), finding(562, 600)] }, changes, logger);
  assert.equal(result.findings[0]!.anchor, computeAnchor('a.cs', 'lock.Release();'));
  assert.equal(result.findings[1]!.anchor, result.findings[0]!.anchor);
});
