import { errorMessage } from '../../core/errorMessage.ts';
import type { ChangeRequest, DiscussionGateway } from '../../core/ports.ts';
import { toReviewDiscussion, type HostDiscussion } from '../../core/publish/discussion.ts';
import { ChangeSet } from '../../core/review/changedFile.ts';
import type { ChangedFileDiff, ReviewContext, ReviewDiscussion } from '../../core/types.ts';
import type { GitLabChangedFile, GitLabDiffRefs, MergeRequestProvider, MergeRequestWriter } from './client.ts';
import { toHostDiscussion } from './discussions.ts';

/** The GitLab API calls that one merge request needs. */
export type GitLabApi = MergeRequestProvider & MergeRequestWriter;

/** Maps GitLab's diff shape to the host-agnostic one `ChangeSet` and the
 * review engine consume. Shared by `load()` (for `review`) and `changeSet()`
 * (for `createDiscussion`'s old-line lookup, for `publish`). */
function toChangedFiles(diffFiles: readonly GitLabChangedFile[]): ChangedFileDiff[] {
  return diffFiles.map((file) => ({
    oldPath: file.oldPath,
    newPath: file.newPath,
    hunks: file.diffHunks,
    // `too_large` first: a file that is both has no diff at all.
    ...(file.deletedFile ? { deleted: true } : {}),
    ...(file.tooLarge
      ? { omitted: 'too_large' as const }
      : file.generatedFile
        ? { omitted: 'generated' as const }
        : {}),
  }));
}

/** One GitLab merge request (`introduce-code-host` design, Decision 2): the
 * read side for `review` (`load`), and the host's basic actions on its
 * discussions for `publish`. The publish rules that use those actions are in
 * `Publisher`. */
export class GitLabMergeRequest implements ChangeRequest<GitLabDiffRefs>, DiscussionGateway {
  /** The merge request's diff, parsed into a `ChangeSet`, fetched once and
   * cached: `load()` fills it eagerly (`review` already needs the diff);
   * `createDiscussion()` fills it lazily on its first call (`publish` has
   * only the findings file's diff refs, not the diff itself). Used to find a
   * position's old-file line, since GitLab needs it for a comment on a
   * context line. */
  private changes?: Promise<ChangeSet>;

  constructor(
    private readonly client: GitLabApi,
    private readonly mergeRequestIid: string,
    /** Needed to position a new discussion: from the findings file for
     * `publish`, or from `load()` for `review`. */
    private diffRefs?: GitLabDiffRefs,
  ) {}

  async load(): Promise<{ context: ReviewContext; snapshot: GitLabDiffRefs }> {
    const { client, mergeRequestIid } = this;
    const [metadata, diffFiles] = await Promise.all([
      client.getMergeRequest(mergeRequestIid),
      client.getMergeRequestDiff(mergeRequestIid),
    ]);
    this.diffRefs = metadata.diffRefs;

    const changedFiles: ChangedFileDiff[] = toChangedFiles(diffFiles);
    this.changes = Promise.resolve(ChangeSet.from(changedFiles));

    const headSha = metadata.diffRefs.headSha;
    let discussions: Promise<ReviewDiscussion[] | { error: string }> | undefined;

    const context: ReviewContext = {
      title: metadata.title,
      description: metadata.description,
      changedFiles,
      async getFileContent(path: string) {
        const result = await client.getFileContent(path, headSha);
        return 'content' in result ? result.content : result;
      },
      listDiscussions: () => {
        // Fetched once per review: the agent's tool and the engine's
        // `relatesTo` check both read the same cached result.
        discussions ??= this.list().then(
          (all) => all.map(toReviewDiscussion).filter((d): d is ReviewDiscussion => d !== null),
          (error: unknown) => ({
            error: `Failed to list discussions: ${errorMessage(error)}`,
          }),
        );
        return discussions;
      },
    };
    return { context, snapshot: metadata.diffRefs };
  }

  async list(): Promise<HostDiscussion[]> {
    return (await this.client.listDiscussions(this.mergeRequestIid)).map(toHostDiscussion);
  }

  async createDiscussion(position: { file: string; line: number }, body: string): Promise<void> {
    if (this.diffRefs === undefined) {
      throw new Error(
        'GitLabMergeRequest.createDiscussion() needs the diff refs: restore it from a snapshot, or load() it first.',
      );
    }
    this.changes ??= this.client
      .getMergeRequestDiff(this.mergeRequestIid)
      .then((diffFiles) => ChangeSet.from(toChangedFiles(diffFiles)));
    const oldLine = (await this.changes).oldLineFor(position.file, position.line);

    await this.client.createDiscussion(this.mergeRequestIid, body, {
      ...this.diffRefs,
      oldPath: position.file,
      newPath: position.file,
      newLine: position.line,
      oldLine,
    });
  }

  async reply(discussionId: string, body: string): Promise<void> {
    await this.client.addDiscussionNote(this.mergeRequestIid, discussionId, body);
  }

  async setResolved(discussionId: string, resolved: boolean): Promise<void> {
    await this.client.setDiscussionResolved(this.mergeRequestIid, discussionId, resolved);
  }

  async createNote(body: string): Promise<void> {
    await this.client.createNote(this.mergeRequestIid, body);
  }

  async updateNote(noteId: number, body: string): Promise<void> {
    await this.client.updateNote(this.mergeRequestIid, noteId, body);
  }
}
