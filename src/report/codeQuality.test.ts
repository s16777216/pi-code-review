import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../types.ts';
import { buildCodeQualityReport } from './codeQuality.ts';

test('buildCodeQualityReport creates one entry per finding with the mapped severity', () => {
  const findings: Finding[] = [
    { file: 'a.ts', line: 3, severity: 'important', summary: 'Off-by-one error.' },
    { file: 'b.ts', line: 10, severity: 'nit', summary: 'Naming nit.' },
    { file: 'c.ts', line: 1, severity: 'pre_existing', summary: 'Pre-existing bug.' },
  ];

  const report = buildCodeQualityReport(findings);

  assert.equal(report.length, 3);
  assert.deepEqual(
    report.map((issue) => issue.severity),
    ['major', 'minor', 'info'],
  );
  assert.equal(report[0]!.description, 'Off-by-one error.');
  assert.deepEqual(report[0]!.location, { path: 'a.ts', lines: { begin: 3 } });
});

test('buildCodeQualityReport returns an empty array for no findings', () => {
  assert.deepEqual(buildCodeQualityReport([]), []);
});

test('buildCodeQualityReport gives each finding a distinct, stable fingerprint', () => {
  const findings: Finding[] = [
    { file: 'a.ts', line: 3, severity: 'important', summary: 'Bug A.' },
    { file: 'a.ts', line: 4, severity: 'important', summary: 'Bug B.' },
  ];

  const report = buildCodeQualityReport(findings);

  assert.notEqual(report[0]!.fingerprint, report[1]!.fingerprint);
  assert.equal(buildCodeQualityReport(findings)[0]!.fingerprint, report[0]!.fingerprint);
});
