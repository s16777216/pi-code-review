import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError } from '../../settings.ts';
import { GitLabApiError, GitLabClient } from './client.ts';

type FetchCall = { url: string; headers: Record<string, string>; method?: string; body?: string };

function mockFetch(handler: (url: URL) => Response): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? new URL(input) : input;
    calls.push({
      url: url.toString(),
      headers: (init?.headers as Record<string, string>) ?? {},
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return handler(url);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

test('GitLabClient.create refuses to construct without a token, and never calls fetch', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse({}));
  try {
    await assert.rejects(
      () => GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', token: '' }),
      ConfigError,
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('GitLabClient always sends the PRIVATE-TOKEN header (never JOB-TOKEN)', async () => {
  const { calls, restore } = mockFetch(() =>
    jsonResponse({ title: 't', description: 'd', diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } }),
  );
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    await client.getMergeRequest('5');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.headers['PRIVATE-TOKEN'], 'tok');
    assert.equal(calls[0]!.headers['JOB-TOKEN'], undefined);
  } finally {
    restore();
  }
});

test('GitLabClient logs method/url/status via its logger, and never logs headers', async () => {
  const { restore } = mockFetch(() =>
    jsonResponse({ title: 't', description: 'd', diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } }),
  );
  const debugCalls: unknown[] = [];
  const fakeLogger = { debug: (obj: unknown) => debugCalls.push(obj) } as unknown as import('../../logger.ts').Logger;
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
      logger: fakeLogger,
    });
    await client.getMergeRequest('5');
    assert.equal(debugCalls.length, 1);
    const logged = debugCalls[0] as { method: string; url: string; status: number };
    assert.equal(logged.method, 'GET');
    assert.match(logged.url, /\/merge_requests\/5$/);
    assert.equal(logged.status, 200);
    assert.equal('headers' in logged, false);
  } finally {
    restore();
  }
});

test('getMergeRequest parses title, description, and diff refs', async () => {
  const { restore } = mockFetch(() =>
    jsonResponse({
      title: 'Fix bug',
      description: 'Fixes the thing',
      diff_refs: { base_sha: 'base123', start_sha: 'start123', head_sha: 'head123' },
    }),
  );
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    const mr = await client.getMergeRequest('5');
    assert.deepEqual(mr, {
      title: 'Fix bug',
      description: 'Fixes the thing',
      diffRefs: { baseSha: 'base123', startSha: 'start123', headSha: 'head123' },
    });
  } finally {
    restore();
  }
});

test('getMergeRequest throws GitLabApiError on a non-ok response', async () => {
  const { restore } = mockFetch(() => new Response('not found', { status: 404, statusText: 'Not Found' }));
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    await assert.rejects(() => client.getMergeRequest('5'), GitLabApiError);
  } finally {
    restore();
  }
});

test('getMergeRequestDiff parses a multi-file diff and follows pagination', async () => {
  let call = 0;
  const { restore } = mockFetch((url) => {
    call += 1;
    const page = url.searchParams.get('page');
    if (page === '1') {
      return jsonResponse(
        [
          { old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1,2 +1,2 @@\n-old\n+new' },
          { old_path: null, new_path: 'b.ts', diff: '@@ -0,0 +1,1 @@\n+created' },
        ],
        { headers: { 'content-type': 'application/json', 'x-next-page': '2' } },
      );
    }
    return jsonResponse([{ old_path: 'c.ts', new_path: 'c.ts', diff: '@@ -1,1 +1,1 @@\n-c\n+c2' }], {
      headers: { 'content-type': 'application/json' },
    });
  });
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    const files = await client.getMergeRequestDiff('5');
    assert.equal(files.length, 3);
    assert.equal(files[0]!.newPath, 'a.ts');
    assert.equal(files[1]!.oldPath, null);
    assert.equal(files[2]!.newPath, 'c.ts');
    assert.equal(call, 2);
  } finally {
    restore();
  }
});

test('getFileContent returns the file content on success', async () => {
  const { restore } = mockFetch(() => new Response('export const x = 1;', { status: 200 }));
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    const result = await client.getFileContent('src/a.ts', 'head123');
    assert.deepEqual(result, { content: 'export const x = 1;' });
  } finally {
    restore();
  }
});

test('getFileContent returns an error object instead of throwing on a 404', async () => {
  const { restore } = mockFetch(() => new Response('not found', { status: 404, statusText: 'Not Found' }));
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    const result = await client.getFileContent('src/missing.ts', 'head123');
    assert.ok('error' in result);
  } finally {
    restore();
  }
});

test('createDiscussion sends a position with base/start/head SHA and the new-file line', async () => {
  const { calls, restore } = mockFetch(() => new Response(null, { status: 201 }));
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    await client.createDiscussion('5', '**[important]** Off-by-one bug.', {
      baseSha: 'base123',
      startSha: 'start123',
      headSha: 'head123',
      oldPath: 'a.ts',
      newPath: 'a.ts',
      newLine: 7,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, 'POST');
    assert.match(calls[0]!.url, /\/merge_requests\/5\/discussions$/);
    const payload = JSON.parse(calls[0]!.body!);
    assert.equal(payload.body, '**[important]** Off-by-one bug.');
    assert.deepEqual(payload.position, {
      position_type: 'text',
      base_sha: 'base123',
      start_sha: 'start123',
      head_sha: 'head123',
      old_path: 'a.ts',
      new_path: 'a.ts',
      new_line: 7,
    });
  } finally {
    restore();
  }
});

test('createDiscussion throws GitLabApiError on a non-ok response', async () => {
  const { restore } = mockFetch(() => new Response('bad request', { status: 400, statusText: 'Bad Request' }));
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      token: 'tok',
    });
    await assert.rejects(
      () =>
        client.createDiscussion('5', 'body', {
          baseSha: 'b',
          startSha: 's',
          headSha: 'h',
          oldPath: 'a.ts',
          newPath: 'a.ts',
          newLine: 1,
        }),
      GitLabApiError,
    );
  } finally {
    restore();
  }
});

const API = 'https://gitlab.example.com/api/v4';

function discussionJson(id: string, notes: unknown[]): unknown {
  return { id, notes };
}

test('listDiscussions maps notes and the first note position, and follows pagination', async () => {
  const page1 = [
    discussionJson('d1', [
      {
        id: 1,
        body: 'Looks off by one.',
        author: { username: 'alice' },
        system: false,
        resolvable: true,
        resolved: false,
        position: { new_path: 'a.ts', new_line: 12, head_sha: 'h1' },
      },
    ]),
  ];
  const page2 = [discussionJson('d2', [{ id: 1, body: 'General question.', author: { username: 'bob' } }])];
  const { calls, restore } = mockFetch((url) =>
    url.searchParams.get('page') === '1'
      ? jsonResponse(page1, { headers: { 'x-next-page': '2' } })
      : jsonResponse(page2),
  );
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    const discussions = await client.listDiscussions('5');

    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/projects\/1\/merge_requests\/5\/discussions\?page=1&per_page=100$/);
    assert.deepEqual(discussions, [
      {
        id: 'd1',
        position: { newPath: 'a.ts', newLine: 12, headSha: 'h1' },
        notes: [
          { id: 1, author: 'alice', body: 'Looks off by one.', system: false, resolvable: true, resolved: false },
        ],
      },
      {
        id: 'd2',
        position: null,
        notes: [{ id: 1, author: 'bob', body: 'General question.', system: false, resolvable: false, resolved: false }],
      },
    ]);
  } finally {
    restore();
  }
});

test('listDiscussions keeps the system flag so the source provider can drop system notes', async () => {
  const { restore } = mockFetch(() =>
    jsonResponse([discussionJson('d1', [{ body: 'added 1 commit', author: { username: 'alice' }, system: true }])]),
  );
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    const [discussion] = await client.listDiscussions('5');
    assert.equal(discussion!.notes[0]!.system, true);
  } finally {
    restore();
  }
});

test('listDiscussions throws GitLabApiError on a non-ok response', async () => {
  const { restore } = mockFetch(() => new Response('nope', { status: 403, statusText: 'Forbidden' }));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await assert.rejects(() => client.listDiscussions('5'), GitLabApiError);
  } finally {
    restore();
  }
});

test('addDiscussionNote posts the body to the discussion notes endpoint', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse({}, { status: 201 }));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await client.addDiscussionNote('5', 'abc123', 'Reply.');

    assert.equal(calls[0]!.method, 'POST');
    assert.match(calls[0]!.url, /\/projects\/1\/merge_requests\/5\/discussions\/abc123\/notes$/);
    assert.deepEqual(JSON.parse(calls[0]!.body!), { body: 'Reply.' });
  } finally {
    restore();
  }
});

test('setDiscussionResolved sends PUT with the resolved flag', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse({}));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await client.setDiscussionResolved('5', 'abc123', false);

    assert.equal(calls[0]!.method, 'PUT');
    assert.match(calls[0]!.url, /\/projects\/1\/merge_requests\/5\/discussions\/abc123\?resolved=false$/);
  } finally {
    restore();
  }
});

test('addDiscussionNote and setDiscussionResolved throw GitLabApiError on a non-ok response', async () => {
  const { restore } = mockFetch(() => new Response('nope', { status: 403, statusText: 'Forbidden' }));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await assert.rejects(() => client.addDiscussionNote('5', 'abc123', 'x'), GitLabApiError);
    await assert.rejects(() => client.setDiscussionResolved('5', 'abc123', false), GitLabApiError);
  } finally {
    restore();
  }
});

test('getMergeRequestDiff reads too_large and generated_file', async () => {
  const { restore } = mockFetch(() =>
    jsonResponse([
      { old_path: 'big.js', new_path: 'big.js', diff: '', too_large: true, generated_file: false },
      {
        old_path: 'package-lock.json',
        new_path: 'package-lock.json',
        diff: '@@ -1 +1 @@\n-a\n+b',
        generated_file: true,
      },
      { old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1 +1 @@\n-a\n+b', too_large: false, generated_file: false },
    ]),
  );
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    const files = await client.getMergeRequestDiff('5');

    assert.deepEqual(
      files.map((file) => [file.newPath, file.tooLarge ?? false, file.generatedFile ?? false]),
      [
        ['big.js', true, false],
        ['package-lock.json', false, true],
        ['a.ts', false, false],
      ],
    );
  } finally {
    restore();
  }
});

test('createNote posts a general comment, and updateNote replaces a comment body', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse({}, { status: 201 }));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await client.createNote('5', 'Hello.');
    await client.updateNote('5', 42, 'Updated.');

    assert.equal(calls[0]!.method, 'POST');
    assert.match(calls[0]!.url, /\/projects\/1\/merge_requests\/5\/notes$/);
    assert.deepEqual(JSON.parse(calls[0]!.body!), { body: 'Hello.' });
    assert.equal(calls[1]!.method, 'PUT');
    assert.match(calls[1]!.url, /\/projects\/1\/merge_requests\/5\/notes\/42$/);
    assert.deepEqual(JSON.parse(calls[1]!.body!), { body: 'Updated.' });
  } finally {
    restore();
  }
});

test('createNote and updateNote throw GitLabApiError on a non-ok response', async () => {
  const { restore } = mockFetch(() => new Response('nope', { status: 403, statusText: 'Forbidden' }));
  try {
    const client = await GitLabClient.create({ apiUrl: API, projectId: '1', token: 'tok' });
    await assert.rejects(() => client.createNote('5', 'x'), GitLabApiError);
    await assert.rejects(() => client.updateNote('5', 1, 'x'), GitLabApiError);
  } finally {
    restore();
  }
});
