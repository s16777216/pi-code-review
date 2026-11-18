import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion, ReviewContext, ReviewDiscussion } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import { ChangeSet } from './changedFile.ts';
import { runChecks } from './checks.ts';

const hunks = ['@@ -0,0 +1,2 @@', '+one', '+two'].join('\n');
const changes = ChangeSet.from([{ oldPath: 'a.ts', newPath: 'a.ts', hunks }]);

function discussion(id: string, extra: Partial<ReviewDiscussion> = {}): ReviewDiscussion {
  return {
    id,
    file: 'a.ts',
    line: 1,
    positionCommit: 'abc',
    resolved: false,
    fromThisTool: true,
    anchor: computeAnchor('a.ts', 'gone'),
    notes: [],
    ...extra,
  };
}

function setup(discussions: ReviewDiscussion[]) {
  const reads: string[] = [];
  const context: ReviewContext = {
    title: 't',
    description: '',
    changedFiles: [],
    listDiscussions: async () => discussions,
    async getFileContent(path) {
      reads.push(path);
      return 'one\ntwo';
    },
  };
  const warns: Array<Record<string, unknown>> = [];
  const logger = { warn: (obj: Record<string, unknown>) => warns.push(obj), info() {} } as unknown as Logger;
  return { context, reads, warns, logger };
}

const decl = (discussionId: string, reason: string): ResolvedDiscussion => ({ discussionId, reason });
const finding: Finding = { file: 'a.ts', line: 1, severity: 'low', summary: 'S' };

test('the first judge declaration of an ID wins', async () => {
  const { context, logger } = setup([discussion('d1')]);
  const result = await runChecks({ findings: [] }, context, changes, logger, undefined, async () => [
    decl('d1', 'judge'),
    decl('d1', 'judge again'),
  ]);
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
});

test('without judgeDiscussions nothing is resolved', async () => {
  const { context, logger } = setup([discussion('d1'), discussion('d2')]);
  const result = await runChecks({ findings: [] }, context, changes, logger);
  assert.deepEqual(result.resolved, []);
});

test('a judge declaration whose anchor line is still present is dropped with source discussion_judgment', async () => {
  const anchor = computeAnchor('a.ts', 'two');
  const { context, logger, warns } = setup([discussion('d1', { anchor })]);
  const result = await runChecks({ findings: [] }, context, changes, logger, undefined, async () => [
    decl('d1', 'judge'),
  ]);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(warns, [{ discussionId: 'd1', reason: 'anchor_still_present', source: 'discussion_judgment' }]);
});

test('a judge declaration on a deleted file is accepted without a file read', async () => {
  const deleted = ChangeSet.from([
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,2 +0,0 @@\n-one\n-two', deleted: true },
  ]);
  const { context, logger, reads } = setup([discussion('d1')]);
  const result = await runChecks({ findings: [] }, context, deleted, logger, undefined, async () => [
    decl('d1', 'judge'),
  ]);
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
  assert.deepEqual(reads, []);
});

test('judgeDiscussions gets the findings after betweenSteps', async () => {
  const { context, logger } = setup([]);
  let seen: Finding[] | undefined;
  await runChecks(
    { findings: [finding, { ...finding, line: 2 }] },
    context,
    changes,
    logger,
    async (findings) => findings.slice(0, 1),
    async (findings) => {
      seen = findings;
      return [];
    },
  );
  assert.equal(seen?.length, 1);
  assert.equal(seen?.[0]?.line, 1);
});

// --- evidence line (`judge-evidence-line`) ---

const evidenceFile = 'one\nreturn guard(value);\ntwo';
const anchorOfTwo = computeAnchor('a.ts', 'two');

function evidenceSetup(content: string, discussions: ReviewDiscussion[] = [discussion('d1', { anchor: anchorOfTwo })]) {
  const base = setup(discussions);
  const infos: Array<Record<string, unknown>> = [];
  const logger = {
    warn: (obj: Record<string, unknown>) => base.warns.push(obj),
    info: (obj: Record<string, unknown>) => infos.push(obj),
  } as unknown as Logger;
  const context: ReviewContext = { ...base.context, getFileContent: async () => content };
  return { ...base, context, logger, infos };
}

const judged =
  (evidence?: string, id = 'd1') =>
  async () => [{ ...decl(id, 'judge'), ...(evidence === undefined ? {} : { evidence }) }];

async function runJudged(content: string, evidence?: string) {
  const env = evidenceSetup(content);
  const result = await runChecks({ findings: [] }, env.context, changes, env.logger, undefined, judged(evidence));
  return { ...env, result };
}

test('a valid evidence line accepts a judge declaration whose anchored line is still present', async () => {
  const { result, infos, warns } = await runJudged(evidenceFile, 'return guard(value);');
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
  assert.deepEqual(infos, [{ discussionId: 'd1', file: 'a.ts', evidence: 'return guard(value);' }]);
  assert.deepEqual(warns, []);
});

test('the result of an accepted evidence line has no evidence field', async () => {
  const { result } = await runJudged(evidenceFile, 'return guard(value);');
  assert.equal('evidence' in result.resolved[0]!, false);
});

test('a judge declaration with no evidence line and a present anchor is dropped with anchor_still_present', async () => {
  const { result, warns } = await runJudged(evidenceFile);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(warns, [{ discussionId: 'd1', reason: 'anchor_still_present', source: 'discussion_judgment' }]);
});

test('an evidence line is not used when the anchor is gone', async () => {
  const { result, infos } = await runJudged('one\nreturn guard(value);', 'no such line anywhere');
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
  assert.deepEqual(infos, []);
});

for (const [name, evidence, problem] of [
  ['a line that is not in the file', 'return other(value);', 'not_in_file'],
  ['a part of a line', 'return guard(', 'not_in_file'],
  ['two lines', 'one\nreturn guard(value);', 'multiple_lines'],
  ['a line that is too short', 'two', 'too_short'],
] as const) {
  test(`${name} as evidence drops the declaration with evidence_not_valid and the problem ${problem}`, async () => {
    const { result, warns } = await runJudged(evidenceFile, evidence);
    assert.deepEqual(result.resolved, []);
    assert.deepEqual(warns, [
      { discussionId: 'd1', reason: 'evidence_not_valid', evidence, problem, source: 'discussion_judgment' },
    ]);
  });
}

test('an anchored line with at least 8 characters is not valid evidence', async () => {
  const text = 'throw new Error(x);';
  const env = evidenceSetup(`one\n${text}\ntwo`, [discussion('d1', { anchor: computeAnchor('a.ts', text) })]);
  const result = await runChecks({ findings: [] }, env.context, changes, env.logger, undefined, judged(text));
  assert.deepEqual(result.resolved, []);
  assert.equal(env.warns[0]?.reason, 'evidence_not_valid');
  assert.equal(env.warns[0]?.problem, 'is_anchored_line');
});

test('a missing semicolon or comma at the end of the evidence line does not matter', async () => {
  const withSemicolon = await runJudged(evidenceFile, 'return guard(value)');
  assert.deepEqual(withSemicolon.result.resolved, [decl('d1', 'judge')]);
  const withComma = await runJudged('one\nconst timer = null,\ntwo', 'const timer = null');
  assert.deepEqual(withComma.result.resolved, [decl('d1', 'judge')]);
});

test('spaces inside the evidence line do not matter', async () => {
  const { result } = await runJudged('one\nreturn  guard( value );\ntwo', 'return guard( value );');
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
});

test('the anchored line without its semicolon is not valid evidence', async () => {
  const text = 'throw new Error(x);';
  const env = evidenceSetup(`one\n${text}\ntwo`, [discussion('d1', { anchor: computeAnchor('a.ts', text) })]);
  const result = await runChecks(
    { findings: [] },
    env.context,
    changes,
    env.logger,
    undefined,
    judged('throw new Error(x)'),
  );
  assert.deepEqual(result.resolved, []);
  assert.equal(env.warns[0]?.problem, 'is_anchored_line');
});

test('a line that is only punctuation after normalizing is too short', async () => {
  const { warns } = await runJudged('one\n};;;;;;;;;;\ntwo', '};;;;;;;;;;');
  assert.equal(warns[0]?.problem, 'too_short');
});

test('a change of the indent does not matter for an evidence line', async () => {
  const { result } = await runJudged('one\n\t\t  return guard(value);\ntwo', '    return guard(value);   ');
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
});

test('an evidence line matches a line of a file with CRLF line ends', async () => {
  const { result } = await runJudged('one\r\nreturn guard(value);\r\ntwo', 'return guard(value);');
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
});

test('a judge declaration with an evidence line on a file that cannot be read is dropped with file_unreadable', async () => {
  const env = evidenceSetup('');
  const context: ReviewContext = { ...env.context, getFileContent: async () => ({ error: 'gone' }) };
  const result = await runChecks(
    { findings: [] },
    context,
    changes,
    env.logger,
    undefined,
    judged('return guard(value);'),
  );
  assert.deepEqual(result.resolved, []);
  assert.equal(env.warns[0]?.reason, 'file_unreadable');
});

test('a judge declaration with an evidence line on a deleted file is accepted without a file read', async () => {
  const deleted = ChangeSet.from([
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,2 +0,0 @@\n-one\n-two', deleted: true },
  ]);
  const env = evidenceSetup(evidenceFile);
  const result = await runChecks(
    { findings: [] },
    env.context,
    deleted,
    env.logger,
    undefined,
    judged('return guard(value);'),
  );
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
  assert.deepEqual(env.reads, []);
});
