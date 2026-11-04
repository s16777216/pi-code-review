import type { HostDiscussion } from '../../core/publish/discussion.ts';
import type { GitLabDiscussion } from './client.ts';

/** Maps a GitLab discussion to the host-neutral `HostDiscussion`. GitLab's
 * system notes ("added 1 commit", ...) describe events, not opinions, so they
 * are left out. The discussion is resolved when it has resolvable notes and
 * all of them are resolved; a general comment that cannot be resolved counts
 * as open. */
export function toHostDiscussion(discussion: GitLabDiscussion): HostDiscussion {
  const notes = discussion.notes.filter((note) => !note.system);
  const resolvable = notes.filter((note) => note.resolvable);
  return {
    id: discussion.id,
    position: discussion.position
      ? { file: discussion.position.newPath, line: discussion.position.newLine, commit: discussion.position.headSha }
      : null,
    resolved: resolvable.length > 0 && resolvable.every((note) => note.resolved),
    notes: notes.map((note) => ({ id: note.id, author: note.author, body: note.body })),
  };
}
