import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFinding, validateStoredFinding } from './findings.ts';

test('validateFinding keeps a 16-hex anchor and rejects a malformed one (findings file path)', () => {
  assert.deepEqual(
    validateFinding({ file: 'a.ts', line: 1, severity: 'low', summary: 'x', anchor: '0123456789abcdef' }, 0),
    {
      file: 'a.ts',
      line: 1,
      severity: 'low',
      summary: 'x',
      anchor: '0123456789abcdef',
    },
  );
  assert.throws(
    () => validateFinding({ file: 'a.ts', line: 1, severity: 'low', summary: 'x', anchor: 'nope' }, 0),
    /"anchor"/,
  );
});

const BASE = { file: 'a.ts', line: 1, severity: 'low', summary: 'x' };

test('validateFinding (agent output) ignores the fields that the engine sets', () => {
  const result = validateFinding(
    { ...BASE, focus: 'security', corroboration: 3, verdict: 'confirmed', confidence: 'high' },
    0,
  );
  assert.deepEqual(result, BASE);
});

test('validateStoredFinding keeps corroboration, verdict and confidence of the findings file', () => {
  assert.deepEqual(validateStoredFinding({ ...BASE, corroboration: 2, verdict: 'confirmed', confidence: 'high' }, 0), {
    ...BASE,
    corroboration: 2,
    verdict: 'confirmed',
    confidence: 'high',
  });
});

test('validateStoredFinding reads a finding with none of the new fields', () => {
  assert.deepEqual(validateStoredFinding(BASE, 0), BASE);
});

test('validateStoredFinding does not keep the focus', () => {
  assert.deepEqual(validateStoredFinding({ ...BASE, focus: 'security' }, 0), BASE);
});

test('validateStoredFinding accepts the verdict unverified, and a finding with no verdict', () => {
  assert.deepEqual(validateStoredFinding({ ...BASE, verdict: 'unverified', confidence: 'low' }, 0), {
    ...BASE,
    verdict: 'unverified',
    confidence: 'low',
  });
  assert.equal('verdict' in validateStoredFinding({ ...BASE, confidence: 'high' }, 0), false);
});

test('validateFinding (agent output) does not let a model set the verdict unverified', () => {
  assert.deepEqual(validateFinding({ ...BASE, verdict: 'unverified' }, 0), BASE);
});

test('validateStoredFinding rejects an invalid corroboration, verdict or confidence', () => {
  assert.throws(() => validateStoredFinding({ ...BASE, corroboration: 0 }, 0), /"corroboration"/);
  assert.throws(() => validateStoredFinding({ ...BASE, corroboration: 1.5 }, 0), /"corroboration"/);
  assert.throws(() => validateStoredFinding({ ...BASE, verdict: 'rejected' }, 0), /"verdict"/);
  assert.throws(() => validateStoredFinding({ ...BASE, confidence: 'certain' }, 0), /"confidence"/);
});

test('validateFinding keeps a valid endLine, and an endLine equal to line', () => {
  assert.deepEqual(validateFinding({ ...BASE, line: 562, endLine: 600 }, 0), { ...BASE, line: 562, endLine: 600 });
  assert.deepEqual(validateFinding({ ...BASE, line: 5, endLine: 5 }, 0), { ...BASE, line: 5, endLine: 5 });
  assert.equal('endLine' in validateFinding(BASE, 0), false);
});

test('validateFinding rejects an endLine less than line, or not an integer', () => {
  assert.throws(() => validateFinding({ ...BASE, line: 30, endLine: 20 }, 2), /index 2 .*"endLine"/);
  assert.throws(() => validateFinding({ ...BASE, endLine: 1.5 }, 0), /"endLine"/);
  assert.throws(() => validateFinding({ ...BASE, endLine: '9' }, 0), /"endLine"/);
});
