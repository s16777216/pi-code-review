import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, isMergeRequestPipeline, loadPublishConfig, loadReviewConfig } from './config.ts';

const GITLAB_VARS = ['CI_API_V4_URL', 'CI_PROJECT_ID', 'CI_MERGE_REQUEST_IID', 'GITLAB_TOKEN'];
const OPENAI_VARS = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL'];

function withFullEnv(overrides: Record<string, string | undefined> = {}): void {
  const full: Record<string, string> = {
    CI_API_V4_URL: 'https://gitlab.example.com/api/v4',
    CI_PROJECT_ID: '123',
    CI_MERGE_REQUEST_IID: '456',
    GITLAB_TOKEN: 'access-token',
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
  for (const key of [...GITLAB_VARS, ...OPENAI_VARS, 'FAIL_ON_SEVERITY', 'OPENAI_MAX_TOKENS']) {
    delete process.env[key];
  }
}

test('loadReviewConfig throws ConfigError for each missing required variable', () => {
  for (const missing of [...GITLAB_VARS, ...OPENAI_VARS]) {
    clearEnv();
    withFullEnv({ [missing]: undefined });
    assert.throws(() => loadReviewConfig(), ConfigError, `expected ConfigError when ${missing} is missing`);
  }
  clearEnv();
});

test('loadReviewConfig returns a config object when all required variables are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadReviewConfig();
  assert.equal(config.gitlab.apiUrl, 'https://gitlab.example.com/api/v4');
  assert.equal(config.gitlab.token, 'access-token');
  assert.equal(config.openai.model, 'gpt-4.1');
  assert.equal(config.openai.baseUrl, 'https://api.openai.com/v1');
  clearEnv();
});

test('loadReviewConfig does not require FAIL_ON_SEVERITY', () => {
  clearEnv();
  withFullEnv();
  assert.doesNotThrow(() => loadReviewConfig());
  clearEnv();
});

test('loadReviewConfig defaults maxTokens to 32000 when neither the flag nor OPENAI_MAX_TOKENS is set', () => {
  clearEnv();
  withFullEnv();
  assert.equal(loadReviewConfig().openai.maxTokens, 32_000);
  clearEnv();
});

test('loadReviewConfig uses OPENAI_MAX_TOKENS when set', () => {
  clearEnv();
  withFullEnv({ OPENAI_MAX_TOKENS: '64000' });
  assert.equal(loadReviewConfig().openai.maxTokens, 64_000);
  clearEnv();
});

test('loadReviewConfig prefers a CLI --max-tokens value over OPENAI_MAX_TOKENS when both are set', () => {
  clearEnv();
  withFullEnv({ OPENAI_MAX_TOKENS: '64000' });
  assert.equal(loadReviewConfig({ maxTokens: '8000' }).openai.maxTokens, 8_000);
  clearEnv();
});

test('loadReviewConfig rejects a non-numeric or non-positive OPENAI_MAX_TOKENS value', () => {
  clearEnv();
  withFullEnv({ OPENAI_MAX_TOKENS: 'not-a-number' });
  assert.throws(() => loadReviewConfig(), ConfigError);
  clearEnv();
  withFullEnv({ OPENAI_MAX_TOKENS: '0' });
  assert.throws(() => loadReviewConfig(), ConfigError);
  clearEnv();
});

test('loadPublishConfig throws ConfigError for each missing GitLab variable', () => {
  for (const missing of GITLAB_VARS) {
    clearEnv();
    withFullEnv({ [missing]: undefined });
    assert.throws(() => loadPublishConfig(), ConfigError, `expected ConfigError when ${missing} is missing`);
  }
  clearEnv();
});

test('loadPublishConfig does not require any OPENAI_* variable', () => {
  clearEnv();
  withFullEnv({ OPENAI_API_KEY: undefined, OPENAI_MODEL: undefined, OPENAI_BASE_URL: undefined });
  assert.doesNotThrow(() => loadPublishConfig());
  clearEnv();
});

test('loadPublishConfig returns a config object when all required variables are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadPublishConfig();
  assert.equal(config.gitlab.apiUrl, 'https://gitlab.example.com/api/v4');
  assert.equal(config.gitlab.token, 'access-token');
  assert.equal(config.failOnSeverity, 'important');
  clearEnv();
});

test('loadPublishConfig rejects an invalid FAIL_ON_SEVERITY value', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'critical' });
  assert.throws(() => loadPublishConfig(), ConfigError);
  clearEnv();
});

test('loadPublishConfig accepts FAIL_ON_SEVERITY=none', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'none' });
  assert.equal(loadPublishConfig().failOnSeverity, 'none');
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

test('loadReviewConfig uses CLI values for the GitLab connection fields when those env vars are not set', () => {
  clearEnv();
  withFullEnv({ CI_API_V4_URL: undefined, CI_PROJECT_ID: undefined, CI_MERGE_REQUEST_IID: undefined });
  const config = loadReviewConfig({
    apiUrl: 'https://gitlab.example.com/api/v4',
    projectId: '999',
    mergeRequestIid: '111',
  });
  assert.equal(config.gitlab.apiUrl, 'https://gitlab.example.com/api/v4');
  assert.equal(config.gitlab.projectId, '999');
  assert.equal(config.gitlab.mergeRequestIid, '111');
  clearEnv();
});

test('loadReviewConfig prefers a CLI value over the environment variable when both are set', () => {
  clearEnv();
  withFullEnv();
  const config = loadReviewConfig({ apiUrl: 'https://from-cli.example.com/api/v4', projectId: '999' });
  assert.equal(config.gitlab.apiUrl, 'https://from-cli.example.com/api/v4');
  assert.equal(config.gitlab.projectId, '999');
  clearEnv();
});

test('loadReviewConfig uses CLI values for model/openaiBaseUrl when those env vars are not set', () => {
  clearEnv();
  withFullEnv({ OPENAI_MODEL: undefined, OPENAI_BASE_URL: undefined });
  const config = loadReviewConfig({
    model: 'o4-mini',
    openaiBaseUrl: 'https://custom.example.com/v1',
  });
  assert.equal(config.openai.model, 'o4-mini');
  assert.equal(config.openai.baseUrl, 'https://custom.example.com/v1');
  clearEnv();
});

test('loadPublishConfig prefers a CLI value for failOnSeverity over its env var when both are set', () => {
  clearEnv();
  withFullEnv({ FAIL_ON_SEVERITY: 'important' });
  const config = loadPublishConfig({ failOnSeverity: 'nit' });
  assert.equal(config.failOnSeverity, 'nit');
  clearEnv();
});

test('loadReviewConfig and loadPublishConfig use CLI values for the secrets when the env vars are not set', () => {
  clearEnv();
  withFullEnv({ OPENAI_API_KEY: undefined, GITLAB_TOKEN: undefined });
  const reviewConfig = loadReviewConfig({ apiKey: 'sk-from-cli', token: 'token-from-cli' });
  assert.equal(reviewConfig.openai.apiKey, 'sk-from-cli');
  assert.equal(reviewConfig.gitlab.token, 'token-from-cli');

  clearEnv();
  withFullEnv({ GITLAB_TOKEN: undefined });
  const publishConfig = loadPublishConfig({ token: 'token-from-cli' });
  assert.equal(publishConfig.gitlab.token, 'token-from-cli');
  clearEnv();
});
