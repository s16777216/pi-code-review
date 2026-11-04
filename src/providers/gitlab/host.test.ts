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

test('gitlabHost declares the four GitLab flags', () => {
  assert.deepEqual(Object.keys(gitlabHost.flags).sort(), ['gitlab-url', 'mr', 'project-id', 'token']);
});

test('gitlabHost.isChangeRequest reads --mr, then CI_MERGE_REQUEST_IID', () => {
  setEnv({});
  assert.equal(gitlabHost.isChangeRequest({}), false);
  assert.equal(gitlabHost.isChangeRequest({ mr: '7' }), true);
  setEnv({ CI_MERGE_REQUEST_IID: '456' });
  assert.equal(gitlabHost.isChangeRequest({}), true);
  setEnv({});
});

test('gitlabHost.readSettings throws ConfigError for each missing GitLab variable', () => {
  for (const missing of GITLAB_VARS) {
    setEnv({ ...FULL_ENV, [missing]: undefined });
    assert.throws(
      () => gitlabHost.readSettings({}),
      (error: unknown) => error instanceof ConfigError && error.message.includes(missing),
      `expected ConfigError naming ${missing}`,
    );
  }
  setEnv({});
});

test('gitlabHost.readSettings uses the flags when the env vars are not set', () => {
  setEnv({ GITLAB_TOKEN: 'access-token' });
  assert.deepEqual(
    gitlabHost.readSettings({ 'gitlab-url': 'https://gitlab.example.com/api/v4', 'project-id': '999', mr: '111' }),
    {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '999',
      mergeRequestIid: '111',
      token: 'access-token',
    },
  );
  setEnv({});
});

test('gitlabHost.readSettings prefers a flag over the env var, the token too', () => {
  setEnv(FULL_ENV);
  const settings = gitlabHost.readSettings({
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

test('gitlabHost.connect calls no API, and gives merge requests for review and publish', async () => {
  const original = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => {
    fetched += 1;
    throw new Error('no fetch expected');
  }) as typeof fetch;
  try {
    const connection = await gitlabHost.connect(
      { apiUrl: 'https://gitlab.example.com/api/v4', projectId: '1', mergeRequestIid: '5', token: 't' },
      silentLogger(),
    );
    assert.ok(connection.openChangeRequest() instanceof GitLabMergeRequest);
    assert.ok(connection.restore({ baseSha: 'b', startSha: 's', headSha: 'h' }) instanceof GitLabMergeRequest);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = original;
  }
});
