import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitlabHost } from '../providers/index.ts';
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
      '--timeout',
      '120000',
      '--language',
      'Traditional Chinese',
      '--instructions',
      'rules.md',
      '--instructions-text',
      'Skip naming problems.',
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
    timeout: '120000',
    language: 'Traditional Chinese',
    instructions: 'rules.md',
    instructionsText: 'Skip naming problems.',
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
    timeout: undefined,
    language: undefined,
    instructions: undefined,
    instructionsText: undefined,
    out: undefined,
    debug: undefined,
  });
});

test('parseReviewCliOptions rejects a publish-only flag', () => {
  assert.throws(() => parseReviewCliOptions(['--fail-on', 'low'], HOST_FLAGS));
  assert.throws(() => parseReviewCliOptions(['--from', 'findings.json'], HOST_FLAGS));
});

test('parseReviewCliOptions rejects the template directory flag, which only publish accepts', () => {
  assert.throws(() => parseReviewCliOptions(['--template-dir', './templates'], HOST_FLAGS));
  assert.throws(() => parseReviewCliOptions(['--template-dir', './templates'], gitlabHost.reviewFlags));
});

test('parseReviewCliOptions accepts the instructions flags, with an empty string too', () => {
  const options = parseReviewCliOptions(['--instructions', '', '--instructions-text', ''], HOST_FLAGS);
  assert.equal(options.instructions, '');
  assert.equal(options.instructionsText, '');
  assert.equal(parseReviewCliOptions(['--instructions-text', 'Check SQL.'], HOST_FLAGS).instructionsText, 'Check SQL.');
});

test('parsePublishCliOptions rejects both instructions flags, which only review accepts', () => {
  assert.throws(() => parsePublishCliOptions(['--instructions', 'rules.md'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--instructions-text', 'Skip naming problems.'], HOST_FLAGS));
  assert.throws(() => parsePublishCliOptions(['--instructions', 'rules.md'], gitlabHost.publishFlags));
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
      '--template-dir',
      './templates',
      '--from',
      'my-findings.json',
      '--debug',
    ],
    HOST_FLAGS,
  );

  assert.deepEqual(options, {
    host: { 'host-url': 'https://host.example.com', change: '7' },
    failOnSeverity: 'low',
    templateDir: './templates',
    from: 'my-findings.json',
    debug: true,
  });
});

test('parsePublishCliOptions returns all-undefined fields when no flags are given', () => {
  assert.deepEqual(parsePublishCliOptions([], HOST_FLAGS), {
    host: { 'host-url': undefined, change: undefined },
    failOnSeverity: undefined,
    templateDir: undefined,
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

test('parsePublishCliOptions rejects the GitLab merge request flags, which the findings file now supplies', () => {
  assert.throws(() => parsePublishCliOptions(['--mr', '7'], gitlabHost.publishFlags));
  assert.throws(() => parsePublishCliOptions(['--project-id', '12'], gitlabHost.publishFlags));
});

test('parsePublishCliOptions accepts the GitLab URL and token flags', () => {
  const options = parsePublishCliOptions(
    ['--gitlab-url', 'https://gitlab.example.com/api/v4', '--token', 't'],
    gitlabHost.publishFlags,
  );
  assert.deepEqual(options.host, { 'gitlab-url': 'https://gitlab.example.com/api/v4', token: 't' });
});

test('parseReviewCliOptions still accepts the GitLab merge request flags', () => {
  const options = parseReviewCliOptions(['--mr', '7', '--project-id', '12'], gitlabHost.reviewFlags);
  assert.equal(options.host.mr, '7');
  assert.equal(options.host['project-id'], '12');
});

test('parsePublishCliOptions rejects the timeout flag, which only review accepts', () => {
  assert.throws(() => parsePublishCliOptions(['--timeout', '1000'], HOST_FLAGS));
});
