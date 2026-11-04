import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DiscussionPosition, GitLabDiscussion, MergeRequestWriter } from './client.ts';
import { GitLabMergeRequest } from './mergeRequest.ts';

const REFS = { baseSha: 'base', startSha: 'start', headSha: 'head' };

class FakeWriter implements MergeRequestWriter {
  log: unknown[][] = [];
  discussions: GitLabDiscussion[] = [];
  async listDiscussions(iid: string): Promise<GitLabDiscussion[]> {
    this.log.push(['list', iid]);
    return this.discussions;
  }
  async createDiscussion(iid: string, body: string, position: DiscussionPosition): Promise<void> {
    this.log.push(['createDiscussion', iid, body, position]);
  }
  async addDiscussionNote(iid: string, id: string, body: string): Promise<void> {
    this.log.push(['addDiscussionNote', iid, id, body]);
  }
  async setDiscussionResolved(iid: string, id: string, resolved: boolean): Promise<void> {
    this.log.push(['setDiscussionResolved', iid, id, resolved]);
  }
  async createNote(iid: string, body: string): Promise<void> {
    this.log.push(['createNote', iid, body]);
  }
  async updateNote(iid: string, noteId: number, body: string): Promise<void> {
    this.log.push(['updateNote', iid, noteId, body]);
  }
}

test('GitLabMergeRequest positions a new discussion with the diff refs and the new-file line', async () => {
  const writer = new FakeWriter();
  await new GitLabMergeRequest(writer, '5', REFS).createDiscussion({ file: 'a.ts', line: 3 }, 'Body.');

  assert.deepEqual(writer.log, [
    [
      'createDiscussion',
      '5',
      'Body.',
      { baseSha: 'base', startSha: 'start', headSha: 'head', oldPath: 'a.ts', newPath: 'a.ts', newLine: 3 },
    ],
  ]);
});

test('GitLabMergeRequest sends each gateway action to its merge request', async () => {
  const writer = new FakeWriter();
  const mr = new GitLabMergeRequest(writer, '5', REFS);

  await mr.reply('d1', 'R.');
  await mr.setResolved('d1', false);
  await mr.createNote('N.');
  await mr.updateNote(42, 'U.');

  assert.deepEqual(writer.log, [
    ['addDiscussionNote', '5', 'd1', 'R.'],
    ['setDiscussionResolved', '5', 'd1', false],
    ['createNote', '5', 'N.'],
    ['updateNote', '5', 42, 'U.'],
  ]);
});

test('GitLabMergeRequest lists the discussions as HostDiscussion', async () => {
  const writer = new FakeWriter();
  writer.discussions = [
    {
      id: 'd1',
      position: { newPath: 'a.ts', newLine: 1, headSha: 'h' },
      notes: [{ id: 3, author: 'bot', body: 'x', system: false, resolvable: true, resolved: true }],
    },
  ];

  assert.deepEqual(await new GitLabMergeRequest(writer, '5', REFS).list(), [
    {
      id: 'd1',
      position: { file: 'a.ts', line: 1, commit: 'h' },
      resolved: true,
      notes: [{ id: 3, author: 'bot', body: 'x' }],
    },
  ]);
});
