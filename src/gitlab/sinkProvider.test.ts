import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../types.ts';
import type { DiscussionPosition, MergeRequestWriter } from './client.ts';
import { GitLabSinkProvider } from './sinkProvider.ts';

class FakeWriter implements MergeRequestWriter {
  calls: { mergeRequestIid: string; body: string; position: DiscussionPosition }[] = [];

  constructor(private readonly failFor?: (position: DiscussionPosition) => boolean) {}

  async createDiscussion(mergeRequestIid: string, body: string, position: DiscussionPosition): Promise<void> {
    this.calls.push({ mergeRequestIid, body, position });
    if (this.failFor?.(position)) {
      throw new Error('simulated GitLab API failure');
    }
  }
}

function findings(): Finding[] {
  return [
    { file: 'a.ts', line: 3, severity: 'important', summary: 'Bug A.' },
    { file: 'b.ts', line: 5, severity: 'nit', summary: 'Bug B.' },
  ];
}

test('publish posts one discussion per finding with the diff refs and the finding line', async () => {
  const writer = new FakeWriter();
  let written: { path: string; contents: string } | undefined;
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    codeQualityReportPath: '/tmp/report.json',
    writeReport: async (path, contents) => {
      written = { path, contents };
    },
  });

  await provider.publish(findings());

  assert.equal(writer.calls.length, 2);
  assert.deepEqual(writer.calls[0]!.position, {
    baseSha: 'base',
    startSha: 'start',
    headSha: 'head',
    oldPath: 'a.ts',
    newPath: 'a.ts',
    newLine: 3,
  });
  assert.match(writer.calls[0]!.body, /Bug A\./);
  assert.ok(written);
  assert.equal(written!.path, '/tmp/report.json');
  assert.equal(JSON.parse(written!.contents).length, 2);
});

test('publish isolates a failed discussion: the other finding still posts, and the report still writes', async () => {
  const writer = new FakeWriter((position) => position.newPath === 'a.ts');
  const errors: Finding[] = [];
  let written: string | undefined;
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    codeQualityReportPath: '/tmp/report.json',
    writeReport: async (_path, contents) => {
      written = contents;
    },
    onDiscussionError: (finding) => errors.push(finding),
  });

  await provider.publish(findings());

  assert.equal(writer.calls.length, 2); // both attempted
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.file, 'a.ts');
  assert.ok(written);
  assert.equal(JSON.parse(written!).length, 2); // report still covers both findings
});

test('a failed discussion logs via the injected logger when no onDiscussionError override is given', async () => {
  const writer = new FakeWriter((position) => position.newPath === 'a.ts');
  const errorCalls: unknown[] = [];
  const fakeLogger = { error: (obj: unknown) => errorCalls.push(obj) } as unknown as import('../logger.ts').Logger;
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    codeQualityReportPath: '/tmp/report.json',
    writeReport: async () => {},
    logger: fakeLogger,
  });

  await provider.publish(findings());

  assert.equal(errorCalls.length, 1);
  assert.deepEqual(errorCalls[0], { file: 'a.ts', line: 3, error: 'simulated GitLab API failure' });
});
