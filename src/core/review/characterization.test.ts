import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import { AgentReviewEngine, buildSystemPrompt } from './engine.ts';
import { Batch } from './scope.ts';
import { fixtureContext } from './characterization.fixtures.ts';
import { logicOnly } from './fauxFocus.ts';
import { REVIEW_FOCUSES } from './focus.ts';

/**
 * Pins the exact output of the review core for a fixed change
 * (`model-diffs-and-run-scopes` design, Decision 5): the prompts, the
 * findings, the warnings, and the debug log fields, for a single run and for
 * a run in four batches. It was recorded from the code before the refactor
 * and must not change while the refactor goes on. If it fails, the output of
 * the review changed.
 *
 * The expected text is in `__golden__/review-output.txt`, produced by the
 * same `render()` below.
 */

/** Every case the checks handle, in one agent output. */
const AGENT_OUTPUT = {
  findings: [
    { file: 'src/a.ts', line: 2, severity: 'high', summary: 'ok line' },
    { file: 'src/a.ts', line: 22, severity: 'low', summary: 'ok line in part 2', relatesTo: 'own-open' },
    { file: 'src/a.ts', line: 3, severity: 'low', summary: 'unknown relatesTo', relatesTo: 'nope' },
    { file: 'src/a.ts', line: 99, severity: 'low', summary: 'line not in diff' },
    { file: 'src/zzz.ts', line: 1, severity: 'low', summary: 'file not changed' },
    { file: 'yarn.lock', line: 1, severity: 'low', summary: 'omitted file' },
    { file: 'src/b.ts', line: 1, severity: 'low', summary: 'in b first hunk' },
    { file: 'src/b.ts', line: 41, severity: 'low', summary: 'in b second hunk' },
    { file: 'src/new-name.ts', line: 3, severity: 'high', summary: 'renamed file' },
    { file: 'src/a.ts', line: 1, severity: 'low', summary: 'context line' },
  ],
  resolved: [
    { discussionId: 'own-open', reason: 'declared' },
    { discussionId: 'missing', reason: 'x' },
  ],
};

async function render(window: number, label: string): Promise<string> {
  const faux = fauxProvider();
  logicOnly(
    faux,
    Array.from({ length: 12 }, () =>
      fauxAssistantMessage([fauxToolCall('submit_review', AGENT_OUTPUT as never)], { stopReason: 'toolUse' }),
    ),
  );
  const warns: unknown[] = [];
  const infos: unknown[] = [];
  const debugs: Record<string, unknown>[] = [];
  const logger = {
    debug: (o: Record<string, unknown>) => debugs.push(o),
    info: (o: unknown) => infos.push(o),
    warn: (o: unknown) => warns.push(o),
    error() {},
  } as unknown as import('../../logger.ts').Logger;
  const engine = new AgentReviewEngine({
    provider: faux.provider,
    model: { ...faux.getModel(), contextWindow: window },
    apiKey: 'k',
    language: '繁體中文',
    logger,
    sleep: async () => {},
  });
  const r = await engine.review(fixtureContext());

  const out: string[] = [];
  out.push(`=== ${label} (calls=${faux.state.callCount}) ===`);
  out.push(JSON.stringify({ findings: r.findings, resolved: r.resolved, unreviewedFiles: r.unreviewedFiles }, null, 1));
  out.push('WARNS ' + JSON.stringify(warns, null, 1));
  out.push('INFOS ' + JSON.stringify(infos));
  // Three agents for each scope: sort by batch and then by system prompt, so the record does not depend on timing.
  const logged = (
    debugs.filter((d) => 'prompt' in d) as { batch?: number; prompt: string; systemPrompt: string }[]
  ).sort(
    (a, b) =>
      (a.batch ?? 0) - (b.batch ?? 0) ||
      (a.systemPrompt < b.systemPrompt ? -1 : a.systemPrompt > b.systemPrompt ? 1 : 0),
  );
  out.push(
    'DEBUG PROMPT FIELDS ' +
      JSON.stringify(
        logged.map((d) => ({
          batch: d.batch ?? null,
          promptChars: d.prompt.length,
          systemChars: d.systemPrompt.length,
        })),
      ),
  );
  out.push(
    'DEBUG OTHER KEYS ' +
      JSON.stringify(debugs.filter((d) => !('prompt' in d)).map((d) => Object.keys(d).sort().join(','))),
  );
  logged.forEach((d) => out.push(`--- logged prompt batch=${d.batch ?? '-'} ---\n${d.prompt}`));
  return out.join('\n');
}

async function renderAll(): Promise<string> {
  const parts = [await render(128000, 'SINGLE RUN'), await render(4200, 'BATCHES')];
  parts.push('=== SYSTEM PROMPT TAILS ===');
  parts.push(buildSystemPrompt().slice(-60));
  parts.push(buildSystemPrompt('繁體中文', new Batch([], 2, 4), undefined, REVIEW_FOCUSES[1]).slice(-800));
  parts.push('=== REVIEW FOCUSES ===');
  for (const focus of REVIEW_FOCUSES) parts.push(`${focus.name}: ${focus.paragraph}`);
  return parts.join('\n');
}

test('the review output is byte-identical to the recorded output', async () => {
  const expected = readFileSync(fileURLToPath(new URL('./__golden__/review-output.txt', import.meta.url)), 'utf8');
  const actual = await renderAll();
  // Set UPDATE_GOLDEN=1 to record the output again after a change on purpose.
  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(fileURLToPath(new URL('./__golden__/review-output.txt', import.meta.url)), `${actual}\n`);
    return;
  }
  // Compare line by line, so a failure names the first line that differs.
  const a = actual.split('\n');
  const e = expected.replace(/\n$/, '').split('\n');
  const first = a.findIndex((line, i) => line !== e[i]);
  assert.equal(first === -1 && a.length === e.length ? 'same' : `first difference at line ${first + 1}`, 'same');
});

test('the single run asks for the whole change, and the batches split it in four parts', async () => {
  const text = await renderAll();
  // Three agents for each scope, one for each review focus, and one call for
  // the deduplication step: the fixed output has more than one finding in a file.
  assert.match(text, /=== SINGLE RUN \(calls=4\) ===/);
  assert.match(text, /=== BATCHES \(calls=13\) ===/);
  assert.match(text, /INFOS \[\{"batches":4\},/);
});
