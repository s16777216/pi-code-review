import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFinding } from './findings.ts';

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
