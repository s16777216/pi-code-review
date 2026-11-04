import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage } from './errorMessage.ts';

test('errorMessage returns the message of an Error, and a string for anything else', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
  assert.equal(errorMessage(42), '42');
});
