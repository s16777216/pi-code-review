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

test('validateStoredFinding rejects an invalid corroboration, verdict or confidence', () => {
  assert.throws(() => validateStoredFinding({ ...BASE, corroboration: 0 }, 0), /"corroboration"/);
  assert.throws(() => validateStoredFinding({ ...BASE, corroboration: 1.5 }, 0), /"corroboration"/);
  assert.throws(() => validateStoredFinding({ ...BASE, verdict: 'rejected' }, 0), /"verdict"/);
  assert.throws(() => validateStoredFinding({ ...BASE, confidence: 'certain' }, 0), /"confidence"/);
});
