import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discussionAnchor,
  isFromThisTool,
  toReviewDiscussion,
  unreviewedNoteOf,
  type HostDiscussion,
} from './discussion.ts';
import { hasMarker, stripMarker, UNREVIEWED_MARKER } from './marker.ts';

const ANCHOR = '3f9a1c0b2d4e5f60';

function discussion(overrides: Partial<HostDiscussion> = {}): HostDiscussion {
  return {
    id: 'd1',
    position: { file: 'a.ts', line: 3, commit: 'h1' },
    resolved: false,
    notes: [{ id: 1, author: 'bot', body: `<!-- pi-code-review anchor=${ANCHOR} -->\n**[important]** Bug.` }],
    ...overrides,
  };
}

test('hasMarker checks only the prefix, and stripMarker removes the marker line', () => {
  assert.equal(hasMarker('<!-- pi-code-review -->\nx'), true);
  assert.equal(hasMarker('<!-- pi-code-review anchor=abc future=1 -->\nx'), true);
  assert.equal(hasMarker('plain text'), false);
  assert.equal(stripMarker('<!-- pi-code-review -->\nBody.'), 'Body.');
  assert.equal(stripMarker('No marker.'), 'No marker.');
});

test('isFromThisTool and discussionAnchor read the first note', () => {
  assert.equal(isFromThisTool(discussion()), true);
  assert.equal(discussionAnchor(discussion()), ANCHOR);

  const person = discussion({ notes: [{ id: 2, author: 'alice', body: 'Looks off.' }] });
  assert.equal(isFromThisTool(person), false);
  assert.equal(discussionAnchor(person), null);

  const replyFromTool = discussion({
    notes: [
      { id: 2, author: 'alice', body: 'Question.' },
      { id: 3, author: 'bot', body: '<!-- pi-code-review -->\nAnswer.' },
    ],
  });
  assert.equal(isFromThisTool(replyFromTool), false);
});

test('unreviewedNoteOf finds only a general comment that starts with the unreviewed marker', () => {
  const general = discussion({ position: null, notes: [{ id: 9, author: 'bot', body: `${UNREVIEWED_MARKER}\n- x` }] });
  assert.deepEqual(unreviewedNoteOf(general), { id: 9, body: `${UNREVIEWED_MARKER}\n- x` });
  assert.equal(unreviewedNoteOf({ ...general, position: { file: 'a.ts', line: 1, commit: null } }), null);
  assert.equal(unreviewedNoteOf(discussion({ position: null })), null);
});

test('toReviewDiscussion strips the marker, and leaves out a discussion with no note', () => {
  assert.deepEqual(toReviewDiscussion(discussion({ resolved: true })), {
    id: 'd1',
    file: 'a.ts',
    line: 3,
    positionCommit: 'h1',
    resolved: true,
    fromThisTool: true,
    anchor: ANCHOR,
    notes: [{ author: 'bot', body: '**[important]** Bug.' }],
  });
  assert.equal(toReviewDiscussion(discussion({ notes: [] })), null);
  assert.deepEqual(toReviewDiscussion(discussion({ position: null }))?.file, null);
});
