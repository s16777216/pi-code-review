import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ReviewContext } from '../types.ts';
import { decidePassFail } from '../exitCode.ts';
import { AgentReviewEngine, SYSTEM_PROMPT } from './engine.ts';

test('AgentReviewEngine reviews a hand-built ReviewContext with no GitLab API involved', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall('get_file_content', { path: 'a.ts' })], { stopReason: 'toolUse' }),
    fauxAssistantMessage(
      JSON.stringify([{ file: 'a.ts', line: 2, severity: 'important', summary: 'Off-by-one bug introduced by the diff.' }]),
    ),
  ]);

  let fileContentRequested: string | null = null;
  const context: ReviewContext = {
    title: 'Fix loop bound',
    description: 'Changes the loop condition.',
    changedFiles: [
      {
        oldPath: 'a.ts',
        newPath: 'a.ts',
        hunks: ['@@ -1,2 +1,2 @@', '-for (let i = 0; i <= n; i++) {', '+for (let i = 0; i < n; i++) {', ' doSomething();'].join(
          '\n',
        ),
      },
    ],
    async getFileContent(path) {
      fileContentRequested = path;
      return 'for (let i = 0; i < n; i++) {\n  doSomething();\n}\n';
    },
  };

  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key' });

  const findings = await engine.review(context);

  assert.deepEqual(findings, [
    { file: 'a.ts', line: 2, severity: 'important', summary: 'Off-by-one bug introduced by the diff.' },
  ]);
  assert.equal(fileContentRequested, 'a.ts');
  assert.equal(faux.state.callCount, 2);
  assert.equal(decidePassFail(findings, 'important'), false);
});

test('AgentReviewEngine logs the prompt and raw response, and never logs the apiKey', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'a.ts', line: 1, severity: 'nit', summary: 'Minor.' }])),
  ]);

  const context: ReviewContext = {
    title: 'Small change',
    description: '',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    async getFileContent() {
      return { error: 'not used' };
    },
  };

  const debugCalls: unknown[] = [];
  const fakeLogger = { debug: (obj: unknown) => debugCalls.push(obj) } as unknown as import('../../logger.ts').Logger;
  const engine = new AgentReviewEngine({
    provider: faux.provider,
    model: faux.getModel(),
    apiKey: 'test-key',
    logger: fakeLogger,
  });

  await engine.review(context);

  assert.equal(debugCalls.length, 3);
  const [promptCall, finalMessageCall, responseCall] = debugCalls as [
    { prompt: string },
    { stopReason: string; usage: unknown; contentBlockTypes: string[] },
    { response: string },
  ];
  assert.match(promptCall.prompt, /Small change/);
  assert.deepEqual(finalMessageCall.contentBlockTypes, ['text']);
  assert.match(responseCall.response, /Minor\./);
  const serialized = JSON.stringify(debugCalls);
  assert.doesNotMatch(serialized, /test-key/);
});

test('AgentReviewEngine drops a finding whose line is not in the diff', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'a.ts', line: 999, severity: 'important', summary: 'Bogus line.' }])),
  ]);

  const context: ReviewContext = {
    title: 'Small change',
    description: '',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    async getFileContent() {
      return { error: 'not used' };
    },
  };

  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key' });

  const findings = await engine.review(context);

  assert.deepEqual(findings, []);
  assert.equal(decidePassFail(findings, 'important'), true);
});

test('SYSTEM_PROMPT tells the agent that the number before "|" is the new-file line to report', () => {
  assert.match(SYSTEM_PROMPT, /number before "\|" is the line's number in the new version of the file/);
  assert.match(SYSTEM_PROMPT, /it is not part of the code/);
  assert.match(SYSTEM_PROMPT, /"line" \(the number shown before "\|"/);
});

function smallContext(): ReviewContext {
  return {
    title: 'Small change',
    description: '',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+new' }],
    async getFileContent() {
      return { error: 'not used' };
    },
  };
}

function recordingLogger(): { logger: import('../../logger.ts').Logger; warnings: Record<string, unknown>[] } {
  const warnings: Record<string, unknown>[] = [];
  const logger = {
    debug: () => {},
    warn: (obj: Record<string, unknown>) => warnings.push(obj),
  } as unknown as import('../../logger.ts').Logger;
  return { logger, warnings };
}

test('AgentReviewEngine keeps a valid finding when another finding in the same output is invalid', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(
      JSON.stringify([
        { file: 'a.ts', line: 1, severity: 'critical', summary: 'Bad severity.' },
        { file: 'a.ts', line: 1, severity: 'important', summary: 'Real bug.' },
      ]),
    ),
  ]);
  const { logger, warnings } = recordingLogger();
  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key', logger });

  const findings = await engine.review(smallContext());

  assert.deepEqual(findings, [{ file: 'a.ts', line: 1, severity: 'important', summary: 'Real bug.' }]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]!.index, 0);
});

test('AgentReviewEngine logs a finding on a file the change did not touch, and does not return it', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'other.ts', line: 1, severity: 'pre_existing', summary: 'Elsewhere.' }])),
  ]);
  const { logger, warnings } = recordingLogger();
  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key', logger });

  const findings = await engine.review(smallContext());

  assert.deepEqual(findings, []);
  assert.deepEqual(warnings, [{ file: 'other.ts', line: 1, reason: 'file_not_changed' }]);
});

test('AgentReviewEngine logs a finding on a line outside the diff, and does not return it', async () => {
  const faux = fauxProvider();
  faux.setResponses([
    fauxAssistantMessage(JSON.stringify([{ file: 'a.ts', line: 999, severity: 'important', summary: 'Bogus line.' }])),
  ]);
  const { logger, warnings } = recordingLogger();
  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key', logger });

  const findings = await engine.review(smallContext());

  assert.deepEqual(findings, []);
  assert.deepEqual(warnings, [{ file: 'a.ts', line: 999, reason: 'line_not_in_diff' }]);
});
