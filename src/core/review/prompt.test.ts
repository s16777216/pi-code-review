import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext } from '../types.ts';
import { ChangeSet, ChangedFile } from './changedFile.ts';
import type { BatchItem } from './batch.ts';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { placeholderNames, TemplateError } from '../template.ts';
import { buildBatchPrompt, buildWholePrompt, readPromptTemplates } from './prompt.ts';

/** A batch, as the planner gives it. */
interface TestBatch {
  items: BatchItem[];
  index: number;
  count: number;
}

/** The prompt of a context, with its files parsed as the engine does. */
function buildReviewPrompt(context: ReviewContext, batch?: TestBatch): string {
  const changes = ChangeSet.from(context.changedFiles);
  return batch === undefined
    ? buildWholePrompt(context, changes)
    : buildBatchPrompt(context, changes, batch.items, batch.index, batch.count);
}

function fixture(): ReviewContext {
  return {
    title: 'Fix off-by-one bug',
    description: 'Fixes a loop bound.',
    changedFiles: [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-for (i=0;i<=n;i++)\n+for (i=0;i<n;i++)' },
      { oldPath: null, newPath: 'b.ts', hunks: '@@ -0,0 +1,1 @@\n+export const b = 1;' },
    ],
    listDiscussions: async () => [],
    async getFileContent() {
      return { error: 'not used in this test' };
    },
  };
}

test('buildReviewPrompt includes the title, description, and every changed file path', () => {
  const prompt = buildReviewPrompt(fixture());

  assert.match(prompt, /Fix off-by-one bug/);
  assert.match(prompt, /Fixes a loop bound\./);
  assert.match(prompt, /a\.ts/);
  assert.match(prompt, /b\.ts/);
  assert.match(prompt, /for \(i=0;i<n;i\+\+\)/);
});

test('buildReviewPrompt falls back to a placeholder for an empty description', () => {
  const context = fixture();
  context.description = '';

  const prompt = buildReviewPrompt(context);

  assert.match(prompt, /no description provided/);
});

test('buildReviewPrompt prints new-file line numbers on added and context lines only', () => {
  const context = fixture();
  context.changedFiles = [
    { oldPath: 'c.ts', newPath: 'c.ts', hunks: ['@@ -10,2 +10,2 @@', ' keep();', '-old();', '+new();'].join('\n') },
  ];

  const prompt = buildReviewPrompt(context);

  assert.match(prompt, /^ {2}10 \| {2}keep\(\);$/m);
  assert.match(prompt, /^ {2}11 \| \+new\(\);$/m);
  assert.match(prompt, /^ {5}\| -old\(\);$/m);
});

test('buildReviewPrompt without a batch has no file list or part headings', () => {
  const prompt = buildReviewPrompt(fixture());

  assert.match(prompt, /^## Changed files$/m);
  assert.doesNotMatch(prompt, /All changed files|in this part|part \d+ of/);
});

test('buildReviewPrompt with a batch lists every changed file, marks the batch, and shows only its diffs', () => {
  const context = fixture();
  context.changedFiles.push(
    { oldPath: 'old.ts', newPath: 'old.ts', hunks: '@@ -1,2 +0,0 @@\n-x\n-y\n', deleted: true },
    { oldPath: 'from.ts', newPath: 'to.ts', hunks: '@@ -3,1 +3,1 @@\n-p\n+q' },
  );
  const b = ChangedFile.from(context.changedFiles[1]!);
  const renamed = ChangedFile.from(context.changedFiles[3]!);

  const prompt = buildReviewPrompt(context, {
    items: [{ file: b }, { file: renamed }],
    index: 2,
    count: 3,
  });

  assert.match(prompt, /^- a\.ts \(modified, \+1 -1\)$/m);
  assert.match(prompt, /^- b\.ts \(added, \+1 -0\) \[in this part\]$/m);
  assert.match(prompt, /^- old\.ts \(deleted, \+0 -2\)$/m);
  assert.match(prompt, /^- to\.ts \(renamed from from\.ts, \+1 -1\) \[in this part\]$/m);
  assert.match(prompt, /reviewed in 3 parts\. This is part 2\./);
  assert.match(prompt, /^## Diffs in part 2 of 3$/m);
  assert.deepEqual(prompt.match(/^### .*$/gm), ['### b.ts', '### to.ts']);
  assert.match(prompt, /export const b = 1;/);
  assert.doesNotMatch(prompt, /i<n;i\+\+/);
});

test('buildReviewPrompt names a part of a split file and keeps its line numbers', () => {
  const context = fixture();
  const file = ChangedFile.from({ ...context.changedFiles[0]!, hunks: '@@ -199,1 +200,1 @@\n-old\n+new' });

  const prompt = buildReviewPrompt(context, {
    items: [{ file, part: { index: 2, count: 3 } }],
    index: 4,
    count: 5,
  });

  assert.match(prompt, /^### a\.ts \(part 2 of 3\)$/m);
  assert.match(prompt, /^ 200 \| \+new$/m);
});

test('buildReviewPrompt shows an omitted file with its reason and no diff', () => {
  const context = fixture();
  context.changedFiles.push(
    { oldPath: 'big.js', newPath: 'big.js', hunks: '', omitted: 'too_large' },
    {
      oldPath: 'yarn.lock',
      newPath: 'yarn.lock',
      hunks: '@@ -1 +1 @@\n-secret-old\n+secret-new',
      omitted: 'generated',
    },
  );

  const prompt = buildReviewPrompt(context);

  assert.match(prompt, /^### big\.js\n\(diff not shown: too large\)$/m);
  assert.match(prompt, /^### yarn\.lock\n\(diff not shown: generated file\)$/m);
  assert.doesNotMatch(prompt, /secret-/);
});

test('buildReviewPrompt lists an omitted file with its reason in the batch file list', () => {
  const context = fixture();
  context.changedFiles.push({
    oldPath: 'yarn.lock',
    newPath: 'yarn.lock',
    hunks: '@@ -1 +1 @@\n-x\n+y',
    omitted: 'generated',
  });
  const a = context.changedFiles[0]!;

  const prompt = buildReviewPrompt(context, { items: [{ file: ChangedFile.from(a) }], index: 1, count: 2 });

  assert.match(prompt, /^- yarn\.lock \(modified, diff not shown: generated file\)$/m);
  assert.doesNotMatch(prompt, /^### yarn\.lock/m);
});

// --- the built-in templates (`move-review-prompt-to-templates`) ---

test('each built-in prompt template holds all of its placeholders and no other', () => {
  const names = (text: string) => [...new Set(placeholderNames(text))].sort();
  const { batch, whole } = readPromptTemplates();

  assert.deepEqual(names(batch), ['count', 'description', 'diffs', 'index', 'list', 'title']);
  assert.deepEqual(names(whole), ['description', 'files', 'title']);
});

test('buildReviewPrompt keeps the text ${title} that a diff or a title holds', () => {
  const context = fixture();
  context.title = 'Rename ${description}';
  context.changedFiles[0] = {
    oldPath: 'a.ts',
    newPath: 'a.ts',
    hunks: '@@ -1 +1 @@\n-const a = `${title}`;\n+const a = `${title} ${files}`;',
  };
  const a = context.changedFiles[0];

  const whole = buildReviewPrompt(context);
  assert.match(whole, /^# Change: Rename \$\{description\}$/m);
  assert.match(whole, /\+const a = `\$\{title\} \$\{files\}`;/);

  const batch = buildReviewPrompt(context, { items: [{ file: ChangedFile.from(a) }], index: 1, count: 1 });
  assert.match(batch, /\+const a = `\$\{title\} \$\{files\}`;/);
});

test('readPromptTemplates throws a TemplateError that names a missing file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prompt-templates-'));
  try {
    assert.throws(
      () => readPromptTemplates(dir),
      (error) => error instanceof TemplateError && /BATCH_PROMPT\.md/.test(error.message),
    );
    await writeFile(join(dir, 'BATCH_PROMPT.md'), '${title}');
    assert.throws(
      () => readPromptTemplates(dir),
      (error) => error instanceof TemplateError && /WHOLE_PROMPT\.md/.test(error.message),
    );
    await writeFile(join(dir, 'WHOLE_PROMPT.md'), '${title}\r\n');
    assert.deepEqual(readPromptTemplates(dir), { batch: '${title}', whole: '${title}' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
