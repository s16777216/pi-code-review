import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError } from '../../settings.ts';
import { isMergeRequestPipeline, loadGitlabConnectionConfig } from './config.ts';

const GITLAB_VARS = ['CI_API_V4_URL', 'CI_PROJECT_ID', 'CI_MERGE_REQUEST_IID', 'GITLAB_TOKEN'];

test('isMergeRequestPipeline reflects CI_MERGE_REQUEST_IID presence', () => {
  delete process.env.CI_MERGE_REQUEST_IID;
  assert.equal(isMergeRequestPipeline(), false);
  process.env.CI_MERGE_REQUEST_IID = '456';
  assert.equal(isMergeRequestPipeline(), true);
  delete process.env.CI_MERGE_REQUEST_IID;
});

test('isMergeRequestPipeline accepts a CLI --mr value even when CI_MERGE_REQUEST_IID is not set', () => {
  delete process.env.CI_MERGE_REQUEST_IID;
  assert.equal(isMergeRequestPipeline({ mergeRequestIid: '456' }), true);
});

test('loadGitlabConnectionConfig names the first missing setting, in order', () => {
  for (const name of GITLAB_VARS) delete process.env[name];
  process.env.CI_PROJECT_ID = '1';
  assert.throws(
    () => loadGitlabConnectionConfig({}),
    (error: unknown) => error instanceof ConfigError && /CI_API_V4_URL/.test(error.message),
  );
  assert.throws(
    () => loadGitlabConnectionConfig({ apiUrl: 'https://gitlab.example.com/api/v4' }),
    (error: unknown) => error instanceof ConfigError && /CI_MERGE_REQUEST_IID/.test(error.message),
  );
  delete process.env.CI_PROJECT_ID;
});

test('loadGitlabConnectionConfig prefers a flag over its environment variable', () => {
  process.env.CI_API_V4_URL = 'https://env.example.com/api/v4';
  const config = loadGitlabConnectionConfig({
    apiUrl: 'https://flag.example.com/api/v4',
    projectId: '7',
    mergeRequestIid: '8',
    token: 't',
  });
  assert.deepEqual(config, {
    apiUrl: 'https://flag.example.com/api/v4',
    projectId: '7',
    mergeRequestIid: '8',
    token: 't',
  });
  delete process.env.CI_API_V4_URL;
});
