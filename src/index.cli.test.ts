import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliOverrides } from './index.ts';

test('parseCliOverrides maps every flag to the matching ConfigOverrides field', () => {
  const overrides = parseCliOverrides([
    '--gitlab-url',
    'https://gitlab.example.com/api/v4',
    '--project-id',
    '42',
    '--mr',
    '7',
    '--model',
    'o4-mini',
    '--openai-base-url',
    'https://custom.example.com/v1',
    '--fail-on',
    'nit',
    '--auth-header',
    'PRIVATE-TOKEN',
    '--openai-api-key',
    'sk-from-cli',
    '--job-token',
    'token-from-cli',
  ]);

  assert.deepEqual(overrides, {
    apiUrl: 'https://gitlab.example.com/api/v4',
    projectId: '42',
    mergeRequestIid: '7',
    model: 'o4-mini',
    openaiBaseUrl: 'https://custom.example.com/v1',
    apiKey: 'sk-from-cli',
    jobToken: 'token-from-cli',
    failOnSeverity: 'nit',
    authHeader: 'PRIVATE-TOKEN',
  });
});

test('parseCliOverrides returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parseCliOverrides([]), {
    apiUrl: undefined,
    projectId: undefined,
    mergeRequestIid: undefined,
    model: undefined,
    openaiBaseUrl: undefined,
    apiKey: undefined,
    jobToken: undefined,
    failOnSeverity: undefined,
    authHeader: undefined,
  });
});

test('parseCliOverrides throws on an unknown flag', () => {
  assert.throws(() => parseCliOverrides(['--unknown-flag', 'value']));
});
