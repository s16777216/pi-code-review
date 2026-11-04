import { silentLogger, type Logger } from '../../logger.ts';
import type { SinkProvider } from '../../core/review/providers.ts';
import type { Finding, ResolvedDiscussion, UnreviewedFile } from '../../core/types.ts';
import type { GitLabDiffRefs, GitLabDiscussion, MergeRequestWriter } from './client.ts';
import { discussionAnchor, isDiscussionResolved, isFromThisTool, userNotes } from './discussions.ts';
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

/** What `publish` does with one finding, decided before anything is posted
 * (`merge-findings-on-publish` design, Decision 2). */
type FindingTarget = { kind: 'skip' } | { kind: 'reply'; discussionId: string } | { kind: 'new' };

/** Findings with the same target: one new discussion at one file and line,
 * or one reply in one discussion. Findings keep their findings file order. */
interface FindingGroup {
  target: Exclude<FindingTarget, { kind: 'skip' }>;
  findings: Finding[];
}

/** The existing discussions, indexed for the publish rules. `null` when they
 * could not be read: every finding then gets a new discussion. */
interface ExistingDiscussions {
  byId: Map<string, GitLabDiscussion>;
  /** Anchors of open discussions that this tool started. */
  openOwnAnchors: Set<string>;
  /** For each anchor of a resolved discussion that this tool started, the ID
   * of the last such discussion in GitLab's list, which is the newest. */
  resolvedOwnByAnchor: Map<string, string>;
  /** The last general comment from this tool that lists unreviewed files. */
  unreviewedNote: { id: number; body: string } | null;
}

/** The marker of the general comment on files too large to review. It has
 * no `anchor=`, so the anchor match never uses this comment. */
export const UNREVIEWED_MARKER = '<!-- pi-code-review unreviewed -->';

export class GitLabSinkProvider implements SinkProvider {
  private readonly logger: Logger;

  constructor(private readonly options: GitLabSinkProviderOptions) {
    this.logger = options.logger ?? silentLogger();
  }

  /** Decides each finding's target by these rules (`publish-into-existing-
   * discussions` Decision 1, and `merge-findings-on-publish` Decision 1):
   *
   * - `relatesTo` names a discussion that no longer exists → new discussion.
   * - `relatesTo` names an open discussion → nothing.
   * - `relatesTo` names a resolved discussion → reply, then reopen it.
   * - no `relatesTo`, and an open discussion from this tool has the same
   *   anchor → nothing.
   * - no `relatesTo`, and only a resolved discussion from this tool has the
   *   same anchor → reply in it, then reopen it.
   * - otherwise → new discussion.
   *
   * Then it merges the findings with the same target into one comment
   * (Decision 2), posts the comments, and resolves each discussion in
   * `resolved` (see `resolveDiscussion`).
   *
   * Pass/fail is not decided here; every finding still counts for it. */
  async publish(
    findings: Finding[],
    resolved: ResolvedDiscussion[] = [],
    unreviewedFiles: UnreviewedFile[] = [],
  ): Promise<void> {
    const existing = await this.loadExistingDiscussions();

    const groups = new Map<string, FindingGroup>();
    let skipped = 0;
    for (const finding of findings) {
      const target = decideTarget(finding, existing);
      if (target.kind === 'skip') {
        skipped += 1;
        continue;
      }
      const key = target.kind === 'reply' ? `reply\n${target.discussionId}` : `new\n${finding.file}\n${finding.line}`;
      const group = groups.get(key);
      if (group) group.findings.push(finding);
      else groups.set(key, { target, findings: [finding] });
    }

    if (skipped > 0) {
      this.logger.info({ skipped }, 'skipped findings that existing discussions already cover');
    }
    const merged = [...groups.values()].reduce((sum, group) => sum + group.findings.length - 1, 0);
    if (merged > 0) {
      this.logger.info({ merged }, 'merged findings with the same line or discussion into one comment');
    }

    await Promise.all(
      [...groups.values()].map((group) =>
        group.target.kind === 'reply'
          ? this.replyAndReopen(group.findings, group.target.discussionId)
          : this.createDiscussion(group.findings),
      ),
    );

    await Promise.all(resolved.map((declaration) => this.resolveDiscussion(declaration, existing)));
    await this.publishUnreviewedNote(unreviewedFiles, existing);
  }

  /** Keeps one general comment from this tool that lists the files too large
   * to review (`handle-omitted-diffs` design, Decision 5):
   *
   * | Files too large | Existing comment | Action       |
   * |-----------------|------------------|--------------|
   * | some            | none             | create it    |
   * | some            | same body        | nothing      |
   * | some            | other body       | update it    |
   * | none            | none             | nothing      |
   * | none            | lists files      | update it to say every file was reviewed |
   *
   * Generated files are not listed. When the discussions could not be read,
   * the comment is created when files are too large. A failure is logged at
   * `warn`, and `publish` goes on. */
  private async publishUnreviewedNote(
    unreviewedFiles: UnreviewedFile[],
    existing: ExistingDiscussions | null,
  ): Promise<void> {
    const { client, mergeRequestIid } = this.options;
    const tooLarge = unreviewedFiles.filter((file) => file.reason === 'too_large').map((file) => file.path);
    const note = existing?.unreviewedNote ?? null;
    if (tooLarge.length === 0 && note === null) return;

    const body = formatUnreviewedBody(tooLarge);
    if (note !== null && note.body === body) return;

    try {
      if (note === null) await client.createNote(mergeRequestIid, body);
      else await client.updateNote(mergeRequestIid, note.id, body);
    } catch (error) {
      this.logger.warn(
        { files: tooLarge, error: error instanceof Error ? error.message : String(error) },
        'could not post the comment on files too large to review',
      );
    }
  }

  /** The engine already checked the code. Here, only the facts that can change
   * between `review` and `publish` are checked again: the discussion still
   * exists, this tool started it, and it is still open. Then the reason goes
   * in as a reply, and the discussion is resolved. A discussion from a person
   * is never touched. If the discussions could not be read, nothing is
   * resolved: these facts cannot be checked. */
  private async resolveDiscussion(
    declaration: ResolvedDiscussion,
    existing: ExistingDiscussions | null,
  ): Promise<void> {
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
    const resolvedOwnByAnchor = new Map<string, string>();
    let unreviewedNote: ExistingDiscussions['unreviewedNote'] = null;
    for (const discussion of discussions) {
      const first = userNotes(discussion)[0];
      if (discussion.position === null && first !== undefined && first.body.startsWith(UNREVIEWED_MARKER)) {
        unreviewedNote = { id: first.id, body: first.body }; // the last one wins
        continue;
      }
      if (!isFromThisTool(discussion)) continue;
      const anchor = discussionAnchor(discussion);
      if (anchor === null) continue;
      // A later discussion in the list replaces an earlier one: the newest wins.
      if (isDiscussionResolved(discussion)) resolvedOwnByAnchor.set(anchor, discussion.id);
      else openOwnAnchors.add(anchor);
    }
    return {
      byId: new Map(discussions.map((discussion) => [discussion.id, discussion])),
      openOwnAnchors,
      resolvedOwnByAnchor,
      unreviewedNote,
    };
  }

  /** One discussion for a group of findings on the same file and line. A
   * failure is reported once for each finding in the group. */
  private async createDiscussion(findings: Finding[]): Promise<void> {
    const { client, mergeRequestIid, diffRefs } = this.options;
    const first = findings[0]!;
    try {
      await client.createDiscussion(mergeRequestIid, formatDiscussionBody(findings), {
        ...diffRefs,
        oldPath: first.file,
        newPath: first.file,
        newLine: first.line,
      });
    } catch (error) {
      for (const finding of findings) this.reportFailure(finding, error, 'failed to post discussion');
    }
  }

  /** The agent still reports a problem that a resolved discussion covers, so
   * one reply with the group's findings goes into that thread, and the thread
   * is reopened once to make it visible again. If reopening fails (for
   * example, the token's role cannot resolve discussions), the reply stays. */
  private async replyAndReopen(findings: Finding[], discussionId: string): Promise<void> {
    const { client, mergeRequestIid } = this.options;
    try {
      await client.addDiscussionNote(mergeRequestIid, discussionId, formatDiscussionBody(findings));
    } catch (error) {
      for (const finding of findings) this.reportFailure(finding, error, 'failed to reply to discussion');
      return;
    }

    try {
      await client.setDiscussionResolved(mergeRequestIid, discussionId, false);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: error instanceof Error ? error.message : String(error) },
        'replied to a resolved discussion but could not reopen it',
      );
    }
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

/** The publish rules for one finding (see `GitLabSinkProvider.publish`).
 * Without the existing discussions, every finding gets a new discussion. */
function decideTarget(finding: Finding, existing: ExistingDiscussions | null): FindingTarget {
  if (existing === null) return { kind: 'new' };
  if (finding.relatesTo !== undefined) {
    const related = existing.byId.get(finding.relatesTo);
    if (related === undefined) return { kind: 'new' };
    return isDiscussionResolved(related) ? { kind: 'reply', discussionId: related.id } : { kind: 'skip' };
  }
  if (finding.anchor !== undefined) {
    if (existing.openOwnAnchors.has(finding.anchor)) return { kind: 'skip' };
    const resolvedId = existing.resolvedOwnByAnchor.get(finding.anchor);
    if (resolvedId !== undefined) return { kind: 'reply', discussionId: resolvedId };
  }
  return { kind: 'new' };
}

/** The marker line comes first so a later run can recognize this comment and
 * match its anchor (see `marker.ts`). GitLab does not render it. It carries
 * the first finding's anchor: the findings of a new discussion are all on one
 * line, so they share it. Then one `**[severity]** summary` paragraph follows
 * for each finding (`merge-findings-on-publish` design, Decision 3). */
function formatDiscussionBody(findings: Finding[]): string {
  const anchor = findings[0]?.anchor;
  const marker = anchor === undefined ? MARKER : `<!-- pi-code-review anchor=${anchor} -->`;
  const paragraphs = findings.map((finding) => `**[${finding.severity}]** ${finding.summary}`);
  return `${marker}\n${paragraphs.join('\n\n')}`;
}

/** The body of the comment on files too large to review, or, with no file,
 * the note that every changed file was reviewed. */
function formatUnreviewedBody(paths: string[]): string {
  if (paths.length === 0) {
    return `${UNREVIEWED_MARKER}\nEvery changed file was reviewed in the latest review.`;
  }
  const list = paths.map((path) => `- \`${path}\``).join('\n');
  const what = paths.length === 1 ? 'this file' : 'these files';
  return `${UNREVIEWED_MARKER}\n**Not reviewed:** GitLab did not return the diff of ${what}, because it is too large. Review the change by hand.\n\n${list}`;
}
