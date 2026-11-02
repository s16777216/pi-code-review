import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext } from '../types.ts';
import { createGetFileContentTool, MAX_FILE_CONTENT_CALLS, MAX_FILE_CONTENT_CHARS } from './agent.ts';

function fixture(getFileContent: ReviewContext['getFileContent']): ReviewContext {
  return {
    title: 't',
    description: 'd',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    getFileContent,
  };
}

test('get_file_content returns the file content for a changed file', async () => {
  const context = fixture(async (path) => (path === 'a.ts' ? 'export const a = 1;' : { error: 'unexpected path' }));
  const tool = createGetFileContentTool(context);

  const result = await tool.execute('call-1', { path: 'a.ts' });

  assert.equal(result.isError, undefined);
  assert.deepEqual(result.content, [{ type: 'text', text: 'export const a = 1;' }]);
});

test('get_file_content refuses a path outside the changed files', async () => {
  const context = fixture(async () => 'should not be called');
  const tool = createGetFileContentTool(context);

  const result = await tool.execute('call-1', { path: 'secret.env' });

  assert.equal(result.isError, true);
  assert.match((result.content[0] as { text: string }).text, /not a file this change touched/);
});

test('get_file_content surfaces a ReviewContext error as a tool error', async () => {
  const context = fixture(async () => ({ error: 'upstream fetch failed' }));
  const tool = createGetFileContentTool(context);

  const result = await tool.execute('call-1', { path: 'a.ts' });

  assert.equal(result.isError, true);
  assert.deepEqual(result.content, [{ type: 'text', text: 'upstream fetch failed' }]);
});

function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}

test('get_file_content returns a file at the size limit unchanged', async () => {
  const content = 'x'.repeat(MAX_FILE_CONTENT_CHARS);
  const tool = createGetFileContentTool(fixture(async () => content));

  const result = await tool.execute('call-1', { path: 'a.ts' });

  assert.equal(textOf(result), content);
});

test('get_file_content cuts a file over the size limit and says so', async () => {
  const tool = createGetFileContentTool(fixture(async () => 'y'.repeat(250_000)));

  const result = await tool.execute('call-1', { path: 'a.ts' });
  const text = textOf(result);

  assert.equal(result.isError, undefined);
  assert.equal(text.startsWith('y'.repeat(MAX_FILE_CONTENT_CHARS) + '\n'), true);
  assert.match(text, /\[cut: showing 100000 of 250000 characters\]$/);
});

test('get_file_content answers the 30th call and refuses the 31st without reading the file', async () => {
  let reads = 0;
  const tool = createGetFileContentTool(
    fixture(async () => {
      reads += 1;
      return 'content';
    }),
  );

  for (let i = 1; i < MAX_FILE_CONTENT_CALLS; i += 1) await tool.execute(`call-${i}`, { path: 'a.ts' });
  const thirtieth = await tool.execute('call-30', { path: 'a.ts' });
  const thirtyFirst = await tool.execute('call-31', { path: 'a.ts' });

  assert.equal(thirtieth.isError, undefined);
  assert.equal(thirtyFirst.isError, true);
  assert.match(textOf(thirtyFirst), /at most 30 times/);
  assert.equal(reads, MAX_FILE_CONTENT_CALLS);
});
