import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall, type FauxResponseStep } from '@earendil-works/pi-ai';
import { InMemoryTelemetryContext } from '@earendil-works/pi-telemetry';
import type { ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { AgentReviewEngine } from './engine.ts';
import { perFocus } from './fauxFocus.ts';
import { REVIEW_FOCUSES } from './focus.ts';

// Tests for `export-review-traces`: the spans of a review run.

const LOGIC = 0;
const noSleep = async () => {};

function submitReview(findings: Record<string, unknown>[] = []) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings } as never)], { stopReason: 'toolUse' });
}

function submitGroups(groups: number[][]) {
  return fauxAssistantMessage([fauxToolCall('submit_groups', { groups } as never)], { stopReason: 'toolUse' });
}

function submitVerdicts(verdicts: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_verdicts', { verdicts } as never)], { stopReason: 'toolUse' });
}

const finding = (line: number, summary = `Problem on ${line}.`) => ({ file: 'a.ts', line, severity: 'high', summary });

function discussion(id: string, text: string): ReviewDiscussion {
  return {
    id,
    file: 'a.ts',
    line: 1,
    positionCommit: 'abc',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor('a.ts', text),
    notes: [{ author: 'picr', body: `Note of ${id}.` }],
  };
}

function contextFor(discussions: ReviewDiscussion[] = [], content = 'one\ntwo\nthree'): ReviewContext {
  return {
    title: 'Small change',
    description: '',
    changedFiles: [
      { oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -0,0 +1,3 @@', '+one', '+two', '+three'].join('\n') },
    ],
    listDiscussions: async () => discussions,
    async getFileContent() {
      return content;
    },
  };
}

/** Runs the review under a root span of an in-memory context, and returns the recorded spans. */
async function traced(faux: ReturnType<typeof fauxProvider>, context: ReviewContext) {
  const memory = new InMemoryTelemetryContext();
  const result = await memory.startSpan({ name: 'review' }, (span) =>
    new AgentReviewEngine({
      provider: faux.provider,
      model: faux.getModel(),
      apiKey: 'k',
      sleep: noSleep,
      telemetry: span,
    }).review(context),
  );
  const spans = memory.getSpans();
  const root = spans.find((span) => span.name === 'review')!;
  const children = (id: number) => spans.filter((span) => span.parentId === id);
  return { result, spans, root, children };
}

test('a review with every step has one span for each step under the root span', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1), finding(2)])] }, [submitGroups([[1], [2]])]);

  const { root, children } = await traced(faux, contextFor([discussion('d1', 'one')]));

  assert.deepEqual(
    children(root.id)
      .map((span) => span.name)
      .sort(),
    [
      'picr.step.deduplication',
      'picr.step.discussion_judgment',
      'picr.step.review_agents',
      'picr.step.verification',
      'picr.step.verify_agent',
    ],
  );
});

test('a step that makes no model call has no span', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])] });

  const { root, children } = await traced(faux, contextFor());

  const names = children(root.id).map((span) => span.name);
  assert.equal(names.includes('picr.step.deduplication'), false);
  assert.equal(names.includes('picr.step.discussion_judgment'), false);
  assert.equal(names.includes('picr.step.verify_agent'), false);
});

test('the review agents step has one agent run span for each review focus', async () => {
  const faux = fauxProvider();
  perFocus(faux, {});

  const { spans, children } = await traced(faux, contextFor());

  const step = spans.find((span) => span.name === 'picr.step.review_agents')!;
  const runs = children(step.id).filter((span) => span.name === 'picr.agent_run');
  assert.deepEqual(runs.map((span) => span.attributes['picr.focus']).sort(), REVIEW_FOCUSES.map((f) => f.name).sort());
  for (const run of runs) assert.equal(run.attributes['picr.agent.kind'], 'review');
});

test('a run that is tried again has one agent run span for each try', async () => {
  const faux = fauxProvider();
  const error: FauxResponseStep = fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'Request timed out.' });
  perFocus(faux, { [LOGIC]: [error, submitReview()] });

  const { spans } = await traced(faux, contextFor());

  const logic = spans.filter(
    (span) => span.name === 'picr.agent_run' && span.attributes['picr.focus'] === REVIEW_FOCUSES[LOGIC]!.name,
  );
  assert.deepEqual(
    logic.map((span) => [span.attributes['picr.try'], span.status.status]),
    [
      [1, 'error'],
      [2, 'ok'],
    ],
  );
});

test('each model request of an agent run has a model request span with its usage under the agent run', async () => {
  const faux = fauxProvider();
  const read = fauxAssistantMessage([fauxToolCall('get_file_content', { path: 'a.ts' } as never)], {
    stopReason: 'toolUse',
  });
  perFocus(faux, { [LOGIC]: [read, submitReview()] });

  const { spans, children } = await traced(faux, contextFor());

  const run = spans.find(
    (span) => span.name === 'picr.agent_run' && span.attributes['picr.focus'] === REVIEW_FOCUSES[LOGIC]!.name,
  )!;
  const requests = children(run.id).filter((span) => span.name === 'picr.model_request');
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((span) => span.attributes.stop),
    ['toolUse', 'toolUse'],
  );
  assert.equal(typeof requests[0]!.attributes['usage.input'], 'number');
});

test('a get_file_content call has a tool call span with the tool name, the path, and the result', async () => {
  const faux = fauxProvider();
  const read = fauxAssistantMessage([fauxToolCall('get_file_content', { path: 'a.ts' } as never)], {
    stopReason: 'toolUse',
  });
  perFocus(faux, { [LOGIC]: [read, submitReview()] });

  const { spans } = await traced(faux, contextFor());

  const call = spans.find(
    (span) => span.name === 'picr.tool_call' && span.attributes['picr.tool.name'] === 'get_file_content',
  )!;
  assert.equal(call.attributes['picr.tool.path'], 'a.ts');
  assert.match(String(call.attributes['picr.tool.result']), /1 \| one/);
  assert.equal(call.status.status, 'ok');
});

test('a rejected submit_review call has a tool call span with the status error and the message', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    // The schema accepts it, and `validateFinding` rejects it.
    [LOGIC]: [submitReview([{ ...finding(3), endLine: 2 }]), submitReview()],
  });

  const { spans } = await traced(faux, contextFor());

  const calls = spans.filter(
    (span) => span.name === 'picr.tool_call' && span.attributes['picr.tool.name'] === 'submit_review',
  );
  const rejected = calls.find((span) => span.status.status === 'error')!;
  assert.ok(rejected);
  assert.match(rejected.status.status === 'error' ? (rejected.status.error?.message ?? '') : '', /"endLine"/);
});

test('an agent run span holds its prompts and its responses', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview()] });

  const { spans } = await traced(faux, contextFor());

  const run = spans.find((span) => span.name === 'picr.agent_run')!;
  assert.match(String(run.attributes['picr.prompt.system']), /automated code reviewer/);
  assert.match(String(run.attributes['picr.prompt.user']), /a\.ts/);
  const responses = run.events.filter((event) => event.name === 'picr.response');
  assert.ok(responses.length >= 1);
  assert.deepEqual(responses.at(-1)!.attributes['picr.response.tool_calls'], ['submit_review']);
});

test('a long tool result is cut at the limit, with the mark and the full length', async () => {
  const faux = fauxProvider();
  const read = fauxAssistantMessage([fauxToolCall('get_file_content', { path: 'a.ts' } as never)], {
    stopReason: 'toolUse',
  });
  perFocus(faux, { [LOGIC]: [read, submitReview()] });
  const long = Array.from({ length: 15_000 }, () => 'x'.repeat(9)).join('\n');

  const { spans } = await traced(faux, contextFor([], long));

  const call = spans.find((span) => span.attributes['picr.tool.name'] === 'get_file_content')!;
  assert.equal(String(call.attributes['picr.tool.result']).length, 100_000);
  assert.equal(call.attributes['picr.tool.result.truncated'], true);
  assert.ok(Number(call.attributes['picr.tool.result.length']) > 100_000);
});

test('a finding outside the diff gives a dropped event with the file, the line, and the reason', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(99)])] });

  const { root } = await traced(faux, contextFor());

  const dropped = root.events.filter((event) => event.name === 'picr.finding.dropped');
  assert.deepEqual(
    dropped.map((event) => event.attributes),
    [{ 'picr.file': 'a.ts', 'picr.line': 99, 'picr.reason': 'line_not_in_diff' }],
  );
});

test('the verification step span holds the findings before and after the step', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([finding(1), finding(2)])] },
    [submitGroups([[1], [2]])],
    [
      submitVerdicts([
        { number: 1, verdict: 'confirmed', severity: 'high', reason: 'Line 1.' },
        { number: 2, verdict: 'rejected', severity: 'high', reason: 'Line 2.' },
      ]),
    ],
  );

  const { spans } = await traced(faux, contextFor());

  const step = spans.find((span) => span.name === 'picr.step.verification')!;
  assert.equal(step.attributes['picr.findings.before'], 2);
  assert.equal(step.attributes['picr.findings.after'], 1);
});
