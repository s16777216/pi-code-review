import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAnchor } from './anchor.ts';

test('computeAnchor is 16 hexadecimal characters', () => {
  assert.match(computeAnchor('a.ts', 'return x;'), /^[0-9a-f]{16}$/);
});

test('computeAnchor ignores leading and trailing white space', () => {
  assert.equal(computeAnchor('a.ts', '    return x;  '), computeAnchor('a.ts', 'return x;'));
});

test('computeAnchor differs for different code on the same file', () => {
  assert.notEqual(computeAnchor('a.ts', 'return x;'), computeAnchor('a.ts', 'return y;'));
});

test('computeAnchor differs for the same code in a different file', () => {
  assert.notEqual(computeAnchor('a.ts', 'return x;'), computeAnchor('b.ts', 'return x;'));
});
