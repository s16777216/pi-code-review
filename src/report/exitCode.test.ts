import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../types.ts';
import { decidePassFail } from './exitCode.ts';

function finding(severity: Finding['severity']): Finding {
  return { file: 'a.ts', line: 1, severity, summary: 's' };
}

test('an important finding fails the default threshold', () => {
  assert.equal(decidePassFail([finding('important')], 'important'), false);
});

test('every finding below the threshold passes', () => {
  assert.equal(decidePassFail([finding('nit'), finding('pre_existing')], 'important'), true);
});

test('threshold set to none always passes', () => {
  assert.equal(decidePassFail([finding('important')], 'none'), true);
});

test('a nit finding fails a nit threshold', () => {
  assert.equal(decidePassFail([finding('nit')], 'nit'), false);
});

test('a pre_existing-only finding passes a nit threshold', () => {
  assert.equal(decidePassFail([finding('pre_existing')], 'nit'), true);
});

test('no findings always passes', () => {
  assert.equal(decidePassFail([], 'important'), true);
});
