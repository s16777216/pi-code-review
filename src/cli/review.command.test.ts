import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ChangeRequest, CodeHost } from '../core/ports.ts';
import type { ChangedFileDiff, ReviewContext } from '../core/types.ts';
import { logicOnly } from '../core/review/fauxFocus.ts';
import { EXIT_ERROR, EXIT_PASS, runReview, runReviewCommand } from './index.ts';
import type { ReviewConfig } from '../config.ts';

// Tests for `harden-run-failures`: a review that fails after the change
// request was read writes a failure file, `review` exits with code 2, and the
// old findings file does not stay.

const SNAPSHOT = { baseSha: 'base', startSha: 'start', headSha: 'head' };
const SOURCE = { host: 'gitlab', projectId: '1', mergeRequestIid: '2' };

function bigFile(path: string): ChangedFileDiff {
  const lines = Array.from({ length: 300 }, (_, i) => `+const v${i} = "${'x'.repeat(60)}";`);
  return { oldPath: path, newPath: path, hunks: [`@@ -0,0 +1,${lines.length} @@`, ...lines].join('\n') };
}

function changeRequestOf(files: ChangedFileDiff[]): ChangeRequest<unknown> {
  return {
    async load() {
      const context: ReviewContext = {
        title: 'Change',
        description: '',
        changedFiles: files,
        getFileContent: async () => ({ error: 'not used' }),
        listDiscussions: async () => [],
      };
      return { context, snapshot: SNAPSHOT };
    },
  };
}

/** A host with no network. `open` decides what `openChangeRequest` does. */
function fakeHost(open: () => Promise<{ changeRequest: ChangeRequest<unknown>; source: unknown }>, isMr = true) {
  const host: CodeHost<unknown, unknown, undefined, undefined> = {
    reviewFlags: {},
    publishFlags: {},
    isChangeRequest: () => isMr,
    readReviewSettings: () => undefined,
    readPublishSettings: () => undefined,
    openChangeRequest: open,
    restore: async () => {
      throw new Error('not used');
    },
    parseSnapshot: (value) => value,
    parseSource: (value) => value,
  };
  return host;
}

async function inTempDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'review-command-test-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function exists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

/** Flags that make the review fail before any model call: the window is too small for the change. */
function tooSmallWindow(out: string) {
  return [
    '--model',
    'm',
    '--openai-base-url',
    'http://127.0.0.1:9/v1',
    '--openai-api-key',
    'k',
    '--max-tokens',
    '100',
    '--context-window',
    '1500',
    '--out',
    out,
  ];
}

test('review writes a failure file and exits with code 2 when the review fails after the merge request was read', async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'findings.json');
    const host = fakeHost(async () => ({ changeRequest: changeRequestOf([bigFile('a.ts')]), source: SOURCE }));

    const code = await runReviewCommand(tooSmallWindow(out), host);

    assert.equal(code, EXIT_ERROR);
    const text = await readFile(out, 'utf8');
    const file = JSON.parse(text) as Record<string, unknown>;
    assert.deepEqual(file.failed, { category: 'too_large' });
    assert.deepEqual(file.findings, []);
    assert.deepEqual(file.resolved, []);
    assert.deepEqual(file.unreviewedFiles, []);
    assert.deepEqual(file.diffRefs, SNAPSHOT);
    assert.deepEqual(file.source, SOURCE);
    assert.doesNotMatch(text, /context window|--context-window|half the/);
  });
});

test('review deletes the old findings file when it stops before it read the merge request', async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'findings.json');
    await writeFile(out, '{"old":true}');
    const host = fakeHost(async () => {
      throw new Error('GitLab is unreachable.');
    });

    await assert.rejects(() => runReviewCommand(tooSmallWindow(out), host), /unreachable/);

    assert.equal(await exists(out), false);
  });
});

test('review replaces the old findings file with the failure file', async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'findings.json');
    await writeFile(out, '{"old":true}');
    const host = fakeHost(async () => ({ changeRequest: changeRequestOf([bigFile('a.ts')]), source: SOURCE }));

    await runReviewCommand(tooSmallWindow(out), host);

    const file = JSON.parse(await readFile(out, 'utf8')) as Record<string, unknown>;
    assert.equal('old' in file, false);
    assert.ok(file.failed);
  });
});

test('review starts with no error when there is no old findings file', async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'findings.json');
    const host = fakeHost(async () => ({ changeRequest: changeRequestOf([bigFile('a.ts')]), source: SOURCE }));

    assert.equal(await runReviewCommand(tooSmallWindow(out), host), EXIT_ERROR);
  });
});

test('review does not delete a file when the pipeline is not a merge request pipeline', async () => {
  await inTempDir(async (dir) => {
    const out = join(dir, 'findings.json');
    await writeFile(out, '{"old":true}');
    const host = fakeHost(async () => {
      throw new Error('not used');
    }, false);

    assert.equal(await runReviewCommand(tooSmallWindow(out), host), EXIT_PASS);

    assert.equal(await readFile(out, 'utf8'), '{"old":true}');
  });
});

// --- runReview ---

function config(overrides: Partial<ReviewConfig['openai']> = {}): ReviewConfig {
  return {
    openai: {
      apiKey: 'k',
      model: 'm',
      baseUrl: 'http://127.0.0.1:9/v1',
      maxTokens: 32_000,
      contextWindow: 128_000,
      ...overrides,
    },
  };
}

test('runReview returns a failed result with the category of a ReviewFailureError', async () => {
  const faux = fauxProvider();
  logicOnly(faux, []);

  const result = await runReview({
    config: config({ maxTokens: 100, contextWindow: 1500 }),
    changeRequest: changeRequestOf([bigFile('a.ts')]),
    source: SOURCE,
    provider: faux.provider,
  });

  assert.deepEqual(result.failed, { category: 'too_large' });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.warnings, []);
});

test('runReview gives the category other for an error that is not a review failure', async () => {
  const faux = fauxProvider();
  logicOnly(faux, []);
  const request: ChangeRequest<unknown> = {
    async load() {
      const context = {
        title: 'Change',
        description: '',
        get changedFiles(): ChangedFileDiff[] {
          // The first read is the log line of `runReview`; the engine reads it next.
          if (reads++ === 0) return [];
          throw new TypeError('Programming error.');
        },
        getFileContent: async () => ({ error: 'not used' }),
        listDiscussions: async () => [],
      } as ReviewContext;
      let reads = 0;
      return { context, snapshot: SNAPSHOT };
    },
  };

  const result = await runReview({ config: config(), changeRequest: request, source: SOURCE, provider: faux.provider });

  assert.deepEqual(result.failed, { category: 'other' });
});

test('runReview does not catch an error of load', async () => {
  const faux = fauxProvider();
  logicOnly(faux, []);
  const request: ChangeRequest<unknown> = {
    async load() {
      throw new Error('GitLab is unreachable.');
    },
  };

  await assert.rejects(
    () => runReview({ config: config(), changeRequest: request, source: SOURCE, provider: faux.provider }),
    /unreachable/,
  );
});

test('runReview returns the warnings of the engine and no failure when the review completes', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [
    fauxAssistantMessage([fauxToolCall('submit_review', { findings: [], resolved: [] } as never)], {
      stopReason: 'toolUse',
    }),
  ]);

  const result = await runReview({
    config: config(),
    changeRequest: changeRequestOf([{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }]),
    source: SOURCE,
    provider: faux.provider,
  });

  assert.equal('failed' in result, false);
  assert.deepEqual(result.warnings, []);
});
