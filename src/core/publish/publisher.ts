import { silentLogger, type Logger } from '../../logger.ts';
import { errorMessage } from '../errorMessage.ts';
import type { DiscussionGateway } from '../ports.ts';
import type { Finding, ResolvedDiscussion, UnreviewedFile } from '../types.ts';
import {
  discussionAnchor,
  isFromThisTool,
  unreviewedNoteOf,
  type HostDiscussion,
  type UnreviewedNote,
} from './discussion.ts';
import { MARKER, UNREVIEWED_MARKER } from './marker.ts';
import { builtinTemplates, fillTemplate, type CommentTemplates } from './template.ts';

export interface PublisherOptions {
  /** The text of a finding and of a resolved reply. Defaults to the built-in
   * templates, which give the text from before templates existed. */
  templates?: CommentTemplates;
  /** Injectable for tests; defaults to logging via `logger.error`. */
  onDiscussionError?: (finding: Finding, error: unknown) => void;
  /** Defaults to a silent logger. */
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
  byId: Map<string, HostDiscussion>;
  /** Anchors of open discussions that this tool started. */
  openOwnAnchors: Set<string>;
  /** For each anchor of a resolved discussion that this tool started, the ID
   * of the last such discussion in the host's list, which is the newest. */
  resolvedOwnByAnchor: Map<string, string>;
  /** The last general comment from this tool that lists unreviewed files. */
  unreviewedNote: UnreviewedNote | null;
}

export class Publisher {
  private readonly logger: Logger;
  private readonly templates: CommentTemplates;

  constructor(
    private readonly gateway: DiscussionGateway,
    private readonly options: PublisherOptions = {},
  ) {
    this.logger = options.logger ?? silentLogger();
    this.templates = options.templates ?? builtinTemplates();
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
    await this.publishUnreviewedNote(unreviewedFiles, existing === null ? null : existing.unreviewedNote);
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
    if (discussion.resolved) return;

    try {
      await this.gateway.reply(
        discussionId,
        `${MARKER}\n${fillTemplate(this.templates.resolved, { reason: declaration.reason })}`,
      );
    } catch (error) {
      this.logger.warn(
        { discussionId, error: errorMessage(error) },
        'could not reply to a discussion declared fixed; it stays open',
      );
      return;
    }

    try {
      await this.gateway.setResolved(discussionId, true);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: errorMessage(error) },
        'replied to a discussion declared fixed but could not resolve it',
      );
    }
  }

  private async loadExistingDiscussions(): Promise<ExistingDiscussions | null> {
    let discussions: HostDiscussion[];
    try {
      discussions = await this.gateway.list();
    } catch (error) {
      this.logger.warn(
        { error: errorMessage(error) },
        'could not read existing discussions; posting every finding as a new discussion',
      );
      return null;
    }

    const openOwnAnchors = new Set<string>();
    const resolvedOwnByAnchor = new Map<string, string>();
    let unreviewedNote: ExistingDiscussions['unreviewedNote'] = null;
    for (const discussion of discussions) {
      const note = unreviewedNoteOf(discussion);
      if (note !== null) {
        unreviewedNote = note; // the last one wins
        continue;
      }
      if (!isFromThisTool(discussion)) continue;
      const anchor = discussionAnchor(discussion);
      if (anchor === null) continue;
      // A later discussion in the list replaces an earlier one: the newest wins.
      if (discussion.resolved) resolvedOwnByAnchor.set(anchor, discussion.id);
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
    const first = findings[0]!;
    try {
      await this.gateway.createDiscussion(
        { file: first.file, line: first.line },
        formatDiscussionBody(findings, this.templates.finding),
      );
    } catch (error) {
      for (const finding of findings) this.reportFailure(finding, error, 'failed to post discussion');
    }
  }

  /** The agent still reports a problem that a resolved discussion covers, so
   * one reply with the group's findings goes into that thread, and the thread
   * is reopened once to make it visible again. If reopening fails (for
   * example, the token's role cannot resolve discussions), the reply stays. */
  private async replyAndReopen(findings: Finding[], discussionId: string): Promise<void> {
    try {
      await this.gateway.reply(discussionId, formatDiscussionBody(findings, this.templates.finding));
    } catch (error) {
      for (const finding of findings) this.reportFailure(finding, error, 'failed to reply to discussion');
      return;
    }

    try {
      await this.gateway.setResolved(discussionId, false);
    } catch (error) {
      this.logger.warn(
        { discussionId, error: errorMessage(error) },
        'replied to a resolved discussion but could not reopen it',
      );
    }
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
   * Generated files are not listed. `note` is the existing comment, or `null`
   * when there is none or the discussions could not be read; then the comment
   * is created when files are too large. A failure is logged at `warn`, and
   * the caller goes on. */
  private async publishUnreviewedNote(unreviewedFiles: UnreviewedFile[], note: UnreviewedNote | null): Promise<void> {
    const tooLarge = unreviewedFiles.filter((file) => file.reason === 'too_large').map((file) => file.path);
    if (tooLarge.length === 0 && note === null) return;

    const body = formatUnreviewedBody(tooLarge);
    if (note !== null && note.body === body) return;

    try {
      if (note === null) await this.gateway.createNote(body);
      else await this.gateway.updateNote(note.id, body);
    } catch (error) {
      this.logger.warn(
        { files: tooLarge, error: errorMessage(error) },
        'could not post the comment on files too large to review',
      );
    }
  }

  private reportFailure(finding: Finding, error: unknown, message: string): void {
    if (this.options.onDiscussionError) {
      this.options.onDiscussionError(finding, error);
    } else {
      this.logger.error({ file: finding.file, line: finding.line, error: errorMessage(error) }, message);
    }
  }
}

/** The publish rules for one finding (see `Publisher.publish`).
 * Without the existing discussions, every finding gets a new discussion. */
function decideTarget(finding: Finding, existing: ExistingDiscussions | null): FindingTarget {
  if (existing === null) return { kind: 'new' };
  if (finding.relatesTo !== undefined) {
    const related = existing.byId.get(finding.relatesTo);
    if (related === undefined) return { kind: 'new' };
    return related.resolved ? { kind: 'reply', discussionId: related.id } : { kind: 'skip' };
  }
  if (finding.anchor !== undefined) {
    if (existing.openOwnAnchors.has(finding.anchor)) return { kind: 'skip' };
    const resolvedId = existing.resolvedOwnByAnchor.get(finding.anchor);
    if (resolvedId !== undefined) return { kind: 'reply', discussionId: resolvedId };
  }
  return { kind: 'new' };
}

/** The marker line comes first so a later run can recognize this comment and
 * match its anchor (see `marker.ts`). The host does not render it. It carries
 * the first finding's anchor: the findings of a new discussion are all on one
 * line, so they share it. Then one paragraph follows for each finding, filled
 * from the finding template (`merge-findings-on-publish` design, Decision 3).
 * The marker and the blank-line join belong to the program: a template only
 * gives the text of one paragraph (`publish-output-templates` design,
 * Decision 4). */
function formatDiscussionBody(findings: Finding[], findingTemplate: string): string {
  const anchor = findings[0]?.anchor;
  const marker = anchor === undefined ? MARKER : `<!-- pi-code-review anchor=${anchor} -->`;
  const paragraphs = findings.map((finding) =>
    fillTemplate(findingTemplate, {
      severity: finding.severity,
      summary: finding.summary,
      file: finding.file,
      line: String(finding.line),
    }),
  );
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
