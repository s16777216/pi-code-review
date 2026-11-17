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
  const logger = { warn: (obj: Record<string, unknown>) => warns.push(obj) } as unknown as Logger;
  return { context, reads, warns, logger };
}

const decl = (discussionId: string, reason: string): ResolvedDiscussion => ({ discussionId, reason });
const finding: Finding = { file: 'a.ts', line: 1, severity: 'low', summary: 'S' };

test('a focus agent declaration wins over a judge declaration with the same ID', async () => {
  const { context, logger } = setup([discussion('d1')]);
  const result = await runChecks(
    { findings: [], resolved: [decl('d1', 'agent')] },
    context,
    changes,
    logger,
    undefined,
    async () => [decl('d1', 'judge'), decl('d1', 'judge again')],
  );
  assert.deepEqual(result.resolved, [decl('d1', 'agent')]);
});

test('without judgeDiscussions the behavior is unchanged', async () => {
  const { context, logger } = setup([discussion('d1'), discussion('d2')]);
  const result = await runChecks({ findings: [], resolved: [decl('d1', 'agent')] }, context, changes, logger);
  assert.deepEqual(result.resolved, [decl('d1', 'agent')]);
});

test('a judge declaration whose anchor line is still present is dropped with source discussion_judgment', async () => {
  const anchor = computeAnchor('a.ts', 'two');
  const { context, logger, warns } = setup([discussion('d1', { anchor })]);
  const result = await runChecks({ findings: [], resolved: [] }, context, changes, logger, undefined, async () => [
    decl('d1', 'judge'),
  ]);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(warns, [{ discussionId: 'd1', reason: 'anchor_still_present', source: 'discussion_judgment' }]);
});

test('a dropped focus agent declaration has no source field', async () => {
  const anchor = computeAnchor('a.ts', 'two');
  const { context, logger, warns } = setup([discussion('d1', { anchor })]);
  await runChecks({ findings: [], resolved: [decl('d1', 'agent')] }, context, changes, logger, undefined, async () => [
    decl('d1', 'judge'),
  ]);
  assert.deepEqual(warns, [{ discussionId: 'd1', reason: 'anchor_still_present' }]);
});

test('a judge declaration on a deleted file is accepted without a file read', async () => {
  const deleted = ChangeSet.from([
    { oldPath: 'a.ts', newPath: 'a.ts', hunks: '@@ -1,2 +0,0 @@\n-one\n-two', deleted: true },
  ]);
  const { context, logger, reads } = setup([discussion('d1')]);
  const result = await runChecks({ findings: [], resolved: [] }, context, deleted, logger, undefined, async () => [
    decl('d1', 'judge'),
  ]);
  assert.deepEqual(result.resolved, [decl('d1', 'judge')]);
  assert.deepEqual(reads, []);
});

test('judgeDiscussions gets the findings after betweenSteps and the declared IDs', async () => {
  const { context, logger } = setup([]);
  let seen: { findings: Finding[]; ids: string[] } | undefined;
  await runChecks(
    { findings: [finding, { ...finding, line: 2 }], resolved: [decl('d9', 'agent')] },
    context,
    changes,
    logger,
    async (findings) => findings.slice(0, 1),
    async (findings, ids) => {
      seen = { findings, ids: [...ids] };
      return [];
    },
  );
  assert.equal(seen?.findings.length, 1);
  assert.equal(seen?.findings[0]?.line, 1);
  assert.deepEqual(seen?.ids, ['d9']);
});
