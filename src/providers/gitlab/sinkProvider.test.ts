import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../../core/types.ts';
import type { DiscussionPosition, GitLabDiscussion, MergeRequestWriter } from './client.ts';
import { GitLabSinkProvider, UNREVIEWED_MARKER } from './sinkProvider.ts';

class FakeWriter implements MergeRequestWriter {
  calls: { mergeRequestIid: string; body: string; position: DiscussionPosition }[] = [];
  replies: { discussionId: string; body: string }[] = [];
  resolvedChanges: { discussionId: string; resolved: boolean }[] = [];
  /** What `listDiscussions` returns, or an error it throws. */
  existing: GitLabDiscussion[] | Error = [];
  failReopen = false;
  failReply = false;

  constructor(private readonly failFor?: (position: DiscussionPosition) => boolean) {}

  async listDiscussions(): Promise<GitLabDiscussion[]> {
    if (this.existing instanceof Error) throw this.existing;
    return this.existing;
  }

  async addDiscussionNote(_mergeRequestIid: string, discussionId: string, body: string): Promise<void> {
    if (this.failReply) throw new Error('500 reply failed');
    this.replies.push({ discussionId, body });
  }

  async setDiscussionResolved(_mergeRequestIid: string, discussionId: string, resolved: boolean): Promise<void> {
    if (this.failReopen) throw new Error('403 Forbidden');
    this.resolvedChanges.push({ discussionId, resolved });
  }

  createdNotes: string[] = [];
  updatedNotes: { noteId: number; body: string }[] = [];
  failNote = false;

  async createNote(_mergeRequestIid: string, body: string): Promise<void> {
    if (this.failNote) throw new Error('500 note failed');
    this.createdNotes.push(body);
  }

  async updateNote(_mergeRequestIid: string, noteId: number, body: string): Promise<void> {
    if (this.failNote) throw new Error('500 note failed');
    this.updatedNotes.push({ noteId, body });
  }

  async createDiscussion(mergeRequestIid: string, body: string, position: DiscussionPosition): Promise<void> {
    this.calls.push({ mergeRequestIid, body, position });
    if (this.failFor?.(position)) {
      throw new Error('simulated GitLab API failure');
    }
  }
}

function findings(): Finding[] {
  return [
    { file: 'a.ts', line: 3, severity: 'important', summary: 'Bug A.' },
    { file: 'b.ts', line: 5, severity: 'nit', summary: 'Bug B.' },
  ];
}

test('publish posts one discussion per finding with the diff refs and the finding line', async () => {
  const writer = new FakeWriter();
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
  });

  await provider.publish(findings());

  assert.equal(writer.calls.length, 2);
  assert.deepEqual(writer.calls[0]!.position, {
    baseSha: 'base',
    startSha: 'start',
    headSha: 'head',
    oldPath: 'a.ts',
    newPath: 'a.ts',
    newLine: 3,
  });
  assert.match(writer.calls[0]!.body, /Bug A\./);
  assert.equal(writer.calls[0]!.body.startsWith('<!-- pi-code-review -->\n**['), true);
});

test('publish isolates a failed discussion: the other finding still posts', async () => {
  const writer = new FakeWriter((position) => position.newPath === 'a.ts');
  const errors: Finding[] = [];
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    onDiscussionError: (finding) => errors.push(finding),
  });

  await provider.publish(findings());

  assert.equal(writer.calls.length, 2); // both attempted
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.file, 'a.ts');
});

test('a failed discussion logs via the injected logger when no onDiscussionError override is given', async () => {
  const writer = new FakeWriter((position) => position.newPath === 'a.ts');
  const errorCalls: unknown[] = [];
  const fakeLogger = { error: (obj: unknown) => errorCalls.push(obj) } as unknown as import('../../logger.ts').Logger;
  const provider = new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: { baseSha: 'base', startSha: 'start', headSha: 'head' },
    logger: fakeLogger,
  });

  await provider.publish(findings());

  assert.equal(errorCalls.length, 1);
  assert.deepEqual(errorCalls[0], { file: 'a.ts', line: 3, error: 'simulated GitLab API failure' });
});

const REFS = { baseSha: 'base', startSha: 'start', headSha: 'head' };
const ANCHOR = '3f9a1c0b2d4e5f60';

function existingDiscussion(
  id: string,
  options: { own: boolean; resolved: boolean; anchor?: string; newLine?: number },
): GitLabDiscussion {
  const marker = options.own
    ? options.anchor
      ? `<!-- pi-code-review anchor=${options.anchor} -->\n`
      : '<!-- pi-code-review -->\n'
    : '';
  return {
    id,
    position: { newPath: 'a.ts', newLine: options.newLine ?? 3, headSha: 'old-head' },
    notes: [
      {
        id: 1,
        author: options.own ? 'bot' : 'alice',
        body: `${marker}**[important]** Bug A.`,
        system: false,
        resolvable: true,
        resolved: options.resolved,
      },
    ],
  };
}

function recordingLogger(): {
  logger: import('../../logger.ts').Logger;
  warnings: Record<string, unknown>[];
  infos: Record<string, unknown>[];
} {
  const warnings: Record<string, unknown>[] = [];
  const infos: Record<string, unknown>[] = [];
  const logger = {
    warn: (obj: Record<string, unknown>) => warnings.push(obj),
    info: (obj: Record<string, unknown>) => infos.push(obj),
    error: () => {},
  } as unknown as import('../../logger.ts').Logger;
  return { logger, warnings, infos };
}

const bugA: Finding = { file: 'a.ts', line: 3, severity: 'important', summary: 'Bug A.', anchor: ANCHOR };

test('publish writes the anchor into the marker', async () => {
  const writer = new FakeWriter();
  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.equal(writer.calls[0]!.body, `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug A.`);
});

test('publish posts nothing for a finding that relates to an open discussion, and logs the skip count', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: false, resolved: false })];
  const { logger, infos } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([
    { ...bugA, relatesTo: 'd1' },
  ]);

  assert.equal(writer.calls.length, 0);
  assert.equal(writer.replies.length, 0);
  assert.deepEqual(infos, [{ skipped: 1 }]);
});

test('publish replies to and reopens a resolved discussion that a finding relates to', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([
    { ...bugA, relatesTo: 'd1' },
  ]);

  assert.equal(writer.calls.length, 0);
  assert.deepEqual(writer.replies, [
    { discussionId: 'd1', body: `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug A.` },
  ]);
  assert.deepEqual(writer.resolvedChanges, [{ discussionId: 'd1', resolved: false }]);
});

test('publish keeps the reply and logs a warning when reopening fails', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true })];
  writer.failReopen = true;
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([
    { ...bugA, relatesTo: 'd1' },
  ]);

  assert.equal(writer.replies.length, 1);
  assert.deepEqual(warnings, [{ discussionId: 'd1', error: '403 Forbidden' }]);
});

test('publish creates a new discussion when relatesTo names a discussion that no longer exists', async () => {
  const writer = new FakeWriter();
  writer.existing = [];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([
    { ...bugA, relatesTo: 'gone' },
  ]);

  assert.equal(writer.calls.length, 1);
});

test('publish skips a finding without relatesTo when an open discussion from this tool has the same anchor', async () => {
  const writer = new FakeWriter();
  // The old comment sits at line 10; the same code moved to line 3.
  writer.existing = [existingDiscussion('d1', { own: true, resolved: false, anchor: ANCHOR, newLine: 10 })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.equal(writer.calls.length, 0);
});

test('publish replies to and reopens a resolved discussion from this tool that has the same anchor', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true, anchor: ANCHOR })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.equal(writer.calls.length, 0);
  assert.deepEqual(writer.replies, [
    { discussionId: 'd1', body: `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug A.` },
  ]);
  assert.deepEqual(writer.resolvedChanges, [{ discussionId: 'd1', resolved: false }]);
});

test('publish skips a finding when both an open and a resolved discussion from this tool have the same anchor', async () => {
  const writer = new FakeWriter();
  writer.existing = [
    existingDiscussion('d1', { own: true, resolved: true, anchor: ANCHOR }),
    existingDiscussion('d2', { own: true, resolved: false, anchor: ANCHOR }),
  ];
  const { logger, infos } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([bugA]);

  assert.equal(writer.calls.length, 0);
  assert.equal(writer.replies.length, 0);
  assert.deepEqual(writer.resolvedChanges, []);
  assert.deepEqual(infos, [{ skipped: 1 }]);
});

test('publish replies in the last of two resolved discussions from this tool with the same anchor', async () => {
  const writer = new FakeWriter();
  writer.existing = [
    existingDiscussion('older', { own: true, resolved: true, anchor: ANCHOR }),
    existingDiscussion('newer', { own: true, resolved: true, anchor: ANCHOR }),
  ];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.deepEqual(
    writer.replies.map((reply) => reply.discussionId),
    ['newer'],
  );
  assert.deepEqual(writer.resolvedChanges, [{ discussionId: 'newer', resolved: false }]);
});

test("publish creates a new discussion when only a person's resolved discussion is on the same line", async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: false, resolved: true })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.equal(writer.calls.length, 1);
  assert.equal(writer.replies.length, 0);
});

test("publish creates a new discussion when a person's discussion is on the same line", async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: false, resolved: false })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA]);

  assert.equal(writer.calls.length, 1);
});

test('publish creates a discussion for every finding and logs a warning when the discussions cannot be read', async () => {
  const writer = new FakeWriter();
  writer.existing = new Error('500 Internal Server Error');
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([
    { ...bugA, relatesTo: 'd1' },
    { file: 'b.ts', line: 5, severity: 'nit', summary: 'Bug B.' },
  ]);

  assert.equal(writer.calls.length, 2);
  assert.deepEqual(warnings, [{ error: '500 Internal Server Error' }]);
});

const bugA2: Finding = { file: 'a.ts', line: 3, severity: 'nit', summary: 'Also a naming problem.', anchor: ANCHOR };

test('publish merges two findings on the same line into one discussion and logs the merge', async () => {
  const writer = new FakeWriter();
  const { logger, infos } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([bugA, bugA2]);

  assert.equal(writer.calls.length, 1);
  assert.equal(writer.calls[0]!.position.newLine, 3);
  assert.equal(
    writer.calls[0]!.body,
    `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug A.\n\n**[nit]** Also a naming problem.`,
  );
  assert.deepEqual(infos, [{ merged: 1 }]);
});

test('publish keeps findings file order inside a merged comment', async () => {
  const writer = new FakeWriter();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA2, bugA]);

  assert.match(
    writer.calls[0]!.body,
    /^<!-- [^\n]+ -->\n\*\*\[nit\]\*\* Also a naming problem\.\n\n\*\*\[important\]\*\* Bug A\.$/,
  );
});

test('publish posts two discussions for two lines with the same text', async () => {
  const writer = new FakeWriter();
  // Same file and the same anchor (the same line text), but different lines.
  const elsewhere: Finding = { ...bugA2, line: 9 };

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([bugA, elsewhere]);

  assert.deepEqual(
    writer.calls.map((call) => call.position.newLine),
    [3, 9],
  );
});

test('publish does not merge findings on the same line number in different files', async () => {
  const writer = new FakeWriter();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([
    { file: 'a.ts', line: 3, severity: 'nit', summary: 'A.' },
    { file: 'b.ts', line: 3, severity: 'nit', summary: 'B.' },
  ]);

  assert.equal(writer.calls.length, 2);
});

test('publish sends one reply and one reopen for two findings that reply to the same discussion', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true, anchor: ANCHOR })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([
    { ...bugA, relatesTo: 'd1' },
    // No relatesTo, but the same anchor: the same target.
    { file: 'a.ts', line: 7, severity: 'nit', summary: 'Second.', anchor: ANCHOR },
  ]);

  assert.equal(writer.calls.length, 0);
  assert.deepEqual(writer.replies, [
    {
      discussionId: 'd1',
      body: `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug A.\n\n**[nit]** Second.`,
    },
  ]);
  assert.deepEqual(writer.resolvedChanges, [{ discussionId: 'd1', resolved: false }]);
});

test('publish reports a failed merged discussion once for each finding in it', async () => {
  const writer = new FakeWriter(() => true);
  const errors: Finding[] = [];

  await new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: REFS,
    onDiscussionError: (finding) => errors.push(finding),
  }).publish([bugA, bugA2]);

  assert.equal(writer.calls.length, 1);
  assert.deepEqual(
    errors.map((finding) => finding.summary),
    ['Bug A.', 'Also a naming problem.'],
  );
});

test('publish reports a failed merged reply once for each finding, and does not reopen', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true, anchor: ANCHOR })];
  writer.failReply = true;
  const errors: Finding[] = [];

  await new GitLabSinkProvider({
    client: writer,
    mergeRequestIid: '5',
    diffRefs: REFS,
    onDiscussionError: (finding) => errors.push(finding),
  }).publish([bugA, bugA2]);

  assert.equal(errors.length, 2);
  assert.deepEqual(writer.resolvedChanges, []);
});

const declaration = { discussionId: 'd1', reason: 'The loop now uses i < n.' };

test('publish replies with the reason and then resolves an open discussion from this tool declared fixed', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: false, anchor: ANCHOR })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([], [declaration]);

  assert.deepEqual(writer.replies, [
    { discussionId: 'd1', body: '<!-- pi-code-review -->\nResolved: The loop now uses i < n.' },
  ]);
  assert.deepEqual(writer.resolvedChanges, [{ discussionId: 'd1', resolved: true }]);
});

test('publish makes no change when the declared discussion was resolved after the review', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: true, anchor: ANCHOR })];

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS }).publish([], [declaration]);

  assert.equal(writer.replies.length, 0);
  assert.equal(writer.resolvedChanges.length, 0);
});

test('publish logs a warning when the declared discussion no longer exists', async () => {
  const writer = new FakeWriter();
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish(
    [],
    [declaration],
  );

  assert.deepEqual(warnings, [{ discussionId: 'd1', reason: 'discussion_not_found' }]);
  assert.equal(writer.replies.length, 0);
});

test("publish never resolves a person's discussion, and logs a warning", async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: false, resolved: false })];
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish(
    [],
    [declaration],
  );

  assert.deepEqual(warnings, [{ discussionId: 'd1', reason: 'not_from_this_tool' }]);
  assert.equal(writer.replies.length, 0);
  assert.equal(writer.resolvedChanges.length, 0);
});

test('publish keeps the reply and logs a warning when the resolve request fails', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: false, anchor: ANCHOR })];
  writer.failReopen = true;
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish(
    [],
    [declaration],
  );

  assert.equal(writer.replies.length, 1);
  assert.deepEqual(warnings, [{ discussionId: 'd1', error: '403 Forbidden' }]);
});

test('publish does not resolve when the reply fails', async () => {
  const writer = new FakeWriter();
  writer.existing = [existingDiscussion('d1', { own: true, resolved: false, anchor: ANCHOR })];
  writer.failReply = true;
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish(
    [],
    [declaration],
  );

  assert.equal(writer.resolvedChanges.length, 0);
  assert.deepEqual(warnings, [{ discussionId: 'd1', error: '500 reply failed' }]);
});

test('publish resolves nothing when the discussions cannot be read', async () => {
  const writer = new FakeWriter();
  writer.existing = new Error('500 Internal Server Error');
  const { logger, warnings } = recordingLogger();

  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish(
    [],
    [declaration],
  );

  assert.equal(writer.replies.length, 0);
  assert.deepEqual(warnings.at(-1), { discussionId: 'd1', reason: 'discussions_unavailable' });
});

// --- Comment on files too large to review (`handle-omitted-diffs`) ---

const tooLarge = (path: string) => ({ path, reason: 'too_large' as const });

function unreviewedNoteDiscussion(id: string, noteId: number, body: string): GitLabDiscussion {
  return {
    id,
    position: null,
    notes: [{ id: noteId, author: 'bot', body, system: false, resolvable: false, resolved: false }],
  };
}

async function publishUnreviewed(writer: FakeWriter, files: { path: string; reason: 'too_large' | 'generated' }[]) {
  const { logger, warnings } = recordingLogger();
  await new GitLabSinkProvider({ client: writer, mergeRequestIid: '5', diffRefs: REFS, logger }).publish([], [], files);
  return warnings;
}

test('publish creates one comment that lists the files too large to review', async () => {
  const writer = new FakeWriter();

  await publishUnreviewed(writer, [
    tooLarge('big.js'),
    { path: 'yarn.lock', reason: 'generated' },
    tooLarge('huge.sql'),
  ]);

  assert.equal(writer.createdNotes.length, 1);
  const body = writer.createdNotes[0]!;
  assert.ok(body.startsWith(`${UNREVIEWED_MARKER}\n`));
  assert.match(body, /^- `big\.js`$/m);
  assert.match(body, /^- `huge\.sql`$/m);
  assert.doesNotMatch(body, /yarn\.lock/);
});

test('publish leaves the comment alone when its body is already the one it would write', async () => {
  const first = new FakeWriter();
  await publishUnreviewed(first, [tooLarge('big.js')]);
  const writer = new FakeWriter();
  writer.existing = [unreviewedNoteDiscussion('n1', 77, first.createdNotes[0]!)];

  await publishUnreviewed(writer, [tooLarge('big.js')]);

  assert.deepEqual(writer.createdNotes, []);
  assert.deepEqual(writer.updatedNotes, []);
});

test('publish updates the last such comment when the files too large change', async () => {
  const writer = new FakeWriter();
  writer.existing = [
    unreviewedNoteDiscussion('n1', 70, `${UNREVIEWED_MARKER}\nold`),
    unreviewedNoteDiscussion('n2', 71, `${UNREVIEWED_MARKER}\nolder edit`),
  ];

  await publishUnreviewed(writer, [tooLarge('other.js')]);

  assert.deepEqual(writer.createdNotes, []);
  assert.equal(writer.updatedNotes.length, 1);
  assert.equal(writer.updatedNotes[0]!.noteId, 71);
  assert.match(writer.updatedNotes[0]!.body, /`other\.js`/);
});

test('publish updates the comment to say every file was reviewed when no file is too large any more', async () => {
  const writer = new FakeWriter();
  writer.existing = [unreviewedNoteDiscussion('n1', 70, `${UNREVIEWED_MARKER}\n- \`big.js\``)];

  await publishUnreviewed(writer, []);

  assert.deepEqual(writer.updatedNotes, [
    { noteId: 70, body: `${UNREVIEWED_MARKER}\nEvery changed file was reviewed in the latest review.` },
  ]);
});

test('publish posts no comment when no file is too large and there is no comment yet', async () => {
  const writer = new FakeWriter();

  await publishUnreviewed(writer, [{ path: 'yarn.lock', reason: 'generated' }]);

  assert.deepEqual(writer.createdNotes, []);
  assert.deepEqual(writer.updatedNotes, []);
});

test('publish ignores a diff discussion or a comment without the marker', async () => {
  const writer = new FakeWriter();
  writer.existing = [
    unreviewedNoteDiscussion('person', 5, 'big.js was not reviewed, please check'),
    {
      ...unreviewedNoteDiscussion('diff', 6, `${UNREVIEWED_MARKER}\nx`),
      position: { newPath: 'a.ts', newLine: 1, headSha: 'h' },
    },
  ];

  await publishUnreviewed(writer, [tooLarge('big.js')]);

  assert.equal(writer.createdNotes.length, 1);
  assert.deepEqual(writer.updatedNotes, []);
});

test('publish creates the comment when the discussions cannot be read', async () => {
  const writer = new FakeWriter();
  writer.existing = new Error('500');

  await publishUnreviewed(writer, [tooLarge('big.js')]);

  assert.equal(writer.createdNotes.length, 1);
});

test('publish logs a warning and goes on when the comment request fails', async () => {
  const writer = new FakeWriter();
  writer.failNote = true;

  const warnings = await publishUnreviewed(writer, [tooLarge('big.js')]);

  assert.deepEqual(warnings, [{ files: ['big.js'], error: '500 note failed' }]);
});
