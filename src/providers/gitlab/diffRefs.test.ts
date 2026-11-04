import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLabDiffRefs } from './diffRefs.ts';

const refs = { baseSha: 'base', startSha: 'start', headSha: 'head' };

test('parseGitLabDiffRefs returns the three SHAs and drops other fields', () => {
  assert.deepEqual(parseGitLabDiffRefs({ ...refs, extra: 1 }), refs);
});

test('parseGitLabDiffRefs rejects a value that is not an object', () => {
  for (const value of [undefined, null, 'abc', ['base']]) {
    assert.throws(() => parseGitLabDiffRefs(value), /^Error: "diffRefs" is missing or is not an object\.$/);
  }
});

for (const field of ['baseSha', 'startSha', 'headSha'] as const) {
  test(`parseGitLabDiffRefs rejects a missing or empty ${field}`, () => {
    const message = new RegExp(`^Error: "diffRefs\\.${field}" is missing or is not a non-empty string\\.$`);
    const { [field]: _dropped, ...without } = refs;
    assert.throws(() => parseGitLabDiffRefs(without), message);
    assert.throws(() => parseGitLabDiffRefs({ ...refs, [field]: '' }), message);
  });
}
