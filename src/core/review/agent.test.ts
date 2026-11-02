import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import {
  createGetFileContentTool,
  createListDiscussionsTool,
  DISCUSSIONS_FRAMING,
  MAX_DISCUSSIONS_CALLS,
  MAX_FILE_CONTENT_CALLS,
  MAX_FILE_CONTENT_CHARS,
} from './agent.ts';

function fixture(getFileContent: ReviewContext['getFileContent']): ReviewContext {
  return {
    title: 't',
    description: 'd',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    getFileContent,
    listDiscussions: async () => [],
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

function discussion(id: string, file: string | null, body = 'A note.'): ReviewDiscussion {
  return {
    id,
    file,
    line: file === null ? null : 1,
    positionCommit: file === null ? null : 'h',
    resolved: false,
    fromThisTool: false,
    anchor: null,
    notes: [{ author: 'alice', body }],
  };
}

function discussionsContext(result: Awaited<ReturnType<ReviewContext['listDiscussions']>>): ReviewContext {
  return { ...fixture(async () => ''), listDiscussions: async () => result };
}

function parseDiscussionsResult(text: string): unknown {
  assert.equal(text.startsWith(DISCUSSIONS_FRAMING + '\n'), true);
  return JSON.parse(text.slice(DISCUSSIONS_FRAMING.length + 1));
}

test('list_discussions returns every discussion after the framing line', async () => {
  const all = [discussion('d1', 'a.ts'), discussion('d2', null)];
  const tool = createListDiscussionsTool(discussionsContext(all));

  const result = await tool.execute('call-1', {});

  assert.equal(result.isError, undefined);
  assert.deepEqual(parseDiscussionsResult(textOf(result)), all);
});

test('list_discussions filters by file', async () => {
  const tool = createListDiscussionsTool(
    discussionsContext([discussion('d1', 'a.ts'), discussion('d2', 'b.ts'), discussion('d3', null)]),
  );

  const result = await tool.execute('call-1', { file: 'b.ts' });

  assert.deepEqual(
    (parseDiscussionsResult(textOf(result)) as ReviewDiscussion[]).map((d) => d.id),
    ['d2'],
  );
});

test('list_discussions cuts a long note body at 2000 characters', async () => {
  const tool = createListDiscussionsTool(discussionsContext([discussion('d1', 'a.ts', 'z'.repeat(5_000))]));

  const result = await tool.execute('call-1', {});
  const [only] = parseDiscussionsResult(textOf(result)) as ReviewDiscussion[];

  assert.equal(only!.notes[0]!.body, 'z'.repeat(2_000) + ' [cut: showing 2000 of 5000 characters]');
});

test('list_discussions cuts a result over 50000 characters and suggests a file filter', async () => {
  const many = Array.from({ length: 40 }, (_, i) => discussion(`d${i}`, 'a.ts', 'w'.repeat(1_900)));
  const tool = createListDiscussionsTool(discussionsContext(many));

  const text = textOf(await tool.execute('call-1', {}));

  assert.equal(text.length < DISCUSSIONS_FRAMING.length + 50_000 + 200, true);
  assert.match(text, /\[cut: showing 50000 of \d+ characters; pass "file" to narrow the result\]$/);
});

test('list_discussions returns a tool error when the discussions cannot be read', async () => {
  const tool = createListDiscussionsTool(discussionsContext({ error: 'Failed to list discussions: 403' }));

  const result = await tool.execute('call-1', {});

  assert.equal(result.isError, true);
  assert.equal(textOf(result), 'Failed to list discussions: 403');
});

test('list_discussions refuses the 11th call without reading the discussions', async () => {
  let reads = 0;
  const context: ReviewContext = {
    ...fixture(async () => ''),
    listDiscussions: async () => {
      reads += 1;
      return [];
    },
  };
  const tool = createListDiscussionsTool(context);

  for (let i = 1; i <= MAX_DISCUSSIONS_CALLS; i += 1) await tool.execute(`call-${i}`, {});
  const eleventh = await tool.execute('call-11', {});

  assert.equal(eleventh.isError, true);
  assert.match(textOf(eleventh), /at most 10 times/);
  assert.equal(reads, MAX_DISCUSSIONS_CALLS);
});
