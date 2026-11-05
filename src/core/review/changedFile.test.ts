import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChangedFileDiff } from '../types.ts';
import { ChangedFile, ChangeSet } from './changedFile.ts';

function set(...files: ChangedFileDiff[]): ChangeSet {
  return ChangeSet.from(files);
}

// --- The tests of checkNewFileLine and getNewFileLineText, moved here ---

test('lineCheck accepts an added line and a context line', () => {
  const changes = set({
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: ['@@ -1,2 +1,3 @@', ' context1', '+added1', ' context2'].join('\n'),
  });

  assert.equal(changes.lineCheck('a.ts', 1), 'ok'); // context1
  assert.equal(changes.lineCheck('a.ts', 2), 'ok'); // added1
  assert.equal(changes.lineCheck('a.ts', 3), 'ok'); // context2
});

test('lineCheck rejects a line outside any hunk', () => {
  const changes = set({
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: ['@@ -1,2 +1,2 @@', ' context1', '+added1'].join('\n'),
  });

  assert.notEqual(changes.lineCheck('a.ts', 99), 'ok');
});

test('lineCheck rejects a file that is not in the changed files', () => {
  const changes = set({ oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -1,1 +1,1 @@', '+added1'].join('\n') });

  assert.notEqual(changes.lineCheck('b.ts', 1), 'ok');
});

test('lineCheck rejects a removed-only line (not visible in the new file)', () => {
  const changes = set({
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: ['@@ -1,2 +1,1 @@', '-removed1', ' context1'].join('\n'),
  });

  // removed1 has no newLine, so it must never match as a valid new-file line.
  assert.equal(changes.lineCheck('a.ts', 1), 'ok'); // context1
  assert.equal(changes.lineCheck('a.ts', 2), 'line_not_in_diff');
});

test('numbered prints only lines that lineCheck accepts', () => {
  const hunks = ['@@ -3,3 +3,3 @@', ' keep', '-gone', '+new', ' tail'].join('\n');
  const changes = set({ oldPath: 'a.ts', newPath: 'a.ts', hunks });

  const printed = changes
    .file('a.ts')!
    .numbered()
    .split('\n')
    .map((line) => /^\s*(\d+) \|/.exec(line)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);

  assert.deepEqual(printed, [3, 4, 5]);
  for (const line of printed) assert.equal(changes.lineCheck('a.ts', line), 'ok');
});

test('lineCheck returns ok, file_not_changed, or line_not_in_diff', () => {
  const changes = set({
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: ['@@ -1,1 +1,2 @@', ' context1', '+added1'].join('\n'),
  });

  assert.equal(changes.lineCheck('a.ts', 2), 'ok');
  assert.equal(changes.lineCheck('b.ts', 1), 'file_not_changed');
  assert.equal(changes.lineCheck('a.ts', 99), 'line_not_in_diff');
});

test('lineText returns the text of an added or context line, and null otherwise', () => {
  const changes = set({
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: ['@@ -1,2 +1,2 @@', ' keep();', '-gone();', '+added();'].join('\n'),
  });

  assert.equal(changes.lineText('a.ts', 1), 'keep();');
  assert.equal(changes.lineText('a.ts', 2), 'added();');
  assert.equal(changes.lineText('a.ts', 3), null);
  assert.equal(changes.lineText('b.ts', 1), null);
});

test('a deleted file has no new-file line, not even line 0', () => {
  const hunks = '@@ -1,3 +0,0 @@\n-export function oldHelper(x) {\n-  return x * 2;\n-}\n';
  const changes = set({ oldPath: 'old.js', newPath: 'old.js', hunks, deleted: true });

  assert.equal(changes.lineCheck('old.js', 0), 'line_not_in_diff');
  assert.equal(changes.lineText('old.js', 0), null);
  assert.doesNotMatch(changes.file('old.js')!.numbered(), /\d+ \|/);
});

test('lineCheck rejects the line one past the end of a diff that ends with a line break', () => {
  const changes = set({ oldPath: 'a.js', newPath: 'a.js', hunks: '@@ -0,0 +1,2 @@\n+a\n+b\n' });

  assert.equal(changes.lineCheck('a.js', 2), 'ok');
  assert.equal(changes.lineCheck('a.js', 3), 'line_not_in_diff');
});

// --- The new methods ---

const MODIFIED = ChangedFile.from({
  oldPath: 'src/a.ts',
  newPath: 'src/a.ts',
  hunks: '@@ -1,3 +1,4 @@\n keep\n-gone\n+new1\n+new2\n tail\n@@ -20,2 +21,2 @@\n x\n-y\n+z\n',
});

test('hasNewLine and newLineText agree, and read only added and context lines', () => {
  assert.equal(MODIFIED.hasNewLine(1), true);
  assert.equal(MODIFIED.newLineText(1), 'keep');
  assert.equal(MODIFIED.hasNewLine(2), true);
  assert.equal(MODIFIED.newLineText(3), 'new2');
  assert.equal(MODIFIED.hasNewLine(5), false);
  assert.equal(MODIFIED.newLineText(5), null);
  assert.equal(MODIFIED.newLineText(21), 'x');
});

test('counts gives the added and removed lines', () => {
  assert.deepEqual(MODIFIED.counts(), { added: 3, removed: 2 });
  assert.deepEqual(ChangedFile.from({ oldPath: 'e', newPath: 'e', hunks: '' }).counts(), { added: 0, removed: 0 });
});

test('state names added, deleted, renamed, and modified files', () => {
  const diff = (over: Partial<ChangedFileDiff>): ChangedFile =>
    ChangedFile.from({ oldPath: 'a', newPath: 'a', hunks: '@@ -1 +1 @@\n-x\n+y\n', ...over });

  assert.equal(diff({}).state(), 'modified');
  assert.equal(diff({ oldPath: null }).state(), 'added');
  assert.equal(diff({ hunks: '@@ -0,0 +1,1 @@\n+x\n' }).state(), 'added');
  assert.equal(diff({ newPath: null, deleted: true }).state(), 'deleted');
  assert.equal(diff({ oldPath: 'old', newPath: 'new' }).state(), 'renamed from old');
  // `deleted` wins over everything else.
  assert.equal(diff({ oldPath: null, deleted: true }).state(), 'deleted');
});

test('path is the new path, or the old path of a deleted file', () => {
  assert.equal(MODIFIED.path, 'src/a.ts');
  assert.equal(ChangedFile.from({ oldPath: 'gone.ts', newPath: null, hunks: '' }).path, 'gone.ts');
  assert.equal(ChangedFile.from({ oldPath: null, newPath: null, hunks: '' }).path, '(unknown path)');
});

test('hunks gives one ChangedFile for each hunk, with the same paths and line numbers', () => {
  const parts = MODIFIED.hunks();

  assert.equal(parts.length, 2);
  assert.deepEqual(
    parts.map((part) => part.path),
    ['src/a.ts', 'src/a.ts'],
  );
  assert.equal(parts[0]!.hasNewLine(1), true);
  assert.equal(parts[0]!.hasNewLine(21), false);
  assert.equal(parts[1]!.hasNewLine(21), true);
  assert.equal(parts[1]!.newLineText(22), 'z');
  // The numbers are the whole file's numbers, not restarted at 1.
  assert.match(parts[1]!.numbered(), /^@@ -20,2 \+21,2 @@\n {2}21 \| {2}x\n/);
});

test('numbered of all the parts, joined, is the numbering of the whole file', () => {
  const parts = MODIFIED.hunks();

  assert.equal(parts.map((part) => part.numbered()).join('\n'), MODIFIED.numbered());
});

test('withHunks keeps some hunks of the same file, in the given order', () => {
  const [first, second] = MODIFIED.hunks() as [ChangedFile, ChangedFile];

  const onlySecond = MODIFIED.withHunks([second]);
  assert.equal(onlySecond.path, MODIFIED.path);
  assert.equal(onlySecond.hasNewLine(21), true);
  assert.equal(onlySecond.hasNewLine(1), false);

  const both = MODIFIED.withHunks([first, second]);
  assert.equal(both.numbered(), MODIFIED.numbered());
  assert.deepEqual(both.counts(), MODIFIED.counts());
});

test('a part keeps the state of the whole file: added, deleted, or modified', () => {
  // A whole new file starts with `@@ -0,0`. The second hunk of it does not, so
  // a state read from the part's own text would be wrong.
  const added = ChangedFile.from({
    oldPath: 'b.ts',
    newPath: 'b.ts',
    hunks: '@@ -0,0 +1,1 @@\n+a\n@@ -5,1 +6,1 @@\n-x\n+b\n',
  });
  const secondOfAdded = added.hunks()[1]!;
  assert.doesNotMatch(secondOfAdded.hunkText, /^@@ -0,0 /);
  assert.equal(secondOfAdded.state(), 'added');

  const modified = ChangedFile.from({
    oldPath: 'm.ts',
    newPath: 'm.ts',
    hunks: '@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-c\n+d\n',
  });
  assert.equal(modified.hunks()[1]!.state(), 'modified');

  const deleted = ChangedFile.from({
    oldPath: 'd.ts',
    newPath: null,
    hunks: '@@ -1 +0,0 @@\n-a\n@@ -5 +0,0 @@\n-b\n',
    deleted: true,
  });
  assert.equal(deleted.hunks()[1]!.state(), 'deleted');

  // A part that is built with withHunks keeps it too.
  assert.equal(added.withHunks([secondOfAdded]).state(), 'added');
});

test('the omitted reason and the deleted flag are kept by parts', () => {
  const omitted = ChangedFile.from({
    oldPath: 'l',
    newPath: 'l',
    hunks: '@@ -1 +1 @@\n-a\n+b\n',
    omitted: 'generated',
  });

  assert.equal(omitted.omitted, 'generated');
  assert.equal(omitted.hunks()[0]!.omitted, 'generated');
});

test('ChangeSet keeps the host order, and finds a file by its new path', () => {
  const changes = set(
    { oldPath: 'b', newPath: 'b', hunks: '' },
    { oldPath: 'a', newPath: 'a', hunks: '' },
    { oldPath: 'gone', newPath: null, hunks: '', deleted: true },
  );

  assert.deepEqual(
    changes.files.map((file) => file.path),
    ['b', 'a', 'gone'],
  );
  assert.equal(changes.file('a')?.path, 'a');
  assert.equal(changes.file('gone'), undefined);
  assert.equal(changes.file('zzz'), undefined);
});

test('ChangeSet.isOmitted and reviewable follow the omitted reason', () => {
  const changes = set(
    { oldPath: 'a', newPath: 'a', hunks: '@@ -1 +1 @@\n-x\n+y\n' },
    { oldPath: 'l', newPath: 'l', hunks: '@@ -1 +1 @@\n-x\n+y\n', omitted: 'generated' },
    { oldPath: 'h', newPath: 'h', hunks: '', omitted: 'too_large' },
  );

  assert.equal(changes.isOmitted('a'), false);
  assert.equal(changes.isOmitted('l'), true);
  assert.equal(changes.isOmitted('h'), true);
  assert.equal(changes.isOmitted('nope'), false);
  assert.deepEqual(
    changes.reviewable().map((file) => file.path),
    ['a'],
  );
});

test('ChangeSet.isDeleted matches the old or the new path of a deleted file only', () => {
  const changes = set(
    { oldPath: 'gone.ts', newPath: null, hunks: '', deleted: true },
    { oldPath: 'kept.ts', newPath: 'kept.ts', hunks: '' },
  );

  assert.equal(changes.isDeleted('gone.ts'), true);
  assert.equal(changes.isDeleted('kept.ts'), false);
  assert.equal(changes.isDeleted('other'), false);
});

test('ChangedFile does not change after it is built', () => {
  const diff: ChangedFileDiff = { oldPath: 'a', newPath: 'a', hunks: '@@ -1 +1 @@\n-x\n+y\n' };
  const file = ChangedFile.from(diff);

  diff.hunks = '@@ -9 +9 @@\n-q\n+r\n';

  assert.equal(file.hasNewLine(1), true);
  assert.equal(file.hasNewLine(9), false);
});
