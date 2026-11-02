import type { SourceProvider } from '../../core/review/providers.ts';
import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../../core/types.ts';
import type { GitLabDiffRefs, GitLabDiscussion, MergeRequestProvider } from './client.ts';
import { hasMarker, stripMarker } from './marker.ts';

export class GitLabSourceProvider implements SourceProvider {
  private lastDiffRefs?: GitLabDiffRefs;

  constructor(
    private readonly client: MergeRequestProvider,
    private readonly mergeRequestIid: string,
  ) {}

  async buildReviewContext(): Promise<ReviewContext> {
    const [metadata, diffFiles] = await Promise.all([
      this.client.getMergeRequest(this.mergeRequestIid),
      this.client.getMergeRequestDiff(this.mergeRequestIid),
    ]);

    this.lastDiffRefs = metadata.diffRefs;

    const changedFiles: ChangedFileDiff[] = diffFiles.map((file) => ({
      oldPath: file.oldPath,
      newPath: file.newPath,
      hunks: file.diffHunks,
    }));

    const headSha = metadata.diffRefs.headSha;
    const client = this.client;
    const mergeRequestIid = this.mergeRequestIid;
    let discussions: Promise<ReviewDiscussion[] | { error: string }> | undefined;

    return {
      title: metadata.title,
      description: metadata.description,
      changedFiles,
      async getFileContent(path: string) {
        const result = await client.getFileContent(path, headSha);
        return 'content' in result ? result.content : result;
      },
      listDiscussions() {
        // Fetched once per review: the agent's tool and the engine's
        // `relatesTo` check both read the same cached result.
        discussions ??= client.listDiscussions(mergeRequestIid).then(
          (raw) => raw.map(toReviewDiscussion).filter((d): d is ReviewDiscussion => d !== null),
          (error: unknown) => ({
            error: `Failed to list discussions: ${error instanceof Error ? error.message : String(error)}`,
          }),
        );
        return discussions;
      },
    };
  }

  /** The diff refs from the most recent `buildReviewContext()` call, needed
   * by `GitLabSinkProvider` to position inline comments. Throws if called
   * before `buildReviewContext()`. */
  getDiffRefs(): GitLabDiffRefs {
    if (!this.lastDiffRefs) {
      throw new Error('GitLabSourceProvider.getDiffRefs() called before buildReviewContext().');
    }
    return this.lastDiffRefs;
  }
}

/** Maps a GitLab discussion to the host-free `ReviewDiscussion`. System notes
 * ("added 1 commit", ...) describe events, not opinions, so they are left
 * out, and a discussion with only system notes is dropped. A discussion is
 * resolved when it has resolvable notes and all of them are resolved. */
function toReviewDiscussion(discussion: GitLabDiscussion): ReviewDiscussion | null {
  const notes = discussion.notes.filter((note) => !note.system);
  const first = notes[0];
  if (!first) return null;
  const resolvable = notes.filter((note) => note.resolvable);
  return {
    id: discussion.id,
    file: discussion.position?.newPath ?? null,
    line: discussion.position?.newLine ?? null,
    positionCommit: discussion.position?.headSha ?? null,
    resolved: resolvable.length > 0 && resolvable.every((note) => note.resolved),
    fromThisTool: hasMarker(first.body),
    notes: notes.map((note) => ({ author: note.author, body: stripMarker(note.body) })),
  };
}
