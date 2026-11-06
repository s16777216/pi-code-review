import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePublishCliOptions, parseReviewCliOptions } from './index.ts';

/** A host's own flags; the commands add them to their own. */
const HOST_FLAGS = { 'host-url': { type: 'string' as const }, change: { type: 'string' as const } };

test('parseReviewCliOptions maps every review flag to the matching field', () => {
  const options = parseReviewCliOptions(
    [
      '--host-url',
      'https://host.example.com',
      '--change',
      '7',
      '--model',
      'o4-mini',
      '--openai-base-url',
      'https://custom.example.com/v1',
      '--openai-api-key',
      'sk-from-cli',
      '--max-tokens',
      '64000',
      '--context-window',
      '400000',
      '--language',
      'Traditional Chinese',
      '--out',
      'my-findings.json',
      '--debug',
    ],
    HOST_FLAGS,
  );

  assert.deepEqual(options, {
    host: { 'host-url': 'https://host.example.com', change: '7' },
    model: 'o4-mini',
    openaiBaseUrl: 'https://custom.example.com/v1',
    apiKey: 'sk-from-cli',
    maxTokens: '64000',
    contextWindow: '400000',
    language: 'Traditional Chinese',
    out: 'my-findings.json',
    debug: true,
  });
});

test('parseReviewCliOptions returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parseReviewCliOptions([], HOST_FLAGS), {
    host: { 'host-url': undefined, change: undefined },
    model: undefined,
    openaiBaseUrl: undefined,
    apiKey: undefined,
    maxTokens: undefined,
    contextWindow: undefined,
    language: undefined,
    out: undefined,
    debug: undefined,
  });
});

test('parseReviewCliOptions rejects a publish-only flag', () => {
  assert.throws(() => parseReviewCliOptions(['--fail-on', 'low'], HOST_FLAGS));
  assert.throws(() => parseReviewCliOptions(['--from', 'findings.json'], HOST_FLAGS));
});

test('parsePublishCliOptions maps every publish flag to the matching field', () => {
  const options = parsePublishCliOptions(
    [
      '--host-url',
      'https://host.example.com',
      '--change',
      '7',
      '--fail-on',
      'low',
      '--from',
      'my-findings.json',
      '--debug',
    ],
    HOST_FLAGS,
  );

  assert.deepEqual(options, {
    host: { 'host-url': 'https://host.example.com', change: '7' },
    failOnSeverity: 'low',
    from: 'my-findings.json',
    debug: true,
  });
});

test('parsePublishCliOptions returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parsePublishCliOptions([], HOST_FLAGS), {
    host: { 'host-url': undefined, change: undefined },
    failOnSeverity: undefined,
    from: undefined,
    debug: undefined,
  });
});

test('parsePublishCliOptions rejects a review-only flag', () => {
  assert.throws(() => parsePublishCliOptions(['--model', 'gpt-4.1'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--openai-base-url', 'https://api.openai.com/v1'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--openai-api-key', 'sk-should-not-exist'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--max-tokens', '64000'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--context-window', '400000'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--language', 'Japanese'], HOST_FLAGS));
});
