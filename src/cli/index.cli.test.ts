import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishCliOptions, parseReviewCliOptions } from './index.ts';

test('parseReviewCliOptions maps every review flag to the matching field', () => {
  const options = parseReviewCliOptions([
    '--gitlab-url',
    'https://gitlab.example.com/api/v4',
    '--project-id',
    '42',
    '--mr',
    '7',
    '--token',
    'token-from-cli',
    '--model',
    'o4-mini',
    '--openai-base-url',
    'https://custom.example.com/v1',
    '--openai-api-key',
    'sk-from-cli',
    '--max-tokens',
    '64000',
    '--out',
    'my-findings.json',
    '--debug',
  ]);

  assert.deepEqual(options, {
    apiUrl: 'https://gitlab.example.com/api/v4',
    projectId: '42',
    mergeRequestIid: '7',
    token: 'token-from-cli',
    model: 'o4-mini',
    openaiBaseUrl: 'https://custom.example.com/v1',
    apiKey: 'sk-from-cli',
    maxTokens: '64000',
    out: 'my-findings.json',
    debug: true,
  });
});

test('parseReviewCliOptions returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parseReviewCliOptions([]), {
    apiUrl: undefined,
    projectId: undefined,
    mergeRequestIid: undefined,
    token: undefined,
    model: undefined,
    openaiBaseUrl: undefined,
    apiKey: undefined,
    maxTokens: undefined,
    out: undefined,
    debug: undefined,
  });
});

test('parseReviewCliOptions rejects a publish-only flag', () => {
  assert.throws(() => parseReviewCliOptions(['--fail-on', 'nit']));
  assert.throws(() => parseReviewCliOptions(['--from', 'findings.json']));
});

test('parsePublishCliOptions maps every publish flag to the matching field', () => {
  const options = parsePublishCliOptions([
    '--gitlab-url',
    'https://gitlab.example.com/api/v4',
    '--project-id',
    '42',
    '--mr',
    '7',
    '--token',
    'token-from-cli',
    '--fail-on',
    'nit',
    '--from',
    'my-findings.json',
    '--debug',
  ]);

  assert.deepEqual(options, {
    apiUrl: 'https://gitlab.example.com/api/v4',
    projectId: '42',
    mergeRequestIid: '7',
    token: 'token-from-cli',
    failOnSeverity: 'nit',
    from: 'my-findings.json',
    debug: true,
  });
});

test('parsePublishCliOptions returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parsePublishCliOptions([]), {
    apiUrl: undefined,
    projectId: undefined,
    mergeRequestIid: undefined,
    token: undefined,
    failOnSeverity: undefined,
    from: undefined,
    debug: undefined,
  });
});

test('parsePublishCliOptions rejects a review-only flag', () => {
  assert.throws(() => parsePublishCliOptions(['--model', 'gpt-4.1']));
  assert.throws(() => parsePublishCliOptions(['--openai-base-url', 'https://api.openai.com/v1']));
  assert.throws(() => parsePublishCliOptions(['--openai-api-key', 'sk-should-not-exist']));
  assert.throws(() => parsePublishCliOptions(['--max-tokens', '64000']));
});
