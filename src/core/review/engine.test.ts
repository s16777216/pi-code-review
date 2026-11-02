import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { ReviewContext } from '../types.ts';
import { decidePassFail } from '../exitCode.ts';
import { AgentReviewEngine, buildSystemPrompt, SYSTEM_PROMPT } from './engine.ts';
import { ReviewFailureError } from './findings.ts';

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

test('AgentReviewEngine sends a request whose input fits the context window', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);
  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key' });

  assert.deepEqual(await engine.review(smallContext()), []);
  assert.equal(faux.state.callCount, 1);
});

test('AgentReviewEngine refuses an input that leaves too little room for the answer, without calling the model', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);
  const model = { ...faux.getModel(), contextWindow: 10_000 };
  const engine = new AgentReviewEngine({ provider: faux.provider, model, apiKey: 'test-key' });
  const context = smallContext();
  context.changedFiles = [
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,1 +1,1 @@\n-old\n+' + 'x'.repeat(30_000) },
  ];

  await assert.rejects(
    () => engine.review(context),
    (error: unknown) =>
      error instanceof ReviewFailureError &&
      /10000-token context window/.test(error.message) &&
      /--context-window/.test(error.message),
  );
  assert.equal(faux.state.callCount, 0);
});

test('AgentReviewEngine reports a final message cut at the token limit instead of parsing it', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[{"file":"a.ts","li', { stopReason: 'length' })]);
  const engine = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key' });

  await assert.rejects(
    () => engine.review(smallContext()),
    (error: unknown) =>
      error instanceof ReviewFailureError &&
      /--max-tokens/.test(error.message) &&
      /--context-window/.test(error.message),
  );
});

test('AgentReviewEngine counts the system prompt and tool declarations in the input estimate', async () => {
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage('[]')]);
  // The small user prompt alone (well under 200 tokens) would leave room for
  // the answer; the system message with the system prompt and the tool
  // declarations (several hundred tokens) does not.
  const model = { ...faux.getModel(), contextWindow: 4096 + 4096 + 200 };
  const engine = new AgentReviewEngine({ provider: faux.provider, model, apiKey: 'test-key' });

  await assert.rejects(() => engine.review(smallContext()), ReviewFailureError);
  assert.equal(faux.state.callCount, 0);
});

test('buildSystemPrompt returns SYSTEM_PROMPT unchanged when no language is set', () => {
  assert.equal(buildSystemPrompt(), SYSTEM_PROMPT);
  assert.equal(buildSystemPrompt(undefined), SYSTEM_PROMPT);
});

test('buildSystemPrompt appends the language sentence when a language is set', () => {
  const prompt = buildSystemPrompt('Traditional Chinese');

  assert.equal(prompt.startsWith(SYSTEM_PROMPT), true);
  assert.match(
    prompt,
    /Write every "summary" in Traditional Chinese\. Keep the JSON field names and the "severity" values exactly as specified above\.$/,
  );
});

test('AgentReviewEngine sends the language sentence to the model only when a language is set', async () => {
  const requests: string[] = [];
  const capture = (context: unknown) => {
    requests.push(JSON.stringify(context));
    return fauxAssistantMessage('[]');
  };

  const faux = fauxProvider();
  faux.setResponses([capture, capture]);
  const plain = new AgentReviewEngine({ provider: faux.provider, model: faux.getModel(), apiKey: 'test-key' });
  const localized = new AgentReviewEngine({
    provider: faux.provider,
    model: faux.getModel(),
    apiKey: 'test-key',
    language: 'Japanese',
  });

  await plain.review(smallContext());
  await localized.review(smallContext());

  assert.equal(requests.length, 2);
  assert.doesNotMatch(requests[0]!, /Write every \\"summary\\" in/);
  assert.match(requests[1]!, /Write every \\"summary\\" in Japanese\. Keep the JSON field names/);
});
