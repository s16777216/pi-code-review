import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai';
import type { Config } from './config.ts';
import type {
  DiscussionPosition,
  FileContentResult,
  GitLabChangedFile,
  MergeRequestMetadata,
  MergeRequestProvider,
  MergeRequestWriter,
} from './gitlab/client.ts';
import { runReview } from './index.ts';

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

function fixtureConfig(overrides: Partial<Config> = {}): Config {
  return {
    gitlab: {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      mergeRequestIid: '5',
      jobToken: 'tok',
      authHeader: 'JOB-TOKEN',
    },
    openai: {
      apiKey: 'sk-test',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
    },
    failOnSeverity: 'important',
    ...overrides,
  };
}

test('runReview wires source -> engine -> sink and returns the pass/fail outcome', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'a.ts', line: 1, severity: 'important', summary: 'Off-by-one.' }])),
  ]);

  const client = new FakeClient(
    { title: 'Fix bug', description: 'Fixes a thing.', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'a.ts', newPath: 'a.ts', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const dir = await mkdtemp(join(tmpdir(), 'pi-code-review-test-'));
  const reportPath = join(dir, 'report.json');

  try {
    const passed = await runReview({
      config: fixtureConfig(),
      client,
      provider: faux.provider,
      codeQualityReportPath: reportPath,
    });

    assert.equal(passed, false); // an "important" finding fails the default threshold
    assert.equal(client.discussions.length, 1);
    assert.deepEqual(client.discussions[0]!.position, {
      baseSha: 'base',
      startSha: 'start',
      headSha: 'head',
      oldPath: 'a.ts',
      newPath: 'a.ts',
      newLine: 1,
    });

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.length, 1);
    assert.equal(report[0].severity, 'major');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runReview returns true (pass) when the review finds nothing', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);

  const client = new FakeClient(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const dir = await mkdtemp(join(tmpdir(), 'pi-code-review-test-'));
  const reportPath = join(dir, 'report.json');

  try {
    const passed = await runReview({
      config: fixtureConfig(),
      client,
      provider: faux.provider,
      codeQualityReportPath: reportPath,
    });

    assert.equal(passed, true);
    assert.equal(client.discussions.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runReview never logs the OpenAI API key or the GitLab job token', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);

  const client = new FakeClient(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', diffHunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const dir = await mkdtemp(join(tmpdir(), 'pi-code-review-test-'));
  const reportPath = join(dir, 'report.json');
  const config = fixtureConfig({
    gitlab: {
      apiUrl: 'https://gitlab.example.com/api/v4',
      projectId: '1',
      mergeRequestIid: '5',
      jobToken: 'super-secret-job-token',
      authHeader: 'JOB-TOKEN',
    },
    openai: { apiKey: 'sk-super-secret-api-key', model: 'gpt-4.1', baseUrl: 'https://api.openai.com/v1' },
  });

  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  };

  try {
    await runReview({ config, client, provider: faux.provider, codeQualityReportPath: reportPath });
  } finally {
    console.log = originalLog;
    await rm(dir, { recursive: true, force: true });
  }

  const output = logged.join('\n');
  assert.doesNotMatch(output, /super-secret-job-token/);
  assert.doesNotMatch(output, /sk-super-secret-api-key/);
});
