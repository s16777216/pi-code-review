import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  DiscussionPosition,
  FileContentResult,
  GitLabChangedFile,
  GitLabDiscussion,
  MergeRequestMetadata,
} from './client.ts';
import { GitLabMergeRequest, type GitLabApi } from './mergeRequest.ts';

const REFS = { baseSha: 'base', startSha: 'start', headSha: 'head' };

/** Records the write calls; the read calls are not used by these tests. */
class FakeWriter implements GitLabApi {
  log: unknown[][] = [];
  discussions: GitLabDiscussion[] = [];
  /** What `getMergeRequestDiff` returns, for `createDiscussion`'s old-line lookup. */
  diff: GitLabChangedFile[] = [];
  async listDiscussions(iid: string): Promise<GitLabDiscussion[]> {
    this.log.push(['list', iid]);
    return this.discussions;
  }
  async getMergeRequest(): Promise<MergeRequestMetadata> {
    throw new Error('not used');
  }
  async getMergeRequestDiff(): Promise<GitLabChangedFile[]> {
    return this.diff;
  }
  async getFileContent(): Promise<FileContentResult> {
    throw new Error('not used');
  }
  async createDiscussion(iid: string, body: string, position: DiscussionPosition): Promise<void> {
    this.log.push(['createDiscussion', iid, body, position]);
  }
  async addDiscussionNote(iid: string, id: string, body: string): Promise<void> {
    this.log.push(['addDiscussionNote', iid, id, body]);
  }
  async setDiscussionResolved(iid: string, id: string, resolved: boolean): Promise<void> {
    this.log.push(['setDiscussionResolved', iid, id, resolved]);
  }
  async createNote(iid: string, body: string): Promise<void> {
    this.log.push(['createNote', iid, body]);
  }
  async updateNote(iid: string, noteId: number, body: string): Promise<void> {
    this.log.push(['updateNote', iid, noteId, body]);
  }
}

test('GitLabMergeRequest positions a new discussion with the diff refs and the new-file line', async () => {
  const writer = new FakeWriter();
  writer.diff = [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,2 @@\n context\n+added3' }];
  await new GitLabMergeRequest(writer, '5', REFS).createDiscussion({ file: 'a.ts', line: 3 }, 'Body.');

  assert.deepEqual(writer.log, [
    [
      'createDiscussion',
      '5',
      'Body.',
      {
        baseSha: 'base',
        startSha: 'start',
        headSha: 'head',
        oldPath: 'a.ts',
        newPath: 'a.ts',
        newLine: 3,
        oldLine: null,
      },
    ],
  ]);
});

test('GitLabMergeRequest includes the old-file line when positioning a comment on a context line', async () => {
  const writer = new FakeWriter();
  writer.diff = [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -10,2 +20,3 @@\n keep\n-gone\n+added' }];
  await new GitLabMergeRequest(writer, '5', REFS).createDiscussion({ file: 'a.ts', line: 20 }, 'Context note.');

  const [, , , position] = writer.log[0]!;
  assert.deepEqual(position, {
    baseSha: 'base',
    startSha: 'start',
    headSha: 'head',
    oldPath: 'a.ts',
    newPath: 'a.ts',
    newLine: 20,
    oldLine: 10,
  });
});

test('GitLabMergeRequest fetches the diff for old-line lookup only once across several createDiscussion calls', async () => {
  const writer = new FakeWriter();
  let diffCalls = 0;
  const original = writer.getMergeRequestDiff.bind(writer);
  writer.getMergeRequestDiff = async () => {
    diffCalls += 1;
    return original();
  };
  writer.diff = [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,2 @@\n context\n+added3' }];
  const mr = new GitLabMergeRequest(writer, '5', REFS);

  await mr.createDiscussion({ file: 'a.ts', line: 3 }, 'One.');
  await mr.createDiscussion({ file: 'a.ts', line: 3 }, 'Two.');

  assert.equal(diffCalls, 1);
});

test('GitLabMergeRequest sends each gateway action to its merge request', async () => {
  const writer = new FakeWriter();
  const mr = new GitLabMergeRequest(writer, '5', REFS);

  await mr.reply('d1', 'R.');
  await mr.setResolved('d1', false);
  await mr.createNote('N.');
  await mr.updateNote(42, 'U.');

  assert.deepEqual(writer.log, [
    ['addDiscussionNote', '5', 'd1', 'R.'],
    ['setDiscussionResolved', '5', 'd1', false],
    ['createNote', '5', 'N.'],
    ['updateNote', '5', 42, 'U.'],
  ]);
});

test('GitLabMergeRequest lists the discussions as HostDiscussion', async () => {
  const writer = new FakeWriter();
  writer.discussions = [
    {
      id: 'd1',
      position: { newPath: 'a.ts', newLine: 1, headSha: 'h' },
      notes: [{ id: 3, author: 'bot', body: 'x', system: false, resolvable: true, resolved: true }],
    },
  ];

  assert.deepEqual(await new GitLabMergeRequest(writer, '5', REFS).list(), [
    {
      id: 'd1',
      position: { file: 'a.ts', line: 1, commit: 'h' },
      resolved: true,
      notes: [{ id: 3, author: 'bot', body: 'x' }],
    },
  ]);
});

// --- The read side: load() ---

class FakeGitLabApi implements GitLabApi {
  calls: { method: string; args: unknown[] }[] = [];
  /** What `listDiscussions` returns, or an error it throws. */
  discussions: GitLabDiscussion[] | Error = [];

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

  async listDiscussions(mergeRequestIid: string): Promise<GitLabDiscussion[]> {
    this.calls.push({ method: 'listDiscussions', args: [mergeRequestIid] });
    if (this.discussions instanceof Error) throw this.discussions;
    return this.discussions;
  }

  async createDiscussion(): Promise<void> {}
  async addDiscussionNote(): Promise<void> {}
  async setDiscussionResolved(): Promise<void> {}
  async createNote(): Promise<void> {}
  async updateNote(): Promise<void> {}
}

test('load builds a ReviewContext from the merge request metadata and diff', async () => {
  const fake = new FakeGitLabApi(
    {
      title: 'Fix bug',
      description: 'Fixes the thing',
      diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' },
    },
    [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    { 'a.ts': { content: 'export const a = 2;' } },
  );
  const { context } = await new GitLabMergeRequest(fake, '5').load();

  assert.equal(context.title, 'Fix bug');
  assert.equal(context.description, 'Fixes the thing');
  assert.deepEqual(context.changedFiles, [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }]);
  assert.deepEqual(fake.calls[0], { method: 'getMergeRequest', args: ['5'] });
  assert.deepEqual(fake.calls[1], { method: 'getMergeRequestDiff', args: ['5'] });
});

test("load's getFileContent reads at the merge request's head SHA", async () => {
  const fake = new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' } },
    [],
    { 'a.ts': { content: 'export const a = 2;' } },
  );
  const { context } = await new GitLabMergeRequest(fake, '5').load();

  const content = await context.getFileContent('a.ts');

  assert.equal(content, 'export const a = 2;');
  assert.deepEqual(fake.calls.at(-1), { method: 'getFileContent', args: ['a.ts', 'head123'] });
});

test("load's getFileContent surfaces an error object instead of throwing", async () => {
  const fake = new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head123' } },
    [],
    {},
  );
  const { context } = await new GitLabMergeRequest(fake, '5').load();

  const result = await context.getFileContent('missing.ts');

  assert.deepEqual(result, { error: 'no fixture for missing.ts' });
});

test('load returns the diff refs as the snapshot, and createDiscussion needs them', async () => {
  const fake = new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base123', startSha: 'start123', headSha: 'head123' } },
    [],
    {},
  );
  const mr = new GitLabMergeRequest(fake, '5');

  await assert.rejects(() => mr.createDiscussion({ file: 'a.ts', line: 1 }, 'x'), /needs the diff refs/);

  const { snapshot } = await mr.load();

  assert.deepEqual(snapshot, { baseSha: 'base123', startSha: 'start123', headSha: 'head123' });
  await mr.createDiscussion({ file: 'a.ts', line: 1 }, 'x');
});

function discussionFixture(): FakeGitLabApi {
  return new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'b', startSha: 's', headSha: 'h' } },
    [],
    {},
  );
}

test("listDiscussions maps GitLab discussions, drops system notes, and marks this tool's own discussions", async () => {
  const fake = discussionFixture();
  fake.discussions = [
    {
      id: 'own',
      position: { newPath: 'a.ts', newLine: 3, headSha: 'h0' },
      notes: [
        {
          id: 1,
          author: 'bot',
          body: '<!-- pi-code-review -->\n**[important]** Bug.',
          system: false,
          resolvable: true,
          resolved: true,
        },
        { id: 1, author: 'alice', body: 'Fixed, thanks.', system: false, resolvable: true, resolved: true },
      ],
    },
    {
      id: 'person',
      position: null,
      notes: [
        { id: 1, author: 'carol', body: 'added 1 commit', system: true, resolvable: false, resolved: false },
        { id: 1, author: 'bob', body: 'This is intentional.', system: false, resolvable: false, resolved: false },
      ],
    },
    {
      id: 'only-system',
      position: null,
      notes: [
        { id: 1, author: 'carol', body: 'changed the description', system: true, resolvable: false, resolved: false },
      ],
    },
  ];
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;

  assert.deepEqual(await context.listDiscussions(), [
    {
      id: 'own',
      file: 'a.ts',
      line: 3,
      positionCommit: 'h0',
      resolved: true,
      fromThisTool: true,
      anchor: null,
      notes: [
        { author: 'bot', body: '**[important]** Bug.' },
        { author: 'alice', body: 'Fixed, thanks.' },
      ],
    },
    {
      id: 'person',
      file: null,
      line: null,
      positionCommit: null,
      resolved: false,
      fromThisTool: false,
      anchor: null,
      notes: [{ author: 'bob', body: 'This is intentional.' }],
    },
  ]);
});

test('listDiscussions treats a discussion as open while any resolvable note is unresolved', async () => {
  const fake = discussionFixture();
  fake.discussions = [
    {
      id: 'd',
      position: null,
      notes: [
        { id: 1, author: 'a', body: 'x', system: false, resolvable: true, resolved: true },
        { id: 1, author: 'b', body: 'y', system: false, resolvable: true, resolved: false },
      ],
    },
  ];
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;
  const result = await context.listDiscussions();

  assert.equal(Array.isArray(result) && result[0]!.resolved, false);
});

test('listDiscussions calls the GitLab API once, however often it is called', async () => {
  const fake = discussionFixture();
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;

  await context.listDiscussions();
  await context.listDiscussions();

  assert.equal(fake.calls.filter((call) => call.method === 'listDiscussions').length, 1);
});

test('listDiscussions returns an error object instead of throwing when the API fails', async () => {
  const fake = discussionFixture();
  fake.discussions = new Error('403 Forbidden');
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;

  assert.deepEqual(await context.listDiscussions(), { error: 'Failed to list discussions: 403 Forbidden' });
});

test('listDiscussions reads the anchor from the marker of a discussion this tool started', async () => {
  const fake = discussionFixture();
  fake.discussions = [
    {
      id: 'with-anchor',
      position: null,
      notes: [
        {
          id: 1,
          author: 'bot',
          body: '<!-- pi-code-review anchor=3f9a1c0b2d4e5f60 -->\n**[nit]** x',
          system: false,
          resolvable: true,
          resolved: false,
        },
      ],
    },
    {
      id: 'without-anchor',
      position: null,
      notes: [
        {
          id: 1,
          author: 'bot',
          body: '<!-- pi-code-review -->\n**[nit]** y',
          system: false,
          resolvable: true,
          resolved: false,
        },
      ],
    },
  ];
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;
  const result = await context.listDiscussions();

  assert.deepEqual(Array.isArray(result) && result.map((d) => [d.id, d.anchor, d.notes[0]!.body]), [
    ['with-anchor', '3f9a1c0b2d4e5f60', '**[nit]** x'],
    ['without-anchor', null, '**[nit]** y'],
  ]);
});

test('load marks a file that the change deletes', async () => {
  const fake = new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'b', startSha: 's', headSha: 'h' } },
    [
      { oldPath: 'gone.ts', newPath: 'gone.ts', diffHunks: '@@ -1,1 +0,0 @@\n-x', deletedFile: true },
      { oldPath: 'kept.ts', newPath: 'kept.ts', diffHunks: '@@ -1,1 +1,1 @@\n-x\n+y' },
    ],
    {},
  );
  const context = (await new GitLabMergeRequest(fake, '5').load()).context;

  assert.equal(context.changedFiles[0]!.deleted, true);
  assert.equal('deleted' in context.changedFiles[1]!, false);
});

test('load marks omitted files, with too_large before generated', async () => {
  const fake = new FakeGitLabApi(
    { title: 't', description: 'd', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [
      { oldPath: 'big.js', newPath: 'big.js', diffHunks: '', tooLarge: true },
      { oldPath: 'yarn.lock', newPath: 'yarn.lock', diffHunks: '@@ -1 +1 @@\n-a\n+b', generatedFile: true },
      { oldPath: 'gen.min.js', newPath: 'gen.min.js', diffHunks: '', tooLarge: true, generatedFile: true },
      { oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1 +1 @@\n-a\n+b' },
    ],
    {},
  );

  const context = (await new GitLabMergeRequest(fake, '5').load()).context;

  assert.deepEqual(
    context.changedFiles.map((file) => [file.newPath, file.omitted ?? null, file.hunks]),
    [
      ['big.js', 'too_large', ''],
      ['yarn.lock', 'generated', '@@ -1 +1 @@\n-a\n+b'],
      ['gen.min.js', 'too_large', ''],
      ['a.ts', null, '@@ -1 +1 @@\n-a\n+b'],
    ],
  );
});
