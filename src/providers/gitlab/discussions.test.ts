import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GitLabDiscussion } from './client.ts';
import { toHostDiscussion } from './discussions.ts';

function note(overrides: Partial<GitLabDiscussion['notes'][number]> = {}): GitLabDiscussion['notes'][number] {
  return { id: 1, author: 'alice', body: 'x', system: false, resolvable: true, resolved: false, ...overrides };
}

test('toHostDiscussion maps the position and keeps the note ids', () => {
  const host = toHostDiscussion({
    id: 'd1',
    position: { newPath: 'a.ts', newLine: 12, headSha: 'h1' },
    notes: [note({ id: 7 })],
  });
  assert.deepEqual(host, {
    id: 'd1',
    position: { file: 'a.ts', line: 12, commit: 'h1' },
    resolved: false,
    notes: [{ id: 7, author: 'alice', body: 'x' }],
  });
});

test('toHostDiscussion leaves out system notes', () => {
  const host = toHostDiscussion({
    id: 'd1',
    position: null,
    notes: [note({ id: 1, system: true, body: 'added 1 commit' }), note({ id: 2, body: 'Real.' })],
  });
  assert.deepEqual(
    host.notes.map((n) => n.id),
    [2],
  );
});

test('toHostDiscussion is resolved only when every resolvable user note is resolved', () => {
  const position = { newPath: 'a.ts', newLine: 1, headSha: 'h' };
  assert.equal(
    toHostDiscussion({ id: 'a', position, notes: [note({ resolved: true }), note({ resolved: true })] }).resolved,
    true,
  );
  assert.equal(
    toHostDiscussion({ id: 'b', position, notes: [note({ resolved: true }), note({ resolved: false })] }).resolved,
    false,
  );
  // A system note does not count, even when it is resolvable.
  assert.equal(
    toHostDiscussion({ id: 'c', position, notes: [note({ resolved: true }), note({ system: true, resolved: false })] })
      .resolved,
    true,
  );
});

test('toHostDiscussion: a general comment that cannot be resolved is open', () => {
  const host = toHostDiscussion({ id: 'g', position: null, notes: [note({ resolvable: false })] });
  assert.equal(host.position, null);
  assert.equal(host.resolved, false);
});
