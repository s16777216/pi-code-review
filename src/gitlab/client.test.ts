import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError } from '../config.ts';
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

test('GitLabClient.create refuses to construct without a job token, and never calls fetch', async () => {
  const { calls, restore } = mockFetch(() => jsonResponse({}));
  try {
    await assert.rejects(
      () => GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: '' }),
      ConfigError,
    );
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test('GitLabClient sends the JOB-TOKEN header on every request by default', async () => {
  const { calls, restore } = mockFetch(() =>
    jsonResponse({ title: 't', description: 'd', diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } }),
  );
  try {
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
    await client.getMergeRequest('5');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.headers['JOB-TOKEN'], 'tok');
    assert.equal(calls[0]!.headers['PRIVATE-TOKEN'], undefined);
  } finally {
    restore();
  }
});

test('GitLabClient sends PRIVATE-TOKEN instead when authHeader is overridden, for local manual runs', async () => {
  const { calls, restore } = mockFetch(() =>
    jsonResponse({ title: 't', description: 'd', diff_refs: { base_sha: 'b', start_sha: 's', head_sha: 'h' } }),
  );
  try {
    const client = await GitLabClient.create({
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      jobToken: 'personal-access-token',
      authHeader: 'PRIVATE-TOKEN',
    });
    await client.getMergeRequest('5');
    assert.equal(calls[0]!.headers['PRIVATE-TOKEN'], 'personal-access-token');
    assert.equal(calls[0]!.headers['JOB-TOKEN'], undefined);
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
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
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
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
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
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
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
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
    const result = await client.getFileContent('src/a.ts', 'head123');
    assert.deepEqual(result, { content: 'export const x = 1;' });
  } finally {
    restore();
  }
});

test('getFileContent returns an error object instead of throwing on a 404', async () => {
  const { restore } = mockFetch(() => new Response('not found', { status: 404, statusText: 'Not Found' }));
  try {
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
    const result = await client.getFileContent('src/missing.ts', 'head123');
    assert.ok('error' in result);
  } finally {
    restore();
  }
});

test('createDiscussion sends a position with base/start/head SHA and the new-file line', async () => {
  const { calls, restore } = mockFetch(() => new Response(null, { status: 201 }));
  try {
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
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
    const client = await GitLabClient.create({ apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', jobToken: 'tok' });
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
