import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChangedFileDiff } from '../types.ts';
import { checkNewFileLine, isValidNewFileLine, numberDiffHunks, parseDiffHunks } from './diff.ts';

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

test('numberDiffHunks numbers context and added lines and leaves removed lines blank', () => {
  const diff = ['@@ -10,3 +10,3 @@', ' const a = 1;', '+const b = 2;', '-const c = 3;', ' return a;'].join('\n');

  assert.equal(
    numberDiffHunks(diff),
    ['@@ -10,3 +10,3 @@', '  10 |  const a = 1;', '  11 | +const b = 2;', '     | -const c = 3;', '  12 |  return a;'].join(
      '\n',
    ),
  );
});

test('numberDiffHunks restarts numbering at each hunk header', () => {
  const diff = ['@@ -1,1 +1,1 @@', '+first', '@@ -50,1 +60,1 @@', ' second'].join('\n');

  assert.equal(
    numberDiffHunks(diff),
    ['@@ -1,1 +1,1 @@', '   1 | +first', '@@ -50,1 +60,1 @@', '  60 |  second'].join('\n'),
  );
});

test('numberDiffHunks widens the gutter for line numbers above 9999', () => {
  const diff = ['@@ -12345,1 +12345,2 @@', ' a', '+b'].join('\n');

  assert.equal(numberDiffHunks(diff), ['@@ -12345,1 +12345,2 @@', '12345 |  a', '12346 | +b'].join('\n'));
});

test('numberDiffHunks gives a "no newline" marker a blank gutter and does not count it', () => {
  const diff = ['@@ -1,1 +1,2 @@', ' a', '\\ No newline at end of file', '+b'].join('\n');

  assert.equal(
    numberDiffHunks(diff),
    ['@@ -1,1 +1,2 @@', '   1 |  a', '     | \\ No newline at end of file', '   2 | +b'].join('\n'),
  );
});

test('numberDiffHunks prints only lines that checkNewFileLine accepts', () => {
  const hunks = ['@@ -3,3 +3,3 @@', ' keep', '-gone', '+new', ' tail'].join('\n');
  const files: ChangedFileDiff[] = [{ oldPath: 'a.ts', newPath: 'a.ts', hunks }];

  const printed = numberDiffHunks(hunks)
    .split('\n')
    .map((line) => /^\s*(\d+) \|/.exec(line)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);

  assert.deepEqual(printed, [3, 4, 5]);
  for (const line of printed) assert.equal(checkNewFileLine(files, 'a.ts', line), 'ok');
});

test('checkNewFileLine returns ok, file_not_changed, or line_not_in_diff', () => {
  const files: ChangedFileDiff[] = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,1 +1,2 @@', ' context1', '+added1'].join('\n') },
  ];

  assert.equal(checkNewFileLine(files, 'a.ts', 2), 'ok');
  assert.equal(checkNewFileLine(files, 'b.ts', 1), 'file_not_changed');
  assert.equal(checkNewFileLine(files, 'a.ts', 99), 'line_not_in_diff');
});
