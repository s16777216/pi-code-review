import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../../logger.ts';
import type { Finding, ReviewContext } from '../types.ts';
import type { BatchItem } from './batch.ts';
import { ChangedFile, ChangeSet } from './changedFile.ts';
import { ReviewFailureError } from './findings.ts';
import { Batch, WholeChange } from './scope.ts';

const FILES = [
  {
    oldPath: 'src/a.ts',
    newPath: 'src/a.ts',
    hunks: '@@ -1,2 +1,3 @@\n keep\n-gone\n+new1\n+new2\n@@ -20,2 +21,2 @@\n x\n-y\n+z\n',
  },
  { oldPath: 'src/b.ts', newPath: 'src/b.ts', hunks: '@@ -1 +1 @@\n-b\n+c\n' },
  { oldPath: 'yarn.lock', newPath: 'yarn.lock', hunks: '@@ -1 +1 @@\n-a\n+b\n', omitted: 'generated' as const },
];

const context: ReviewContext = {
  title: 'T',
  description: 'D',
  changedFiles: FILES,
  listDiscussions: async () => [],
  getFileContent: async () => ({ error: 'unused' }),
};
const changes = ChangeSet.from(FILES);

function logger(): { logger: Logger; warnings: Record<string, unknown>[] } {
  const warnings: Record<string, unknown>[] = [];
  return {
    logger: {
      warn: (o: Record<string, unknown>) => warnings.push(o),
      info() {},
      debug() {},
      error() {},
    } as unknown as Logger,
    warnings,
  };
}

function finding(file: string, line: number): Finding {
  return { file, line, severity: 'nit', summary: `${file}:${line}` };
}

/** A batch with the first hunk of a.ts (lines 1-3), as the planner gives it. */
function batchOfFirstHunk(): Batch {
  const a = changes.file('src/a.ts')!;
  const items: BatchItem[] = [{ file: a.withHunks([a.hunks()[0]!]), part: { index: 1, count: 2 } }];
  return new Batch(items, 1, 3);
}

// --- WholeChange ---

test('WholeChange adds no paragraph, no log field, and keeps the error as it is', () => {
  const scope = new WholeChange();
  const error = new Error('boom');

  assert.equal(scope.systemPromptParagraph(), null);
  assert.deepEqual(scope.logFields(), {});
  assert.equal(scope.describeFailure(error), error);
});

test('WholeChange keeps every finding, even one outside the diff, and does not log', () => {
  const all = [finding('src/a.ts', 1), finding('nope.ts', 9), finding('src/b.ts', 99)];

  assert.deepEqual(new WholeChange().filterFindings(all), all);
});

test('WholeChange shows every diff in its prompt, and no list of files', () => {
  const prompt = new WholeChange().prompt(context, changes);

  assert.match(prompt, /^## Changed files$/m);
  assert.match(prompt, /^### src\/a\.ts$/m);
  assert.match(prompt, /^### src\/b\.ts$/m);
  assert.match(prompt, /^### yarn\.lock\n\(diff not shown: generated file\)$/m);
  assert.doesNotMatch(prompt, /All changed files|in this part/);
});

// --- Batch ---

test('Batch gives a paragraph that names its part and count', () => {
  const paragraph = new Batch([], 2, 5).systemPromptParagraph();

  assert.match(paragraph, /split into 5 parts, and you review part 2\./);
  assert.match(paragraph, /get_file_content/);
});

test('Batch logs its own number', () => {
  assert.deepEqual(new Batch([], 4, 5).logFields(), { batch: 4 });
});

test('Batch.describeFailure names the batch and keeps the cause', () => {
  const failure = new Batch([], 2, 4).describeFailure(new Error('Request timed out.'));

  assert.ok(failure instanceof ReviewFailureError);
  assert.equal(failure.message, 'Batch 2 of 4 failed: Request timed out.');
  assert.equal((new Batch([], 1, 1).describeFailure('plain') as Error).message, 'Batch 1 of 1 failed: plain');
});

test('Batch shows the list of every file, marks its own, and shows only its own diffs', () => {
  const prompt = batchOfFirstHunk().prompt(context, changes);

  assert.match(prompt, /^## All changed files$/m);
  assert.match(prompt, /^This change is reviewed in 3 parts\. This is part 1\./m);
  assert.match(prompt, /^- src\/a\.ts \(modified, \+3 -2\) \[in this part\]$/m);
  assert.match(prompt, /^- src\/b\.ts \(modified, \+1 -1\)$/m);
  assert.match(prompt, /^- yarn\.lock \(modified, diff not shown: generated file\)$/m);
  assert.match(prompt, /^## Diffs in part 1 of 3$/m);
  assert.deepEqual(prompt.match(/^### .*$/gm), ['### src/a.ts (part 1 of 2)']);
  assert.match(prompt, /new1/);
  assert.doesNotMatch(prompt, /\+z/);
});

test('Batch keeps a finding on its own line, and on a line of a file that is not on the diff', () => {
  const { logger: log, warnings } = logger();
  const scope = batchOfFirstHunk();

  const kept = scope.filterFindings(
    [finding('src/a.ts', 1), finding('src/a.ts', 3), finding('nope.ts', 1), finding('src/a.ts', 99)],
    changes,
    log,
  );

  assert.deepEqual(
    kept.map((f) => f.summary),
    ['src/a.ts:1', 'src/a.ts:3', 'nope.ts:1', 'src/a.ts:99'],
  );
  assert.deepEqual(warnings, []);
});

test('Batch drops a finding on another part of the same file, and on another file, with outside_batch', () => {
  const { logger: log, warnings } = logger();

  const kept = batchOfFirstHunk().filterFindings(
    [finding('src/a.ts', 22), finding('src/b.ts', 1), finding('src/a.ts', 2)],
    changes,
    log,
  );

  assert.deepEqual(
    kept.map((f) => f.summary),
    ['src/a.ts:2'],
  );
  assert.deepEqual(warnings, [
    { file: 'src/a.ts', line: 22, batch: 1, reason: 'outside_batch' },
    { file: 'src/b.ts', line: 1, batch: 1, reason: 'outside_batch' },
  ]);
});

test('Batch leaves a finding on an omitted file to the checks', () => {
  const { logger: log, warnings } = logger();

  const kept = batchOfFirstHunk().filterFindings([finding('yarn.lock', 1)], changes, log);

  assert.equal(kept.length, 1);
  assert.deepEqual(warnings, []);
});

test('Batch counts a line as its own when any of its items of that path has it', () => {
  const { logger: log, warnings } = logger();
  const a = changes.file('src/a.ts')!;
  const [first, second] = a.hunks() as [ChangedFile, ChangedFile];
  const scope = new Batch(
    [
      { file: a.withHunks([first]), part: { index: 1, count: 2 } },
      { file: a.withHunks([second]), part: { index: 2, count: 2 } },
    ],
    1,
    1,
  );

  const kept = scope.filterFindings([finding('src/a.ts', 2), finding('src/a.ts', 22)], changes, log);

  assert.equal(kept.length, 2);
  assert.deepEqual(warnings, []);
});
