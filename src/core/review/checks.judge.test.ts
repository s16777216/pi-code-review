import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion } from '../types.ts';
import { ChangeSet } from './changedFile.ts';
import { runChecks, type DecideFinal } from './checks.ts';

const hunks = ['@@ -0,0 +1,2 @@', '+one', '+two'].join('\n');
const changes = ChangeSet.from([{ oldPath: 'a.ts', newPath: 'a.ts', hunks }]);

function setup() {
  const warns: Array<Record<string, unknown>> = [];
  const logger = { warn: (obj: Record<string, unknown>) => warns.push(obj), info() {} } as unknown as Logger;
  return { warns, logger };
}

const decl = (discussionId: string, reason: string): ResolvedDiscussion => ({ discussionId, reason });
const finding: Finding = { file: 'a.ts', line: 1, severity: 'low', summary: 'S' };

/** A verify agent step that resolves every declaration and keeps every finding. */
const resolveAll: DecideFinal = async (findings, declarations) => ({
  findings,
  resolved: declarations.map((declaration) => ({ discussionId: declaration.discussionId, reason: 'agent' })),
});

test('the first judge declaration of an ID is the one that the verify agent gets', async () => {
  const { logger } = setup();
  let seen: unknown;
  await runChecks(
    { findings: [] },
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge'), decl('d1', 'judge again')],
    async (findings, declarations) => {
      seen = declarations;
      return { findings, resolved: [] };
    },
  );
  assert.deepEqual(seen, [decl('d1', 'judge')]);
});

test('without judgeDiscussions nothing is resolved and the verify agent does not run', async () => {
  const { logger } = setup();
  let calls = 0;
  const result = await runChecks({ findings: [] }, changes, logger, undefined, undefined, async (findings) => {
    calls += 1;
    return { findings, resolved: [] };
  });
  assert.deepEqual(result.resolved, []);
  assert.equal(calls, 0);
});

test('a judgment alone does not resolve: without the verify agent nothing is resolved', async () => {
  const { logger } = setup();
  const result = await runChecks({ findings: [] }, changes, logger, undefined, async () => [decl('d1', 'judge')]);
  assert.deepEqual(result.resolved, []);
});

test('judgeDiscussions runs once after betweenSteps and gets no argument', async () => {
  const { logger } = setup();
  const seen: unknown[][] = [];
  await runChecks(
    { findings: [finding, { ...finding, line: 2 }] },
    changes,
    logger,
    async (findings) => findings.slice(0, 1),
    async (...args) => {
      seen.push(args);
      return [];
    },
  );
  assert.deepEqual(seen, [[]]);
});

test('the verify agent gets the checked findings with their anchor and the declarations', async () => {
  const { logger } = setup();
  let seenFindings: Finding[] = [];
  let seenDeclarations: unknown;
  await runChecks(
    { findings: [finding] },
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge')],
    async (findings, declarations) => {
      seenFindings = findings;
      seenDeclarations = declarations;
      return { findings, resolved: [] };
    },
  );
  assert.equal(seenFindings.length, 1);
  assert.equal(typeof seenFindings[0]!.anchor, 'string');
  assert.deepEqual(seenDeclarations, [decl('d1', 'judge')]);
});

test('the result of the verify agent is the result, with no warn line', async () => {
  const { logger, warns } = setup();
  const result = await runChecks(
    { findings: [finding] },
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge')],
    async (findings, declarations) => ({
      findings: findings.slice(0, 0),
      resolved: declarations.map((declaration) => ({ discussionId: declaration.discussionId, reason: 'agent' })),
    }),
  );
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.resolved, [decl('d1', 'agent')]);
  assert.deepEqual(warns, []);
});

test('a resolve of the verify agent is not rejected by a rule of the code', async () => {
  const { logger, warns } = setup();
  // `d2` is not in the list of the judge, and the step still gets its resolve back as it is.
  const result = await runChecks(
    { findings: [] },
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge')],
    async (findings) => ({
      findings,
      resolved: [decl('d1', 'agent'), decl('d2', 'agent')],
    }),
  );
  assert.deepEqual(result.resolved, [decl('d1', 'agent'), decl('d2', 'agent')]);
  assert.deepEqual(warns, []);
});

test('the verify agent resolves every declaration that it is given', async () => {
  const { logger } = setup();
  const result = await runChecks(
    { findings: [] },
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge'), decl('d2', 'judge')],
    resolveAll,
  );
  assert.deepEqual(
    result.resolved.map((item) => item.discussionId),
    ['d1', 'd2'],
  );
});
