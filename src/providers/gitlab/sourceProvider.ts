import type { SourceProvider } from '../../core/review/providers.ts';
import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../../core/types.ts';
import type { GitLabDiffRefs, GitLabDiscussion, MergeRequestProvider } from './client.ts';
import { discussionAnchor, isDiscussionResolved, isFromThisTool, userNotes } from './discussions.ts';
import { stripMarker } from './marker.ts';

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
      ...(file.deletedFile ? { deleted: true } : {}),
      // `too_large` first: a file that is both has no diff at all.
      ...(file.tooLarge ? { omitted: 'too_large' as const } : file.generatedFile ? { omitted: 'generated' as const } : {}),
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
 * are left out, and a discussion with only system notes is dropped. */
function toReviewDiscussion(discussion: GitLabDiscussion): ReviewDiscussion | null {
  const notes = userNotes(discussion);
  if (notes.length === 0) return null;
  return {
    id: discussion.id,
    file: discussion.position?.newPath ?? null,
    line: discussion.position?.newLine ?? null,
    positionCommit: discussion.position?.headSha ?? null,
    resolved: isDiscussionResolved(discussion),
    fromThisTool: isFromThisTool(discussion),
    anchor: discussionAnchor(discussion),
    notes: notes.map((note) => ({ author: note.author, body: stripMarker(note.body) })),
  };
}
