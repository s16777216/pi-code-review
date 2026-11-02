import { silentLogger, type Logger } from '../../logger.ts';
import type { SinkProvider } from '../../core/review/providers.ts';
import type { Finding, ResolvedDiscussion } from '../../core/types.ts';
import type { GitLabDiffRefs, GitLabDiscussion, MergeRequestWriter } from './client.ts';
import { discussionAnchor, isDiscussionResolved, isFromThisTool } from './discussions.ts';
import { MARKER } from './marker.ts';

export interface GitLabSinkProviderOptions {
  client: MergeRequestWriter;
  mergeRequestIid: string;
  diffRefs: GitLabDiffRefs;
  /** Injectable for tests; defaults to logging via `logger.error`. */
  onDiscussionError?: (finding: Finding, error: unknown) => void;
  /** Defaults to a silent logger, so existing call sites and tests are unaffected. */
  logger?: Logger;
}

/** What `publish` did with one finding. */
type FindingOutcome = 'created' | 'skipped_open_discussion' | 'skipped_same_anchor' | 'replied_and_reopened' | 'failed';

/** The existing discussions, indexed for the publish rules. `null` when they
 * could not be read: every finding then gets a new discussion. */
interface ExistingDiscussions {
  byId: Map<string, GitLabDiscussion>;
  /** Anchors of open discussions that this tool started. */
  openOwnAnchors: Set<string>;
}

export class GitLabSinkProvider implements SinkProvider {
  private readonly logger: Logger;

  constructor(private readonly options: GitLabSinkProviderOptions) {
    this.logger = options.logger ?? silentLogger();
  }

  /** Publishes each finding by these rules (`publish-into-existing-discussions`
   * design, Decision 1):
   *
   * - `relatesTo` names a discussion that no longer exists → new discussion.
   * - `relatesTo` names an open discussion → nothing.
   * - `relatesTo` names a resolved discussion → reply, then reopen it.
   * - no `relatesTo`, and an open discussion from this tool has the same
   *   anchor → nothing.
   * - otherwise → new discussion.
   *
   * Then it resolves each discussion in `resolved` (see `resolveDiscussion`).
   *
   * Pass/fail is not decided here; every finding still counts for it. */
  async publish(findings: Finding[], resolved: ResolvedDiscussion[] = []): Promise<void> {
    const existing = await this.loadExistingDiscussions();
    const outcomes = await Promise.all(findings.map((finding) => this.publishFinding(finding, existing)));

    const skipped = outcomes.filter((outcome) => outcome.startsWith('skipped')).length;
    if (skipped > 0) {
      this.logger.info({ skipped }, 'skipped findings that existing discussions already cover');
    }

    await Promise.all(resolved.map((declaration) => this.resolveDiscussion(declaration, existing)));
  }

  /** The engine already checked the code. Here, only the facts that can change
   * between `review` and `publish` are checked again: the discussion still
   * exists, this tool started it, and it is still open. Then the reason goes
   * in as a reply, and the discussion is resolved. A discussion from a person
   * is never touched. If the discussions could not be read, nothing is
   * resolved: these facts cannot be checked. */
  private async resolveDiscussion(declaration: ResolvedDiscussion, existing: ExistingDiscussions | null): Promise<void> {
    const { client, mergeRequestIid } = this.options;
    const { discussionId } = declaration;
    const discussion = existing?.byId.get(discussionId);

    if (existing === null) {
      this.logger.warn({ discussionId, reason: 'discussions_unavailable' }, 'did not resolve a discussion');
      return;
    }
    if (discussion === undefined) {
      this.logger.warn({ discussionId, reason: 'discussion_not_found' }, 'did not resolve a discussion');
      return;
    }
    if (!isFromThisTool(discussion)) {
      this.logger.warn({ discussionId, reason: 'not_from_this_tool' }, 'did not resolve a discussion');
      return;
    }
    if (isDiscussionResolved(discussion)) return;

    try {
      await client.addDiscussionNote(mergeRequestIid, discussionId, `${MARKER}\nResolved: ${declaration.reason}`);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: error instanceof Error ? error.message : String(error) },
        'could not reply to a discussion declared fixed; it stays open',
      );
      return;
    }

    try {
      await client.setDiscussionResolved(mergeRequestIid, discussionId, true);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: error instanceof Error ? error.message : String(error) },
        'replied to a discussion declared fixed but could not resolve it',
      );
    }
  }

  private async loadExistingDiscussions(): Promise<ExistingDiscussions | null> {
    const { client, mergeRequestIid } = this.options;
    let discussions: GitLabDiscussion[];
    try {
      discussions = await client.listDiscussions(mergeRequestIid);
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'could not read existing discussions; posting every finding as a new discussion',
      );
      return null;
    }

    const openOwnAnchors = new Set<string>();
    for (const discussion of discussions) {
      if (!isFromThisTool(discussion) || isDiscussionResolved(discussion)) continue;
      const anchor = discussionAnchor(discussion);
      if (anchor !== null) openOwnAnchors.add(anchor);
    }
    return { byId: new Map(discussions.map((discussion) => [discussion.id, discussion])), openOwnAnchors };
  }

  private async publishFinding(finding: Finding, existing: ExistingDiscussions | null): Promise<FindingOutcome> {
    if (existing !== null) {
      if (finding.relatesTo !== undefined) {
        const related = existing.byId.get(finding.relatesTo);
        if (related !== undefined) {
          if (!isDiscussionResolved(related)) return 'skipped_open_discussion';
          return this.replyAndReopen(finding, related.id);
        }
      } else if (finding.anchor !== undefined && existing.openOwnAnchors.has(finding.anchor)) {
        return 'skipped_same_anchor';
      }
    }
    return this.createDiscussion(finding);
  }

  private async createDiscussion(finding: Finding): Promise<FindingOutcome> {
    const { client, mergeRequestIid, diffRefs } = this.options;
    try {
      await client.createDiscussion(mergeRequestIid, formatDiscussionBody(finding), {
        ...diffRefs,
        oldPath: finding.file,
        newPath: finding.file,
        newLine: finding.line,
      });
      return 'created';
    } catch (error) {
      this.reportFailure(finding, error, 'failed to post discussion');
      return 'failed';
    }
  }

  /** The agent read the resolved discussion and still reports the problem, so
   * the reply goes into that thread, and the thread is reopened to make it
   * visible again. If reopening fails (for example, the token's role cannot
   * resolve discussions), the reply stays. */
  private async replyAndReopen(finding: Finding, discussionId: string): Promise<FindingOutcome> {
    const { client, mergeRequestIid } = this.options;
    try {
      await client.addDiscussionNote(mergeRequestIid, discussionId, formatDiscussionBody(finding));
    } catch (error) {
      this.reportFailure(finding, error, 'failed to reply to discussion');
      return 'failed';
    }

    try {
      await client.setDiscussionResolved(mergeRequestIid, discussionId, false);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: error instanceof Error ? error.message : String(error) },
        'replied to a resolved discussion but could not reopen it',
      );
    }
    return 'replied_and_reopened';
  }

  private reportFailure(finding: Finding, error: unknown, message: string): void {
    if (this.options.onDiscussionError) {
      this.options.onDiscussionError(finding, error);
    } else {
      this.logger.error(
        { file: finding.file, line: finding.line, error: error instanceof Error ? error.message : String(error) },
        message,
      );
    }
  }
}

/** The marker line comes first so a later run can recognize this comment and
 * match its anchor (see `marker.ts`). GitLab does not render it. */
function formatDiscussionBody(finding: Finding): string {
  const marker = finding.anchor === undefined ? MARKER : `<!-- pi-code-review anchor=${finding.anchor} -->`;
  return `${marker}\n**[${finding.severity}]** ${finding.summary}`;
}
