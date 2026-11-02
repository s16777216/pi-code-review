import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FileContentResult, GitLabChangedFile, MergeRequestMetadata, MergeRequestProvider } from './client.ts';
import { GitLabSourceProvider } from './sourceProvider.ts';

class FakeMergeRequestProvider implements MergeRequestProvider {
  calls: { method: string; args: unknown[] }[] = [];

  constructor(
    private readonly metadata: MergeRequestMetadata,
    private readonly diff: GitLabChangedFile[],
    private readonly files: Record<string, FileContentResult>,
  ) {}

  async getMergeRequest(mergeRequestIid: string): Promise<MergeRequestMetadata> {
    this.calls.push({ method: 'getMergeRequest', args: [mergeRequestIid] });
    return this.metadata;
  }

  async getMergeRequestDiff(mergeRequestIid: string): Promise<GitLabChangedFile[]> {
    this.calls.push({ method: 'getMergeRequestDiff', args: [mergeRequestIid] });
    return this.diff;
  }

  async getFileContent(path: string, ref: string): Promise<FileContentResult> {
    this.calls.push({ method: 'getFileContent', args: [path, ref] });
    return this.files[path] ?? { error: `no fixture for ${path}` };
  }
}

test('GitLabSourceProvider builds a ReviewContext from the merge request metadata and diff', async () => {
  const fake = new FakeMergeRequestProvider(
    {
      title: 'Fix bug',
      description: 'Fixes the thing',
      diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' },
    },
    [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    { 'a.ts': { content: 'export const a = 2;' } },
  );
  const provider = new GitLabSourceProvider(fake, '5');

  const context = await provider.buildReviewContext();

  assert.equal(context.title, 'Fix bug');
  assert.equal(context.description, 'Fixes the thing');
  assert.deepEqual(context.changedFiles, [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }]);
  assert.deepEqual(fake.calls[0], { method: 'getMergeRequest', args: ['5'] });
  assert.deepEqual(fake.calls[1], { method: 'getMergeRequestDiff', args: ['5'] });
});

test("GitLabSourceProvider's getFileContent reads at the merge request's head SHA", async () => {
  const fake = new FakeMergeRequestProvider(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' } },
    [],
    { 'a.ts': { content: 'export const a = 2;' } },
  );
  const provider = new GitLabSourceProvider(fake, '5');
  const context = await provider.buildReviewContext();

  const content = await context.getFileContent('a.ts');

  assert.equal(content, 'export const a = 2;');
  assert.deepEqual(fake.calls.at(-1), { method: 'getFileContent', args: ['a.ts', 'head123'] });
});

test("GitLabSourceProvider's getFileContent surfaces an error object instead of throwing", async () => {
  const fake = new FakeMergeRequestProvider(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' } },
    [],
    {},
  );
  const provider = new GitLabSourceProvider(fake, '5');
  const context = await provider.buildReviewContext();

  const result = await context.getFileContent('missing.ts');

  assert.deepEqual(result, { error: 'no fixture for missing.ts' });
});

test('getDiffRefs returns the diff refs from the most recent buildReviewContext() call', async () => {
  const fake = new FakeMergeRequestProvider(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base123', startSha: 'start123', headSha: 'head123' } },
    [],
    {},
  );
  const provider = new GitLabSourceProvider(fake, '5');

  assert.throws(() => provider.getDiffRefs());

  await provider.buildReviewContext();

  assert.deepEqual(provider.getDiffRefs(), { baseSha: 'base123', startSha: 'start123', headSha: 'head123' });
});
