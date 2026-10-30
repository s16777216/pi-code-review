import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ReviewContext } from '../types.ts';
import { decidePassFail } from '../report/exitCode.ts';
import { AgentReviewEngine } from './engine.ts';

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
  const fakeLogger = { debug: (obj: unknown) => debugCalls.push(obj) } as unknown as import('../logger.ts').Logger;
  const engine = new AgentReviewEngine({
    provider: faux.provider,
    model: faux.getModel(),
    apiKey: 'test-key',
    logger: fakeLogger,
  });

  await engine.review(context);

  assert.equal(debugCalls.length, 2);
  const [promptCall, responseCall] = debugCalls as [{ prompt: string }, { response: string }];
  assert.match(promptCall.prompt, /Small change/);
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
