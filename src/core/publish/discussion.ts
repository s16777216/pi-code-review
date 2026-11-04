import type { ReviewDiscussion } from '../types.ts';
import { hasMarker, stripMarker, UNREVIEWED_MARKER } from './marker.ts';

/** One discussion on a change request, in a shape that does not depend on the
 * host. The host's adapter builds it: it leaves out notes that describe
 * events instead of opinions (GitLab's system notes), and decides
 * `resolved` by the host's own rule (`introduce-code-host` design, Decision 4). */
export interface HostDiscussion {
  id: string;
  /** `null` for a general comment. */
  position: { file: string | null; line: number | null; commit: string | null } | null;
  /** True when the host reports the discussion as resolved. A general comment
   * that cannot be resolved is not resolved. */
  resolved: boolean;
  /** The notes that a person or this tool wrote, oldest first. */
  notes: HostDiscussionNote[];
}

export interface HostDiscussionNote {
  id: number;
  author: string;
  body: string;
}

const ANCHOR_IN_MARKER = /^<!-- pi-code-review anchor=([0-9a-f]{16}) -->/;

/** True when this tool started the discussion: its first note has the marker. */
export function isFromThisTool(discussion: HostDiscussion): boolean {
  const first = discussion.notes[0];
  return first !== undefined && hasMarker(first.body);
}

/** The anchor in the marker of the discussion's first note, or `null`. */
export function discussionAnchor(discussion: HostDiscussion): string | null {
  const first = discussion.notes[0];
  return first ? (ANCHOR_IN_MARKER.exec(first.body)?.[1] ?? null) : null;
}

/** This tool's general comment on files too large to review. */
export interface UnreviewedNote {
  id: number;
  body: string;
}

/** The comment on files too large to review, when `discussion` is one: a
 * discussion with no position whose first note starts with the marker. */
export function unreviewedNoteOf(discussion: HostDiscussion): UnreviewedNote | null {
  const first = discussion.notes[0];
  if (discussion.position !== null || first === undefined || !first.body.startsWith(UNREVIEWED_MARKER)) return null;
  return { id: first.id, body: first.body };
}

/** The discussion as the review agent sees it: the marker is stripped from
 * each note, and a discussion with no note is left out (`null`). */
export function toReviewDiscussion(discussion: HostDiscussion): ReviewDiscussion | null {
  if (discussion.notes.length === 0) return null;
  return {
    id: discussion.id,
    file: discussion.position?.file ?? null,
    line: discussion.position?.line ?? null,
    positionCommit: discussion.position?.commit ?? null,
    resolved: discussion.resolved,
    fromThisTool: isFromThisTool(discussion),
    anchor: discussionAnchor(discussion),
    notes: discussion.notes.map((note) => ({ author: note.author, body: stripMarker(note.body) })),
  };
}
