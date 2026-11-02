import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../../logger.ts';
import { parseFindings, ReviewFailureError } from './findings.ts';

test('parseFindings parses a plain JSON array', () => {
  const findings = parseFindings(
    JSON.stringify([{ file: 'a.ts', line: 3, severity: 'important', summary: 'Off-by-one error.' }]),
  );

  assert.deepEqual(findings, [{ file: 'a.ts', line: 3, severity: 'important', summary: 'Off-by-one error.' }]);
});

test('parseFindings parses a JSON array wrapped in a ```json fence', () => {
  const text = ['Here are the findings:', '```json', '[{"file":"a.ts","line":1,"severity":"nit","summary":"Nit."}]', '```'].join(
    '\n',
  );

  const findings = parseFindings(text);

  assert.deepEqual(findings, [{ file: 'a.ts', line: 1, severity: 'nit', summary: 'Nit.' }]);
});

test('parseFindings returns an empty array for an empty JSON array', () => {
  assert.deepEqual(parseFindings('[]'), []);
});

test('parseFindings throws ReviewFailureError for non-JSON text', () => {
  assert.throws(() => parseFindings('I found no issues.'), ReviewFailureError);
});

test('parseFindings throws ReviewFailureError for a JSON object instead of an array', () => {
  assert.throws(() => parseFindings('{"file":"a.ts"}'), ReviewFailureError);
});

function warnRecorder(): { logger: Logger; warnings: { index: number; reason: string }[] } {
  const warnings: { index: number; reason: string }[] = [];
  const logger = { warn: (obj: { index: number; reason: string }) => warnings.push(obj) } as unknown as Logger;
  return { logger, warnings };
}

test('parseFindings drops a finding with an invalid severity and keeps the valid ones', () => {
  const { logger, warnings } = warnRecorder();
  const findings = parseFindings(
    JSON.stringify([
      { file: 'a.ts', line: 1, severity: 'important', summary: 'First.' },
      { file: 'a.ts', line: 2, severity: 'critical', summary: 'Bad severity.' },
      { file: 'b.ts', line: 3, severity: 'nit', summary: 'Third.' },
    ]),
    logger,
  );

  assert.deepEqual(findings, [
    { file: 'a.ts', line: 1, severity: 'important', summary: 'First.' },
    { file: 'b.ts', line: 3, severity: 'nit', summary: 'Third.' },
  ]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.index, 1);
  assert.match(warnings[0]!.reason, /invalid "severity"/);
});

test('parseFindings drops a finding missing a field and logs its index', () => {
  const { logger, warnings } = warnRecorder();
  const findings = parseFindings(JSON.stringify([{ file: 'a.ts', severity: 'nit', summary: 'x' }]), logger);

  assert.deepEqual(findings, []);
  assert.deepEqual(
    warnings.map((w) => w.index),
    [0],
  );
  assert.match(warnings[0]!.reason, /integer "line"/);
});

test('parseFindings returns an empty array and logs every element when all elements are invalid', () => {
  const { logger, warnings } = warnRecorder();
  const findings = parseFindings(JSON.stringify(['not an object', null, { file: '', line: 1 }]), logger);

  assert.deepEqual(findings, []);
  assert.deepEqual(
    warnings.map((w) => w.index),
    [0, 1, 2],
  );
});

test('parseFindings drops invalid elements without a logger', () => {
  assert.deepEqual(parseFindings(JSON.stringify([{ file: 'a.ts' }])), []);
});
