import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCHES, planBatches, type BatchItem } from './batch.ts';
import { ChangedFile } from './changedFile.ts';
import { ReviewFailureError } from './findings.ts';

/** A budget of `limit` diff lines per batch, so a test can reason in lines. */
function linesFit(limit: number) {
  return (items: BatchItem[]) => items.reduce((sum, item) => sum + item.file.hunkText.split('\n').length, 0) <= limit;
}

/** A changed file with one hunk of `lines` added lines (plus its header). */
function file(path: string, lines: number, startLine = 1): ChangedFile {
  const body = Array.from({ length: lines }, (_, i) => `+line ${i}`);
  return ChangedFile.from({
    oldPath: path,
    newPath: path,
    hunks: [`@@ -0,0 +${startLine},${lines} @@`, ...body].join('\n'),
  });
}

/** A changed file with hunks of the given sizes, in order. */
function multiHunkFile(path: string, sizes: number[]): ChangedFile {
  const hunks = sizes.map((size, k) =>
    [`@@ -${k * 100 + 1},0 +${k * 100 + 1},${size} @@`, ...Array.from({ length: size }, () => '+x')].join('\n'),
  );
  return ChangedFile.from({ oldPath: path, newPath: path, hunks: hunks.join('\n') });
}

const paths = (batches: BatchItem[][]) =>
  batches.map((batch) =>
    batch.map((item) => (item.part ? `${item.file.newPath}#${item.part.index}/${item.part.count}` : item.file.newPath)),
  );

test('planBatches puts everything in one batch when it fits', () => {
  assert.deepEqual(paths(planBatches([file('b.ts', 2), file('a.ts', 2)], linesFit(100), 1000)), [['a.ts', 'b.ts']]);
});

test('planBatches packs files in path order and starts a new batch when the next file does not fit', () => {
  // Each file is 3 lines; two fit in one batch.
  const batches = planBatches([file('b/y.ts', 2), file('a/x.ts', 2), file('a/z.ts', 2)], linesFit(6), 1000);

  assert.deepEqual(paths(batches), [['a/x.ts', 'a/z.ts'], ['b/y.ts']]);
});

test('planBatches sorts by code point, not by locale', () => {
  const batches = planBatches([file('a.ts', 2), file('B.ts', 2)], linesFit(3), 1000);

  assert.deepEqual(paths(batches), [['B.ts'], ['a.ts']]);
});

test('planBatches uses the old path of a deleted file', () => {
  const deleted = ChangedFile.from({ oldPath: 'a.ts', newPath: null, hunks: '@@ -1 +0,0 @@\n-x', deleted: true });

  assert.deepEqual(
    planBatches([file('b.ts', 1), deleted], linesFit(100), 1000).map((batch) => batch.map((item) => item.file.oldPath)),
    [['a.ts', 'b.ts']],
  );
});

test('planBatches splits a file that does not fit an empty batch at hunk boundaries', () => {
  // Three hunks of 2 lines each (3 with the header); two fit together.
  const batches = planBatches([multiHunkFile('big.ts', [2, 2, 2])], linesFit(6), 1000);

  assert.deepEqual(paths(batches), [['big.ts#1/2'], ['big.ts#2/2']]);
  assert.equal(batches[0]![0]!.file.hunkText.split('\n').filter((line) => line.startsWith('@@')).length, 2);
  assert.match(batches[1]![0]!.file.hunkText, /^@@ -201,0 \+201,2 @@/);
});

test("planBatches lets the next file share the batch of a split file's last part", () => {
  const batches = planBatches([multiHunkFile('a.ts', [2, 2, 2]), file('b.ts', 1)], linesFit(6), 1000);

  assert.deepEqual(paths(batches), [['a.ts#1/2'], ['a.ts#2/2', 'b.ts']]);
});

test('planBatches closes the current batch before it splits a file', () => {
  const batches = planBatches([file('a.ts', 1), multiHunkFile('b.ts', [2, 2, 2])], linesFit(6), 1000);

  assert.deepEqual(paths(batches), [['a.ts'], ['b.ts#1/2'], ['b.ts#2/2']]);
});

test('planBatches fails, naming the file and line, when one hunk does not fit an empty batch', () => {
  assert.throws(
    () => planBatches([multiHunkFile('big.ts', [2, 10])], linesFit(6), 1000),
    (error: unknown) =>
      error instanceof ReviewFailureError &&
      /line 101 of "big\.ts"/.test(error.message) &&
      /1000-token context window/.test(error.message),
  );
});

test('planBatches fails when a file without hunk headers does not fit', () => {
  const huge = ChangedFile.from({ oldPath: 'x.bin', newPath: 'x.bin', hunks: 'a\nb\nc\nd' });

  assert.throws(() => planBatches([huge], linesFit(2), 1000), ReviewFailureError);
});

test(`planBatches fails when the change needs ${MAX_BATCHES + 1} batches`, () => {
  const files = Array.from({ length: MAX_BATCHES + 1 }, (_, i) => file(`f${String(i).padStart(2, '0')}.ts`, 2));

  assert.throws(
    () => planBatches(files, linesFit(3), 128_000),
    (error: unknown) =>
      error instanceof ReviewFailureError &&
      /at least 21 batches/.test(error.message) &&
      /128000-token context window/.test(error.message),
  );
});

test(`planBatches accepts exactly ${MAX_BATCHES} batches`, () => {
  const files = Array.from({ length: MAX_BATCHES }, (_, i) => file(`f${String(i).padStart(2, '0')}.ts`, 2));

  assert.equal(planBatches(files, linesFit(3), 128_000).length, MAX_BATCHES);
});
