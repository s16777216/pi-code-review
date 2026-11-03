import type { GitLabDiscussion, GitLabDiscussionNote } from './client.ts';
import { hasMarker } from './marker.ts';

const ANCHOR_IN_MARKER = /^<!-- pi-code-review anchor=([0-9a-f]{16}) -->/;

/** The notes a person or this tool wrote: GitLab system notes ("added 1
 * commit", ...) describe events, not opinions. */
export function userNotes(discussion: GitLabDiscussion): GitLabDiscussionNote[] {
  return discussion.notes.filter((note) => !note.system);
}

/** Resolved when the discussion has resolvable notes and all of them are
 * resolved. A general comment that cannot be resolved counts as open. */
export function isDiscussionResolved(discussion: GitLabDiscussion): boolean {
  const resolvable = userNotes(discussion).filter((note) => note.resolvable);
  return resolvable.length > 0 && resolvable.every((note) => note.resolved);
}

/** True when this tool started the discussion: its first user note has the marker. */
export function isFromThisTool(discussion: GitLabDiscussion): boolean {
  const first = userNotes(discussion)[0];
  return first !== undefined && hasMarker(first.body);
}

/** The anchor in the marker of the discussion's first note, or `null`. */
export function discussionAnchor(discussion: GitLabDiscussion): string | null {
  const first = userNotes(discussion)[0];
  return first ? (ANCHOR_IN_MARKER.exec(first.body)?.[1] ?? null) : null;
}
