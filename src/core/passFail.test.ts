import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from './types.ts';
import { decidePassFail } from './passFail.ts';

function finding(severity: Finding['severity']): Finding {
  return { file: 'a.ts', line: 1, severity, summary: 's' };
}

test('a high finding fails the default threshold', () => {
  assert.equal(decidePassFail([finding('high')], 'high'), false);
});

test('every finding below the threshold passes', () => {
  assert.equal(decidePassFail([finding('medium'), finding('pre_existing')], 'high'), true);
});

test('threshold set to none always passes', () => {
  assert.equal(decidePassFail([finding('high')], 'none'), true);
});

test('a low finding fails a low threshold', () => {
  assert.equal(decidePassFail([finding('low')], 'low'), false);
});

test('a pre_existing-only finding passes a low threshold', () => {
  assert.equal(decidePassFail([finding('pre_existing')], 'low'), true);
});

test('a critical finding fails every threshold below it', () => {
  assert.equal(decidePassFail([finding('critical')], 'low'), false);
});

test('no findings always passes', () => {
  assert.equal(decidePassFail([], 'high'), true);
});
