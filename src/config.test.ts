import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, isMergeRequestPipeline, loadConfig } from './config.ts';

const REQUIRED_VARS = [
  'CI_API_V4_URL',
  'CI_PROJECT_ID',
  'CI_MERGE_REQUEST_IID',
  'CI_JOB_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
];

function withFullEnv(overrides: Record<string, string | undefined> = {}): void {
  const full: Record<string, string> = {
    CI_API_V4_URL: 'https://gitlab.example.com/api/v4',
    CI_PROJECT_ID: '123',
    CI_MERGE_REQUEST_IID: '456',
    CI_JOB_TOKEN: 'job-token',
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-4.1',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
  };
  for (const [key, value] of Object.entries({ ...full, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearEnv(): void {
  for (const key of [...REQUIRED_VARS, 'FAIL_ON_SEVERITY', 'GITLAB_AUTH_HEADER']) {
    delete process.env[key];
  }
}

test('loadConfig throws ConfigError for each missing required variable', () => {
  for (const missing of REQUIRED_VARS) {
    clearEnv();
    withFullEnv({ [missing]: undefined });
    assert.throws(() => loadConfig(), ConfigError, `expected ConfigError when ${missing} is missing`);
  }
  clearEnv();
});

test('loadConfig returns a config object when all required variables are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadConfig();
  assert.equal(config.gitlab.apiUrl, 'https://gitlab.example.com/api/v4');
  assert.equal(config.openai.model, 'gpt-4.1');
  assert.equal(config.openai.baseUrl, 'https://api.openai.com/v1');
  assert.equal(config.failOnSeverity, 'important');
  assert.equal(config.gitlab.authHeader, 'JOB-TOKEN');
  clearEnv();
});

test('loadConfig accepts GITLAB_AUTH_HEADER=PRIVATE-TOKEN, for local manual runs with a personal access token', () => {
  clearEnv();
  withFullEnv({ GITLAB_AUTH_HEADER: 'PRIVATE-TOKEN' });
  assert.equal(loadConfig().gitlab.authHeader, 'PRIVATE-TOKEN');
  clearEnv();
});

test('loadConfig rejects an invalid GITLAB_AUTH_HEADER value', () => {
  clearEnv();
  withFullEnv({ GITLAB_AUTH_HEADER: 'Authorization' });
  assert.throws(() => loadConfig(), ConfigError);
  clearEnv();
});

test('loadConfig rejects an invalid FAIL_ON_SEVERITY value', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'critical' });
  assert.throws(() => loadConfig(), ConfigError);
  clearEnv();
});

test('loadConfig accepts FAIL_ON_SEVERITY=none', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'none' });
  assert.equal(loadConfig().failOnSeverity, 'none');
  clearEnv();
});

test('isMergeRequestPipeline reflects CI_MERGE_REQUEST_IID presence', () => {
  clearEnv();
  assert.equal(isMergeRequestPipeline(), false);
  process.env.CI_MERGE_REQUEST_IID = '456';
  assert.equal(isMergeRequestPipeline(), true);
  clearEnv();
});

test('isMergeRequestPipeline accepts a CLI --mr value even when CI_MERGE_REQUEST_IID is not set', () => {
  clearEnv();
  assert.equal(isMergeRequestPipeline({ mergeRequestIid: '456' }), true);
});

test('loadConfig uses CLI values for CI_API_V4_URL/CI_PROJECT_ID/CI_MERGE_REQUEST_IID when those env vars are not set', () => {
  clearEnv();
  withFullEnv({ CI_API_V4_URL: undefined, CI_PROJECT_ID: undefined, CI_MERGE_REQUEST_IID: undefined });
  const config = loadConfig({
    apiUrl: 'https://gitlab.example.com/api/v4',
    projectId: '999',
    mergeRequestIid: '111',
  });
  assert.equal(config.gitlab.apiUrl, 'https://gitlab.example.com/api/v4');
  assert.equal(config.gitlab.projectId, '999');
  assert.equal(config.gitlab.mergeRequestIid, '111');
  clearEnv();
});

test('loadConfig prefers a CLI value over the environment variable when both are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadConfig({ apiUrl: 'https://from-cli.example.com/api/v4', projectId: '999', mergeRequestIid: '111' });
  assert.equal(config.gitlab.apiUrl, 'https://from-cli.example.com/api/v4');
  assert.equal(config.gitlab.projectId, '999');
  assert.equal(config.gitlab.mergeRequestIid, '111');
  clearEnv();
});

test('loadConfig uses CLI values for model/openaiBaseUrl/failOnSeverity/authHeader when those env vars are not set', () => {
  clearEnv();
  withFullEnv({ OPENAI_MODEL: undefined, OPENAI_BASE_URL: undefined });
  const config = loadConfig({
    model: 'o4-mini',
    openaiBaseUrl: 'https://custom.example.com/v1',
    failOnSeverity: 'nit',
    authHeader: 'PRIVATE-TOKEN',
  });
  assert.equal(config.openai.model, 'o4-mini');
  assert.equal(config.openai.baseUrl, 'https://custom.example.com/v1');
  assert.equal(config.failOnSeverity, 'nit');
  assert.equal(config.gitlab.authHeader, 'PRIVATE-TOKEN');
  clearEnv();
});

test('loadConfig prefers CLI values for failOnSeverity/authHeader over their env vars when both are set', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'important', GITLAB_AUTH_HEADER: 'JOB-TOKEN' });
  const config = loadConfig({ failOnSeverity: 'nit', authHeader: 'PRIVATE-TOKEN' });
  assert.equal(config.failOnSeverity, 'nit');
  assert.equal(config.gitlab.authHeader, 'PRIVATE-TOKEN');
  clearEnv();
});

test('loadConfig rejects an invalid CLI value for failOnSeverity/authHeader, same as an invalid env var', () => {
  clearEnv();
  withFullEnv();
  assert.throws(() => loadConfig({ failOnSeverity: 'critical' }), ConfigError);
  assert.throws(() => loadConfig({ authHeader: 'Authorization' }), ConfigError);
  clearEnv();
});

test('loadConfig uses CLI values for the secrets (apiKey/jobToken) when OPENAI_API_KEY/CI_JOB_TOKEN are not set', () => {
  clearEnv();
  withFullEnv({ OPENAI_API_KEY: undefined, CI_JOB_TOKEN: undefined });
  const config = loadConfig({ apiKey: 'sk-from-cli', jobToken: 'token-from-cli' });
  assert.equal(config.openai.apiKey, 'sk-from-cli');
  assert.equal(config.gitlab.jobToken, 'token-from-cli');
  clearEnv();
});

test('loadConfig prefers CLI values for OPENAI_API_KEY/CI_JOB_TOKEN over their env vars when both are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadConfig({ apiKey: 'sk-from-cli', jobToken: 'token-from-cli' });
  assert.equal(config.openai.apiKey, 'sk-from-cli');
  assert.equal(config.gitlab.jobToken, 'token-from-cli');
  clearEnv();
});
