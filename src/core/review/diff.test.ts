import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChangedFileDiff } from '../types.ts';
import { isValidNewFileLine, parseDiffHunks } from './diff.ts';

test('parseDiffHunks maps a simple hunk to old/new line numbers', () => {
  const diff = ['@@ -1,3 +1,4 @@', ' context1', '-removed1', '+added1', '+added2', ' context2'].join('\n');

  const lines = parseDiffHunks(diff);

  assert.deepEqual(lines, [
    { type: 'context', content: 'context1', oldLine: 1, newLine: 1 },
    { type: 'removed', content: 'removed1', oldLine: 2, newLine: null },
    { type: 'added', content: 'added1', oldLine: null, newLine: 2 },
    { type: 'added', content: 'added2', oldLine: null, newLine: 3 },
    { type: 'context', content: 'context2', oldLine: 3, newLine: 4 },
  ]);
});

test('parseDiffHunks handles a brand-new file (no old lines)', () => {
  const diff = ['@@ -0,0 +1,2 @@', '+line1', '+line2'].join('\n');

  const lines = parseDiffHunks(diff);

  assert.deepEqual(lines, [
    { type: 'added', content: 'line1', oldLine: null, newLine: 1 },
    { type: 'added', content: 'line2', oldLine: null, newLine: 2 },
  ]);
});

test('parseDiffHunks handles multiple hunks in one file', () => {
  const diff = [
    '@@ -1,2 +1,2 @@',
    '-old1',
    '+new1',
    ' context1',
    '@@ -10,2 +10,3 @@',
    ' context2',
    '+new2',
    ' context3',
  ].join('\n');

  const lines = parseDiffHunks(diff);

  assert.deepEqual(
    lines.map((l) => [l.type, l.oldLine, l.newLine]),
    [
      ['removed', 1, null],
      ['added', null, 1],
      ['context', 2, 2],
      ['context', 10, 10],
      ['added', null, 11],
      ['context', 11, 12],
    ],
  );
});

test('parseDiffHunks ignores a "no newline at end of file" marker', () => {
  const diff = ['@@ -1,1 +1,1 @@', '-old', '+new', '\\ No newline at end of file'].join('\n');

  const lines = parseDiffHunks(diff);

  assert.equal(lines.length, 2);
});

test('parseDiffHunks accepts a header with implicit count of 1', () => {
  const diff = ['@@ -1 +1 @@', '-old', '+new'].join('\n');

  const lines = parseDiffHunks(diff);

  assert.deepEqual(lines, [
    { type: 'removed', content: 'old', oldLine: 1, newLine: null },
    { type: 'added', content: 'new', oldLine: null, newLine: 1 },
  ]);
});

test('isValidNewFileLine accepts an added line and a context line', () => {
  const files: ChangedFileDiff[] = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,2 +1,3 @@', ' context1', '+added1', ' context2'].join('\n') },
  ];

  assert.equal(isValidNewFileLine(files, 'a.ts', 1), true); // context1
  assert.equal(isValidNewFileLine(files, 'a.ts', 2), true); // added1
  assert.equal(isValidNewFileLine(files, 'a.ts', 3), true); // context2
});

test('isValidNewFileLine rejects a line outside any hunk', () => {
  const files: ChangedFileDiff[] = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,2 +1,2 @@', ' context1', '+added1'].join('\n') },
  ];

  assert.equal(isValidNewFileLine(files, 'a.ts', 99), false);
});

test('isValidNewFileLine rejects a file that is not in the changed files', () => {
  const files: ChangedFileDiff[] = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,1 +1,1 @@', '+added1'].join('\n') },
  ];

  assert.equal(isValidNewFileLine(files, 'b.ts', 1), false);
});

test('isValidNewFileLine rejects a removed-only line (not visible in the new file)', () => {
  const files: ChangedFileDiff[] = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,2 +1,1 @@', '-removed1', ' context1'].join('\n') },
  ];

  // removed1 has no newLine, so it must never match as a valid new-file line.
  assert.equal(isValidNewFileLine(files, 'a.ts', 1), true); // context1
  assert.equal(
    parseDiffHunks(files[0]!.hunks).some((l) => l.type === 'removed' && l.newLine !== null),
    false,
  );
});
