import { test } from 'node:test';
import assert from 'node:assert/strict';
import { silentLogger } from '../../logger.ts';
import { ConfigError } from '../../settings.ts';
import { gitlabHost } from './host.ts';
import { GitLabMergeRequest } from './mergeRequest.ts';

const GITLAB_VARS = ['CI_API_V4_URL', 'CI_PROJECT_ID', 'CI_MERGE_REQUEST_IID', 'GITLAB_TOKEN'];

function setEnv(values: Record<string, string | undefined>): void {
  for (const name of GITLAB_VARS) delete process.env[name];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) process.env[name] = value;
  }
}

const FULL_ENV = {
  CI_API_V4_URL: 'https://gitlab.example.com/api/v4',
  CI_PROJECT_ID: '123',
  CI_MERGE_REQUEST_IID: '456',
  GITLAB_TOKEN: 'access-token',
};

test('gitlabHost declares the four GitLab flags for review', () => {
  assert.deepEqual(Object.keys(gitlabHost.reviewFlags).sort(), ['gitlab-url', 'mr', 'project-id', 'token']);
});

test('gitlabHost declares only the URL and the token for publish', () => {
  assert.deepEqual(Object.keys(gitlabHost.publishFlags).sort(), ['gitlab-url', 'token']);
});

test('gitlabHost.isChangeRequest reads --mr, then CI_MERGE_REQUEST_IID', () => {
  setEnv({});
  assert.equal(gitlabHost.isChangeRequest({}), false);
  assert.equal(gitlabHost.isChangeRequest({ mr: '7' }), true);
  setEnv({ CI_MERGE_REQUEST_IID: '456' });
  assert.equal(gitlabHost.isChangeRequest({}), true);
  setEnv({});
});

test('gitlabHost.readReviewSettings throws ConfigError for each missing GitLab variable', () => {
  for (const missing of GITLAB_VARS) {
    setEnv({ ...FULL_ENV, [missing]: undefined });
    assert.throws(
      () => gitlabHost.readReviewSettings({}),
      (error: unknown) => error instanceof ConfigError && error.message.includes(missing),
      `expected ConfigError naming ${missing}`,
    );
  }
  setEnv({});
});

test('gitlabHost.readReviewSettings uses the flags when the env vars are not set', () => {
  setEnv({ GITLAB_TOKEN: 'access-token' });
  assert.deepEqual(
    gitlabHost.readReviewSettings({ 'gitlab-url': 'https://gitlab.example.com/api/v4', 'project-id': '999', mr: '111' }),
    {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '999',
      mergeRequestIid: '111',
      token: 'access-token',
    },
  );
  setEnv({});
});

test('gitlabHost.readReviewSettings prefers a flag over the env var, the token too', () => {
  setEnv(FULL_ENV);
  const settings = gitlabHost.readReviewSettings({
    'gitlab-url': 'https://from-cli.example.com/api/v4',
    token: 'token-from-cli',
  });
  assert.equal(settings.apiUrl, 'https://from-cli.example.com/api/v4');
  assert.equal(settings.projectId, '123');
  assert.equal(settings.token, 'token-from-cli');
  setEnv({});
});

test('gitlabHost.parseSnapshot checks the diff refs', () => {
  const refs = { baseSha: 'b', startSha: 's', headSha: 'h' };
  assert.deepEqual(gitlabHost.parseSnapshot({ ...refs, extra: 1 }), refs);
  assert.throws(() => gitlabHost.parseSnapshot({ baseSha: 'b' }), /"diffRefs\.startSha"/);
});

test('gitlabHost.readPublishSettings needs only the URL and the token, and ignores the project and merge request', () => {
  setEnv({ CI_API_V4_URL: 'https://gitlab.example.com/api/v4', GITLAB_TOKEN: 'access-token' });
  assert.deepEqual(gitlabHost.readPublishSettings({}), {
    apiUrl: 'https://gitlab.example.com/api/v4',
    token: 'access-token',
  });
  setEnv({ ...FULL_ENV, CI_PROJECT_ID: '999', CI_MERGE_REQUEST_IID: '888' });
  assert.deepEqual(Object.keys(gitlabHost.readPublishSettings({})).sort(), ['apiUrl', 'token']);
  setEnv({});
});

test('gitlabHost.readPublishSettings throws ConfigError naming a missing URL or token', () => {
  for (const missing of ['CI_API_V4_URL', 'GITLAB_TOKEN']) {
    setEnv({ ...FULL_ENV, [missing]: undefined });
    assert.throws(
      () => gitlabHost.readPublishSettings({}),
      (error: unknown) => error instanceof ConfigError && error.message.includes(missing),
    );
  }
  setEnv({});
});

test('gitlabHost.parseSource checks the host, the project, and the merge request', () => {
  const source = { host: 'gitlab', projectId: '12', mergeRequestIid: '7' };
  assert.deepEqual(gitlabHost.parseSource({ ...source, extra: 1 }), source);
  assert.throws(() => gitlabHost.parseSource(undefined), /"source"/);
  assert.throws(() => gitlabHost.parseSource({ ...source, host: undefined }), /"source.host"/);
  assert.throws(() => gitlabHost.parseSource({ ...source, host: 'github' }), /"github"/);
  assert.throws(() => gitlabHost.parseSource({ ...source, projectId: '' }), /"source.projectId"/);
  assert.throws(() => gitlabHost.parseSource({ ...source, mergeRequestIid: 7 }), /"source.mergeRequestIid"/);
});

test('gitlabHost.openChangeRequest and restore call no API, and restore targets the source project', async () => {
  const original = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched += 1;
    throw new Error('no fetch expected');
  }) as typeof fetch;
  try {
    const opened = await gitlabHost.openChangeRequest(
      { apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', mergeRequestIid: '5', token: 't' },
      silentLogger(),
    );
    assert.ok(opened.changeRequest instanceof GitLabMergeRequest);
    assert.deepEqual(opened.source, { host: 'gitlab', projectId: '1', mergeRequestIid: '5' });

    const gateway = await gitlabHost.restore(
      { apiUrl: 'https://gitlab.example.com/api/v4', token: 't' },
      { host: 'gitlab', projectId: '12', mergeRequestIid: '7' },
      { baseSha: 'b', startSha: 's', headSha: 'h' },
      silentLogger(),
    );
    assert.ok(gateway instanceof GitLabMergeRequest);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('gitlabHost.restore sends its requests to the project and merge request of the source', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    urls.push(String(input));
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const gateway = await gitlabHost.restore(
      { apiUrl: 'https://gitlab.example.com/api/v4', token: 't' },
      { host: 'gitlab', projectId: '12', mergeRequestIid: '7' },
      { baseSha: 'b', startSha: 's', headSha: 'h' },
      silentLogger(),
    );
    await gateway.list();
    assert.ok(urls.length > 0);
    assert.ok(urls.every((url) => url.includes('/projects/12/merge_requests/7/')), urls.join(', '));
  } finally {
    globalThis.fetch = original;
  }
});
