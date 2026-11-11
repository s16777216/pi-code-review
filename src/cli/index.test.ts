import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import pino from 'pino';
import type { PublishConfig, ReviewConfig } from '../config.ts';
import type { ChangeRequest, DiscussionGateway } from '../core/ports.ts';
import { toReviewDiscussion, type HostDiscussion } from '../core/publish/discussion.ts';
import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../core/types.ts';
import type { FindingsFile } from '../findingsFile.ts';
import { computeAnchor } from '../core/review/anchor.ts';
import { main, runPublish, runReview } from './index.ts';
import { logicOnly } from '../core/review/fauxFocus.ts';

type Position = { file: string; line: number };

const SOURCE = { host: 'gitlab', projectId: '1', mergeRequestIid: '2' };

/** A change request for the CLI tests: the read side (`load`) and the
 * discussion side, like a host's real class, with no host behind it. */
class FakeMergeRequest implements ChangeRequest<unknown>, DiscussionGateway {
  discussions: { body: string; position: Position }[] = [];
  /** What `list` returns; the publish tests can set it. */
  existing: HostDiscussion[] = [];
  notes: { body: string; noteId?: number }[] = [];

  constructor(
    private readonly metadata: { title: string; description: string; diffRefs: unknown },
    private readonly files: ChangedFileDiff[],
  ) {}

  async load(): Promise<{ context: ReviewContext; snapshot: unknown }> {
    const context: ReviewContext = {
      title: this.metadata.title,
      description: this.metadata.description,
      changedFiles: this.files,
      getFileContent: async () => ({ error: 'not used in this test' }),
      listDiscussions: async () =>
        this.existing.map(toReviewDiscussion).filter((d): d is ReviewDiscussion => d !== null),
    };
    return { context, snapshot: this.metadata.diffRefs };
  }

  async list(): Promise<HostDiscussion[]> {
    return this.existing;
  }

  async createDiscussion(position: Position, body: string): Promise<void> {
    this.discussions.push({ body, position });
  }

  async reply(): Promise<void> {}

  async setResolved(): Promise<void> {}

  async createNote(body: string): Promise<void> {
    this.notes.push({ body });
  }

  async updateNote(noteId: number, body: string): Promise<void> {
    this.notes.push({ body, noteId });
  }
}

function fixtureReviewConfig(overrides: Partial<ReviewConfig> = {}): ReviewConfig {
  return {
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
    failOnSeverity: 'high',
    ...overrides,
  };
}

/** A `submit_review` tool call, so the queued answer matches the agent's
 * tool-call protocol instead of free text. */
function submitReview(findings: Record<string, unknown>[] = [], resolved: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved } as never)], {
    stopReason: 'toolUse',
  });
}

test('runReview returns findings and the snapshot, and never posts anything', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview([{ file: 'a.ts', line: 1, severity: 'high', summary: 'Off-by-one.' }])]);

  const client = new FakeMergeRequest(
    {
      title: 'Fix bug',
      description: 'Fixes a thing.',
      diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    },
    [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const findingsFile = await runReview({
    config: fixtureReviewConfig(),
    changeRequest: client,
    source: SOURCE,
    provider: faux.provider,
  });

  assert.deepEqual(findingsFile.diffRefs, { baseSha: 'base', startSha: 'start', headSha: 'head' });
  assert.deepEqual(findingsFile.source, SOURCE);
  assert.deepEqual(findingsFile.findings, [
    { file: 'a.ts', line: 1, severity: 'high', summary: 'Off-by-one.', anchor: computeAnchor('a.ts', 'new') },
  ]);
  // runReview gets only the read side; createDiscussion is only ever called by runPublish.
  assert.equal(client.discussions.length, 0);
});

test('runReview returns an empty findings list when the review finds nothing', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview()]);

  const client = new FakeMergeRequest(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );

  const findingsFile = await runReview({
    config: fixtureReviewConfig(),
    changeRequest: client,
    source: SOURCE,
    provider: faux.provider,
  });

  assert.deepEqual(findingsFile.findings, []);
});

test('runReview never logs the OpenAI API key', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview()]);

  const client = new FakeMergeRequest(
    { title: 'Docs tweak', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [{ oldPath: 'README.md', newPath: 'README.md', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
  );
  const config = fixtureReviewConfig({
    openai: {
      apiKey: 'sk-super-secret-api-key',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      maxTokens: 32_000,
      contextWindow: 128_000,
    },
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
    {
      level: 'debug',
      redact: {
        paths: ['headers["PRIVATE-TOKEN"]', '*.headers["PRIVATE-TOKEN"]', 'apiKey', '*.apiKey'],
        censor: '[REDACTED]',
      },
    },
    debugStream as unknown as NodeJS.WritableStream,
  );

  await runReview({ config, changeRequest: client, source: SOURCE, provider: faux.provider, logger: debugLogger });

  const output = debugLines.join('\n');
  assert.doesNotMatch(output, /sk-super-secret-api-key/);
});

test('runPublish publishes every finding', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [{ file: 'a.ts', line: 1, severity: 'low', summary: 'Minor nit.' }],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    gateway: client,
    findingsFile,
  });

  assert.equal(passed, true); // "low" is below the default "high" threshold
  assert.equal(client.discussions.length, 1);
  assert.deepEqual(client.discussions[0]!.position, { file: 'a.ts', line: 1 });
});

test('runPublish writes the comment text from the templates it gets', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [{ file: 'a.ts', line: 1, severity: 'low', summary: 'Minor nit.' }],
  };

  await runPublish({
    config: fixturePublishConfig(),
    gateway: client,
    findingsFile,
    templates: { finding: '- ${severity}: ${summary}', resolved: 'Resolved: ${reason}' },
  });

  assert.equal(client.discussions[0]!.body, '<!-- pi-code-review -->\n- low: Minor nit.');
});

test('runPublish publishes a high finding before failing on it (severity never blocks publishing)', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [{ file: 'a.ts', line: 2, severity: 'high', summary: 'Off-by-one bug.' }],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    gateway: client,
    findingsFile,
  });

  // The discussion was posted (publishing happened) even though the final outcome is a fail.
  assert.equal(client.discussions.length, 1);
  assert.equal(passed, false);
});

test('runPublish passes when no finding meets the threshold', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [],
  };

  const passed = await runPublish({
    config: fixturePublishConfig(),
    gateway: client,
    findingsFile,
  });
  assert.equal(passed, true);
});

test('main rejects a missing or unknown subcommand with a clear error', async () => {
  await assert.rejects(() => main([]), /Unknown command/);
  await assert.rejects(() => main(['bogus']), /Unknown command "bogus"/);
});

test('runPublish still fails on a high finding that relates to an open discussion, and posts nothing', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  client.existing = [
    {
      id: 'd1',
      position: { file: 'a.ts', line: 2, commit: 'old' },
      resolved: false,
      notes: [{ id: 1, author: 'bot', body: '<!-- pi-code-review -->\n**[high]** Off-by-one.' }],
    },
  ];
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [{ file: 'a.ts', line: 2, severity: 'high', summary: 'Off-by-one bug.', relatesTo: 'd1' }],
  };

  const passed = await runPublish({ config: fixturePublishConfig(), gateway: client, findingsFile });

  assert.equal(client.discussions.length, 0);
  assert.equal(passed, false);
});

test('runPublish decides pass or fail from the findings only, not from fixed declarations', async () => {
  const client = new FakeMergeRequest(
    { title: 'unused', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [],
  );
  const findingsFile: FindingsFile<unknown, unknown> = {
    unreviewedFiles: [],
    resolved: [{ discussionId: 'd1', reason: 'Fixed.' }],
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    source: SOURCE,
    findings: [],
  };

  assert.equal(await runPublish({ config: fixturePublishConfig(), gateway: client, findingsFile }), true);
});

test('runReview writes the omitted files, and runPublish posts the comment on them', async () => {
  const faux = fauxProvider();
  logicOnly(faux, [submitReview()]);
  const client = new FakeMergeRequest(
    { title: 'Big', description: '', diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' } },
    [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' },
      { oldPath: 'big.js', newPath: 'big.js', hunks: '', omitted: 'too_large' },
    ],
  );

  const findingsFile = await runReview({
    config: fixtureReviewConfig(),
    changeRequest: client,
    source: SOURCE,
    provider: faux.provider,
  });
  assert.deepEqual(findingsFile.unreviewedFiles, [{ path: 'big.js', reason: 'too_large' }]);

  await runPublish({ config: fixturePublishConfig(), gateway: client, findingsFile });
  assert.equal(client.notes.length, 1);
  assert.match(client.notes[0]!.body, /^<!-- pi-code-review unreviewed -->\n[\s\S]*`big\.js`/);
});

// --- review instructions (`add-review-instructions`) ---

const REVIEW_METADATA = {
  title: 'Fix bug',
  description: '',
  diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
};

/** A logger that keeps what it writes, so a test can read the `warn` lines. */
function capturingLogger(): { logger: pino.Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = pino({ level: 'info' }, { write: (chunk: string) => void lines.push(JSON.parse(chunk)) });
  return { logger, lines };
}

/** Runs `runReview` over a merge request that changes `paths`, and returns what the model got and what the log says. */
async function reviewWithInstructions(instructions: Parameters<typeof runReview>[0]['instructions'], paths: string[]) {
  const prompts: string[] = [];
  const faux = fauxProvider();
  logicOnly(faux, [
    (context) => {
      prompts.push(JSON.stringify(context));
      return submitReview();
    },
  ]);
  const client = new FakeMergeRequest(
    REVIEW_METADATA,
    paths.map((path) => ({ oldPath: path, newPath: path, hunks: '@@ -1,1 +1,1 @@\n-old\n+new' })),
  );
  const { logger, lines } = capturingLogger();

  const findingsFile = await runReview({
    config: fixtureReviewConfig(),
    changeRequest: client,
    source: SOURCE,
    provider: faux.provider,
    instructions,
    logger,
  });
  return { prompts, lines, findingsFile };
}

const warnLines = (lines: Record<string, unknown>[]) => lines.filter((line) => line.level === 40);

test('runReview puts the review instructions in the system prompt', async () => {
  const { prompts } = await reviewWithInstructions({ text: 'Skip naming problems.', source: '--instructions-text' }, [
    'a.ts',
  ]);

  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!, /The project owner wrote the review instructions below/);
  assert.match(prompts[0]!, /Skip naming problems\./);
});

test('runReview gives the same system prompt as before when there are no review instructions', async () => {
  const { prompts } = await reviewWithInstructions(undefined, ['a.ts']);

  assert.doesNotMatch(prompts[0]!, /review instructions below/);
});

test('runReview warns once when the merge request changes the file of the review instructions', async () => {
  const filePath = join(process.cwd(), 'REVIEW_INSTRUCTIONS.md');
  const { lines, findingsFile } = await reviewWithInstructions(
    { text: 'Skip naming problems.', source: '--instructions', filePath },
    ['a.ts', 'REVIEW_INSTRUCTIONS.md'],
  );

  const warnings = warnLines(lines);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]!.msg), /merge request changes the file of the review instructions/);
  assert.equal(warnings[0]!.source, '--instructions');
  // The path in the log is relative to the working directory.
  assert.equal(warnings[0]!.file, 'REVIEW_INSTRUCTIONS.md');
  assert.match(String(warnings[0]!.msg), /\(--instructions: REVIEW_INSTRUCTIONS\.md\)/);
  // The review itself is the same as without the warning.
  assert.deepEqual(findingsFile.findings, []);
});

test('runReview does not warn when the merge request does not change the file of the review instructions', async () => {
  const filePath = join(process.cwd(), 'REVIEW_INSTRUCTIONS.md');
  const { lines } = await reviewWithInstructions({ text: 'x', source: 'REVIEW_INSTRUCTIONS_FILE', filePath }, ['a.ts']);

  assert.equal(warnLines(lines).length, 0);
});

test('runReview does not compare a text source with the changed files', async () => {
  const { lines } = await reviewWithInstructions({ text: 'x', source: '--instructions-text' }, [
    'REVIEW_INSTRUCTIONS.md',
  ]);

  assert.equal(warnLines(lines).length, 0);
});
