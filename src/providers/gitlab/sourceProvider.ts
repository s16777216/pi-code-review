import type { SourceProvider } from '../../core/ports.ts';
import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../../core/types.ts';
import { toReviewDiscussion } from '../../core/publish/discussion.ts';
import type { GitLabDiffRefs, MergeRequestProvider } from './client.ts';
import { toHostDiscussion } from './discussions.ts';
import { errorMessage } from '../../core/errorMessage.ts';

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
      ...(file.tooLarge
        ? { omitted: 'too_large' as const }
        : file.generatedFile
          ? { omitted: 'generated' as const }
          : {}),
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
          (raw) =>
            raw.map((d) => toReviewDiscussion(toHostDiscussion(d))).filter((d): d is ReviewDiscussion => d !== null),
          (error: unknown) => ({
            error: `Failed to list discussions: ${errorMessage(error)}`,
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
