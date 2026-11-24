import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { Finding, ReviewContext } from '../types.ts';
import { AgentReviewEngine } from './engine.ts';
import { perFocus } from './fauxFocus.ts';
import { REVIEW_FOCUSES } from './focus.ts';
import { deriveConfidence } from './confidence.ts';

// Tests for `record-review-confidence`: the review focus goes from the review
// step to the deduplication step, and corroboration and confidence come out.

const LOGIC = 0;
const SECURITY = 1;
const RESOURCES = 2;

function submitReview(findings: Record<string, unknown>[]) {
  return fauxAssistantMessage([fauxToolCall('submit_review', { findings, resolved: [] } as never)], {
    stopReason: 'toolUse',
  });
}

function context(): ReviewContext {
  const lines = ['+one', '+two', '+three', '+four', '+five'];
  return {
    title: 'Small change',
    description: '',
    changedFiles: [{ oldPath: 'a.ts', newPath: 'a.ts', hunks: ['@@ -0,0 +1,5 @@', ...lines].join('\n') }],
    listDiscussions: async () => [],
    async getFileContent() {
      return { error: 'not used' };
    },
  };
}

function engineWith(faux: ReturnType<typeof fauxProvider>, debugs: Record<string, unknown>[] = []) {
  const logger = {
    debug: (o: Record<string, unknown>) => debugs.push(o),
    info() {},
    warn() {},
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  return new AgentReviewEngine({
    provider: faux.provider,
    model: faux.getModel(),
    apiKey: 'k',
    language: 'English',
    logger,
    sleep: async () => {},
  });
}

const finding = (line: number, severity = 'high') => ({
  file: 'a.ts',
  line,
  severity,
  summary: `problem on line ${line}`,
});

test('the engine sets the review focus of each finding when it merges the outputs', async () => {
  const faux = fauxProvider();
  perFocus(faux, {
    [LOGIC]: [submitReview([finding(1)])],
    [SECURITY]: [submitReview([finding(2)])],
    [RESOURCES]: [submitReview([finding(3)])],
  });
  const engine = engineWith(faux);
  let seen: Finding[] = [];
  // The deduplication step is the first reader of the focus.
  (engine as unknown as { deduplicate: (f: Finding[]) => Promise<Finding[]> }).deduplicate = async (findings) => {
    seen = findings;
    return findings;
  };
  await engine.review(context());
  assert.deepEqual(
    seen.map((f) => [f.line, f.focus]),
    [
      [1, REVIEW_FOCUSES[LOGIC]!.name],
      [2, REVIEW_FOCUSES[SECURITY]!.name],
      [3, REVIEW_FOCUSES[RESOURCES]!.name],
    ],
  );
});

test('the prompt of a later step does not name the review focus of a finding', async () => {
  const faux = fauxProvider();
  const group = fauxAssistantMessage([fauxToolCall('submit_groups', { groups: [[1, 2]] } as never)], {
    stopReason: 'toolUse',
  });
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] }, [group]);
  const debugs: Record<string, unknown>[] = [];
  await engineWith(faux, debugs).review(context());
  const steps = debugs.filter((d) => typeof d.prompt === 'string' && typeof d.step === 'string');
  assert.deepEqual([...new Set(steps.map((d) => d.step))].sort(), ['deduplication', 'verification']);
  for (const step of steps) {
    for (const focus of REVIEW_FOCUSES) {
      assert.ok(!(step.prompt as string).includes(focus.name), `${String(step.step)} prompt names "${focus.name}"`);
    }
    assert.ok(!(step.prompt as string).includes('"focus"'), `${String(step.step)} prompt has a focus field`);
  }
});

const group12 = () =>
  fauxAssistantMessage([fauxToolCall('submit_groups', { groups: [[1, 2]] } as never)], { stopReason: 'toolUse' });

test('a problem that two focuses report has corroboration 2, and no finding has a focus', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] }, [group12()]);
  const result = await engineWith(faux).review(context());
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.corroboration, 2);
  assert.equal('focus' in result.findings[0]!, false);
});

test('a finding that one focus reports has corroboration 1, also when the step makes no model call', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])] });
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.findings.map((f) => [f.corroboration, 'focus' in f]),
    [[1, false]],
  );
});

test('a failed deduplication step gives corroboration 1 to every finding, without a focus', async () => {
  const faux = fauxProvider();
  const failing = () => fauxAssistantMessage('no tool call');
  perFocus(
    faux,
    { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] },
    Array.from({ length: 6 }, failing),
  );
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ['deduplication_failed'],
  );
  assert.deepEqual(
    result.findings.map((f) => [f.corroboration, 'focus' in f]),
    [
      [1, false],
      [1, false],
    ],
  );
});

// --- deriveConfidence (task 3.1) ---

test('deriveConfidence follows the table of the spec', () => {
  assert.equal(deriveConfidence(2, 'confirmed'), 'high');
  assert.equal(deriveConfidence(3, 'confirmed'), 'high');
  assert.equal(deriveConfidence(2, 'uncertain'), 'medium');
  assert.equal(deriveConfidence(1, 'confirmed'), 'medium');
  assert.equal(deriveConfidence(1, 'uncertain'), 'low');
});

test('deriveConfidence treats a missing verdict as uncertain', () => {
  assert.equal(deriveConfidence(2, undefined), 'medium');
  assert.equal(deriveConfidence(1, undefined), 'low');
});

// --- the verification step (task 3.2) ---

function verdictsFor(verdict: 'confirmed' | 'uncertain' | 'rejected', severity = 'high') {
  return (callContext: unknown) => {
    const numbers = [...JSON.stringify(callContext).matchAll(/number\\?": (\d+)/g)].map((m) => Number(m[1]));
    const verdicts = [...new Set(numbers)].map((number) => ({ number, verdict, severity, reason: 'Checked.' }));
    return fauxAssistantMessage([fauxToolCall('submit_verdicts', { verdicts } as never)], { stopReason: 'toolUse' });
  };
}

test('the verification step gives each kept finding its verdict and its confidence', async () => {
  const faux = fauxProvider();
  perFocus(
    faux,
    { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] },
    [group12()],
    [verdictsFor('confirmed')],
  );
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.findings.map((f) => [f.corroboration, f.verdict, f.confidence]),
    [[2, 'confirmed', 'high']],
  );
});

test('an uncertain verdict of a finding that one focus reports gives confidence low', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])] }, [], [verdictsFor('uncertain')]);
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.findings.map((f) => [f.corroboration, f.verdict, f.confidence]),
    [[1, 'uncertain', 'low']],
  );
});

test('a rejected finding is dropped and has no confidence', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])] }, [], [verdictsFor('rejected')]);
  const result = await engineWith(faux).review(context());
  assert.deepEqual(result.findings, []);
});

test('the confidence does not change the severity that the verifier gives', async () => {
  const faux = fauxProvider();
  perFocus(faux, { [LOGIC]: [submitReview([finding(1, 'low')])] }, [], [verdictsFor('uncertain', 'critical')]);
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.findings.map((f) => [f.severity, f.confidence]),
    [['critical', 'low']],
  );
});

test('a file whose verification fails keeps its findings with the verdict uncertain for the confidence, and no verdict', async () => {
  const faux = fauxProvider();
  const failing = () => fauxAssistantMessage('no tool call');
  perFocus(
    faux,
    { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] },
    [group12()],
    Array.from({ length: 6 }, failing),
  );
  const result = await engineWith(faux).review(context());
  assert.deepEqual(
    result.warnings.map((w) => w.code),
    ['verification_failed'],
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.corroboration, 2);
  assert.equal(result.findings[0]!.confidence, 'medium');
  assert.equal('verdict' in result.findings[0]!, false);
});

test('confidence, corroboration and verdict stay on a finding through the verify agent step', async () => {
  const faux = fauxProvider();
  const discussion = {
    id: 'd1',
    file: 'a.ts',
    line: 3,
    resolved: false,
    fromThisTool: true,
    anchor: null,
    positionCommit: null,
    notes: [{ author: 'picr', body: 'An old problem.' }],
  };
  perFocus(faux, { [LOGIC]: [submitReview([finding(1)])], [SECURITY]: [submitReview([finding(1)])] }, [group12()]);
  const base = context();
  const result = await engineWith(faux).review({ ...base, listDiscussions: async () => [discussion as never] });
  assert.equal(result.findings.length, 1);
  assert.deepEqual(
    [result.findings[0]!.corroboration, result.findings[0]!.verdict, result.findings[0]!.confidence],
    [2, 'confirmed', 'high'],
  );
});
