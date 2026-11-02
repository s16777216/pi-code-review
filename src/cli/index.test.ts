import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai';
import pino from 'pino';
import type { PublishConfig, ReviewConfig } from '../config.ts';
import type {
  DiscussionPosition,
  FileContentResult,
  GitLabChangedFile,
  MergeRequestMetadata,
  MergeRequestProvider,
  MergeRequestWriter,
} from '../providers/index.ts';
import type { FindingsFile } from '../findingsFile.ts';
import { main, runPublish, runReview } from './index.ts';

class FakeClient implements MergeRequestProvider, MergeRequestWriter {
  discussions: { mergeRequestIid: string; body: string; position: DiscussionPosition }[] = [];

  constructor(
    private readonly metadata: MergeRequestMetadata,
    private readonly diff: GitLabChangedFile[],
  ) {}

  async getMergeRequest(): Promise<MergeRequestMetadata> {
    return this.metadata;
  }

  async getMergeRequestDiff(): Promise<GitLabChangedFile[]> {
    return this.diff;
  }

  async getFileContent(): Promise<FileContentResult> {
    return { error: 'not used in this test' };
  }

  async createDiscussion(mergeRequestIid: string, body: string, position: DiscussionPosition): Promise<void> {
    this.discussions.push({ mergeRequestIid, body, position });
  }
}

function fixtureReviewConfig(overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  return {
    gitlab: {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      mergeRequestIid: '5',
      token: 'tok',
    },
    openai: {
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      maxTokens: 32_000,
      contextWindow: 128_000,
    },
    ...overrides,
  };
}

function fixturePublishConfig(overrides: Partial<PublishConfig> = {}): PublishConfig {
  return {
    gitlab: {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      mergeRequestIid: '5',
      token: 'tok',
    },
    failOnSeverity: 'important',
    ...overrides,
  };
}

test('runReview returns findings and diff refs, and never contacts the GitLab sink', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'a.ts', line: 1, severity: 'important', summary: 'Off-by-one.' }])),
  ]);

  const client = new FakeClient(
    { title: 'Fix bug', description: 'Fixes a thing.', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const findingsFile = await runReview({ config: fixtureReviewConfig(), client, provider: faux.provider });

  assert.deepEqual(findingsFile.diffRefs, { baseSha: 'base', startSha: 'start', headSha: 'head' });
  assert.deepEqual(findingsFile.findings, [{ file: 'a.ts', line: 1, severity: 'important', summary: 'Off-by-one.' }]);
  // runReview has no sink dependency at all - createDiscussion is only ever called by runPublish.
  assert.equal(client.discussions.length, 0);
});

test('runReview returns an empty findings list when the review finds nothing', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);

  const client = new FakeClient(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const findingsFile = await runReview({ config: fixtureReviewConfig(), client, provider: faux.provider });

  assert.deepEqual(findingsFile.findings, []);
});

test('runReview never logs the OpenAI API key or the GitLab access token', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);

  const client = new FakeClient(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );
  const config = fixtureReviewConfig({
    gitlab: {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      mergeRequestIid: '5',
      token: 'super-secret-token',
    },
    openai: { apiKey: 'sk-super-secret-api-key', model: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1', maxTokens: 32_000, contextWindow: 128_000 },
  });

  // Use a real, non-silent (debug-level) logger — the same kind `--debug`
  // builds — so every log line `runReview` and the engine produce is
  // captured here, and a future call site that logs a token is still caught
  // even if `pino`'s `redact` paths were ever incomplete.
  const debugLines: string[] = [];
  const debugStream = {
    write(chunk: string) {
      debugLines.push(chunk);
      return true;
    },
  };
  const debugLogger = pino(
    { level: 'debug', redact: { paths: ['headers["PRIVATE-TOKEN"]', '*.headers["PRIVATE-TOKEN"]', 'apiKey', '*.apiKey'], censor: '[REDACTED]' } },
    debugStream as unknown as NodeJS.WritableStream,
  );

  await runReview({ config, client, provider: faux.provider, logger: debugLogger });

  const output = debugLines.join('\n');
  assert.doesNotMatch(output, /super-secret-token/);
  assert.doesNotMatch(output, /sk-super-secret-api-key/);
});

test('runPublish publishes every finding', async () => {
  const client = new FakeClient(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile = {
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    findings: [{ file: 'a.ts', line: 1, severity: 'nit', summary: 'Minor nit.' }],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    client,
    findingsFile,
  });

  assert.equal(passed, true); // "nit" is below the default "important" threshold
  assert.equal(client.discussions.length, 1);
  assert.deepEqual(client.discussions[0]!.position, {
    baseSha: 'base',
    startSha: 'start',
    headSha: 'head',
    oldPath: 'a.ts',
    newPath: 'a.ts',
    newLine: 1,
  });
});

test('runPublish publishes an important finding before failing on it (severity never blocks publishing)', async () => {
  const client = new FakeClient(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile = {
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    findings: [{ file: 'a.ts', line: 2, severity: 'important', summary: 'Off-by-one bug.' }],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    client,
    findingsFile,
  });

  // The discussion was posted (publishing happened) even though the final outcome is a fail.
  assert.equal(client.discussions.length, 1);
  assert.equal(passed, false);
});

test('runPublish passes when no finding meets the threshold', async () => {
  const client = new FakeClient(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile = {
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    findings: [],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    client,
    findingsFile,
  });
  assert.equal(passed, true);
});

test('main rejects a missing or unknown subcommand with a clear error', async () => {
  await assert.rejects(() => main([]), /Unknown command/);
  await assert.rejects(() => main(['bogus']), /Unknown command "bogus"/);
});
