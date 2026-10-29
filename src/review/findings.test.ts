import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('parseFindings throws ReviewFailureError for a finding with an invalid severity', () => {
  assert.throws(
    () => parseFindings(JSON.stringify([{ file: 'a.ts', line: 1, severity: 'critical', summary: 'x' }])),
    ReviewFailureError,
  );
});

test('parseFindings throws ReviewFailureError for a finding missing a field', () => {
  assert.throws(
    () => parseFindings(JSON.stringify([{ file: 'a.ts', severity: 'nit', summary: 'x' }])),
    ReviewFailureError,
  );
});
