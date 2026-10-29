import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext } from '../types.ts';
import { createGetFileContentTool } from './agent.ts';

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
