import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewContext } from '../types.ts';
import {
  createGetFileContentTool,
  createSubmitReviewTool,
  MAX_FILE_CONTENT_CALLS,
  MAX_FILE_CONTENT_CHARS,
  MAX_SUBMIT_ATTEMPTS,
  numberFileContent,
} from './agent.ts';
import type { ParsedReviewOutput } from './findings.ts';

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
  assert.deepEqual(result.content, [{ type: 'text', text: '   1 | export const a = 1;' }]);
});

test('get_file_content puts the new-file line number in front of each line', async () => {
  const content = Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join('\r\n') + '\r\n';
  const tool = createGetFileContentTool(fixture(async () => content));

  const lines = textOf(await tool.execute('call-1', { path: 'a.ts' })).split('\n');

  assert.equal(lines.length, 45);
  assert.equal(lines[0], '   1 | line 1');
  assert.equal(lines[41], '  42 | line 42');
});

test('numberFileContent widens the gutter for a long file, and keeps an empty line', () => {
  const content = Array.from({ length: 12_000 }, (_, i) => (i === 9_999 ? '' : 'x')).join('\n');
  const lines = numberFileContent(content).split('\n');
  assert.equal(lines[0], '    1 | x');
  assert.equal(lines[9_999], '10000 | ');
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

test('get_file_content returns a numbered file at the size limit unchanged', async () => {
  // `   1 | ` is 7 characters.
  const content = 'x'.repeat(MAX_FILE_CONTENT_CHARS - 7);
  const tool = createGetFileContentTool(fixture(async () => content));

  const result = await tool.execute('call-1', { path: 'a.ts' });

  assert.equal(textOf(result), `   1 | ${content}`);
});

test('get_file_content applies the size limit to the numbered text and says so', async () => {
  const tool = createGetFileContentTool(fixture(async () => 'y'.repeat(250_000 - 7)));

  const result = await tool.execute('call-1', { path: 'a.ts' });
  const text = textOf(result);

  assert.equal(result.isError, undefined);
  assert.equal(text.startsWith(`   1 | ${'y'.repeat(MAX_FILE_CONTENT_CHARS - 7)}\n`), true);
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

function submissions(): { onSubmit: (output: ParsedReviewOutput) => void; calls: ParsedReviewOutput[] } {
  const calls: ParsedReviewOutput[] = [];
  return { onSubmit: (output) => calls.push(output), calls };
}

test('submit_review ignores a resolved array, keeps the findings, and reports terminate: true', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  const result = await tool.execute('call-1', {
    findings: [{ file: 'a.ts', line: 1, severity: 'high', summary: 'Real bug.' }],
    resolved: [{ discussionId: 'd1', reason: 'Fixed.' }],
  } as never);

  assert.equal(result.isError, undefined);
  assert.equal(result.terminate, true);
  assert.deepEqual(calls, [{ findings: [{ file: 'a.ts', line: 1, severity: 'high', summary: 'Real bug.' }] }]);
});

test('submit_review rejects a call with one invalid finding and keeps none of it', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  const result = await tool.execute('call-1', {
    findings: [
      { file: 'a.ts', line: 1, severity: 'high', summary: 'Good.' },
      { file: 'a.ts', line: 2, severity: 'severe' as never, summary: 'Bad severity.' },
    ],
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /invalid "severity"/);
  assert.equal(calls.length, 0);
});

test('the parameters of submit_review have only findings', () => {
  const tool = createSubmitReviewTool(() => {});
  assert.deepEqual(Object.keys(tool.parameters.properties), ['findings']);
});

test('submit_review accepts a corrected second call after a rejected first call', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  const first = await tool.execute('call-1', {
    findings: [{ file: 'a.ts', line: 1, severity: 'severe' as never, summary: 'Bad.' }],
  });
  const second = await tool.execute('call-2', {
    findings: [{ file: 'a.ts', line: 1, severity: 'low', summary: 'Fixed call.' }],
  });

  assert.equal(first.isError, true);
  assert.equal(second.isError, undefined);
  assert.equal(second.terminate, true);
  assert.deepEqual(calls, [{ findings: [{ file: 'a.ts', line: 1, severity: 'low', summary: 'Fixed call.' }] }]);
});

test('submit_review ends the run on the attempt-limit-th invalid call', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);
  const badCall = { findings: [{ file: 'a.ts', line: 1, severity: 'severe' as never, summary: 'Bad.' }] };

  let last: Awaited<ReturnType<typeof tool.execute>> | undefined;
  for (let i = 1; i <= MAX_SUBMIT_ATTEMPTS; i += 1) {
    last = await tool.execute(`call-${i}`, badCall);
  }

  assert.equal(last!.isError, true);
  assert.equal(last!.terminate, true);
  assert.match(textOf(last!), new RegExp(`at most ${MAX_SUBMIT_ATTEMPTS} times`));
  assert.equal(calls.length, 0);
});

test('submit_review ignores a relatesTo of a finding, and the kept finding has none', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  const result = await tool.execute('call-1', {
    findings: [{ file: 'a.ts', line: 1, severity: 'high', summary: 'Real bug.', relatesTo: 'd1' }],
  } as never);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, [{ findings: [{ file: 'a.ts', line: 1, severity: 'high', summary: 'Real bug.' }] }]);
});

test('the findings of submit_review have no relatesTo field', () => {
  const tool = createSubmitReviewTool(() => {});
  const finding = (tool.parameters.properties.findings as unknown as { items: { properties: object } }).items;
  assert.deepEqual(Object.keys(finding.properties).sort(), ['endLine', 'file', 'line', 'severity', 'summary']);
});

test('submit_review keeps the endLine of a range finding', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  await tool.execute('call-1', {
    findings: [{ file: 'a.ts', line: 562, endLine: 600, severity: 'high', summary: 'Race.' }],
  });

  assert.deepEqual(calls, [
    { findings: [{ file: 'a.ts', line: 562, endLine: 600, severity: 'high', summary: 'Race.' }] },
  ]);
});

test('submit_review rejects a call with an endLine before the line and keeps none of it', async () => {
  const { onSubmit, calls } = submissions();
  const tool = createSubmitReviewTool(onSubmit);

  const result = await tool.execute('call-1', {
    findings: [
      { file: 'a.ts', line: 1, severity: 'high', summary: 'Good.' },
      { file: 'a.ts', line: 30, endLine: 20, severity: 'high', summary: 'Bad range.' },
    ],
  });

  assert.equal(result.isError, true);
  assert.match(textOf(result), /index 1 .*"endLine"/);
  assert.equal(calls.length, 0);
});
