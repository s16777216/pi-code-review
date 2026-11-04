import type { DiscussionGateway } from '../../core/ports.ts';
import type { HostDiscussion } from '../../core/publish/discussion.ts';
import type { GitLabDiffRefs, MergeRequestWriter } from './client.ts';
import { toHostDiscussion } from './discussions.ts';

/** One GitLab merge request (`introduce-code-host` design, Decision 2). It
 * implements the host's basic actions on the merge request's discussions;
 * the publish rules that use them are in `Publisher`. */
export class GitLabMergeRequest implements DiscussionGateway {
  constructor(
    private readonly client: MergeRequestWriter,
    private readonly mergeRequestIid: string,
    /** Needed to position a new discussion. */
    private readonly diffRefs: GitLabDiffRefs,
  ) {}

  async list(): Promise<HostDiscussion[]> {
    return (await this.client.listDiscussions(this.mergeRequestIid)).map(toHostDiscussion);
  }

  async createDiscussion(position: { file: string; line: number }, body: string): Promise<void> {
    await this.client.createDiscussion(this.mergeRequestIid, body, {
      ...this.diffRefs,
      oldPath: position.file,
      newPath: position.file,
      newLine: position.line,
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
