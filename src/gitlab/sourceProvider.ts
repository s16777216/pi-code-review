import type { SourceProvider } from '../review/providers.ts';
import type { ChangedFileDiff, ReviewContext } from '../types.ts';
import type { GitLabDiffRefs, MergeRequestProvider } from './client.ts';

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

    return {
      title: metadata.title,
      description: metadata.description,
      changedFiles,
      async getFileContent(path: string) {
        const result = await client.getFileContent(path, headSha);
        return 'content' in result ? result.content : result;
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
