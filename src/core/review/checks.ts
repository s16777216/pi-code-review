import type { Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion, ReviewContext, ReviewResult, UnreviewedFile } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import type { ChangeSet } from './changedFile.ts';
import { compareCodePoints } from './diff.ts';
import type { ParsedReviewOutput } from './findings.ts';
import type { PromptBatch } from './prompt.ts';

// The fixed checks that run after the agent runs, in code, not in the model.
// Nothing here names GitLab.

/** Drops a finding that is on a line of the change's diff but not of this
 * batch's own items, with the reason `outside_batch` (Decision 5). A finding
 * that is not on the change's diff at all is left for the diff line check,
 * which logs its own reason. A file can have more than one item in a batch
 * (its parts), so a line is the batch's own when any item of that path has
 * it. */
export function keepOwnLines(findings: Finding[], batch: PromptBatch, changes: ChangeSet, logger: Logger): Finding[] {
  // A file can have more than one item in a batch (its parts).
  const ownItems = (path: string) => batch.items.filter((item) => item.file.newPath === path);

  return findings.filter((finding) => {
    if (changes.isOmitted(finding.file)) return true; // dropped by `runChecks` as `diff_omitted`
    if (changes.lineCheck(finding.file, finding.line) !== 'ok') return true;
    if (ownItems(finding.file).some((item) => item.file.hasNewLine(finding.line))) return true;
    logger.warn(
      { file: finding.file, line: finding.line, batch: batch.index, reason: 'outside_batch' },
      'discarded a finding that is outside its batch',
    );
    return false;
  });
}

/** Every omitted changed file, in path order, with one `warn` line for each
 * file that is too large. A generated file is expected, so it gets no `warn`
 * line (`handle-omitted-diffs` design, Decision 4). */
export function listUnreviewedFiles(changes: ChangeSet, logger: Logger): UnreviewedFile[] {
  const unreviewed = changes.files
    .flatMap((file) => (file.omitted === undefined ? [] : [{ path: file.path, reason: file.omitted }]))
    .sort((a, b) => compareCodePoints(a.path, b.path));
  for (const file of unreviewed) {
    if (file.reason === 'too_large') {
      logger.warn({ file: file.path, reason: file.reason }, 'did not review a changed file: its diff is too large');
    }
  }
  return unreviewed;
}

/** The fixed checks, in their existing order, on one merged output:
 * `relatesTo`, the diff line check, the anchor, and the fixed declarations. */
export async function runChecks(
  output: ParsedReviewOutput,
  context: ReviewContext,
  changes: ChangeSet,
  logger: Logger,
): Promise<Omit<ReviewResult, 'unreviewedFiles'>> {
  const findings = (await checkRelatesTo(output.findings, context, logger))
    .filter((finding) => {
      // The review did not show this file's diff, so it does not report on it
      // (`handle-omitted-diffs` design, Decision 3).
      const reason = changes.isOmitted(finding.file) ? 'diff_omitted' : changes.lineCheck(finding.file, finding.line);
      if (reason === 'ok') return true;
      logger.warn(
        { file: finding.file, line: finding.line, reason },
        'discarded a finding that cannot be placed on the diff',
      );
      return false;
    })
    .map((finding) => {
      // The diff check above guarantees the line is in the diff. Any anchor
      // the agent wrote is replaced: only the engine computes it.
      const lineText = changes.lineText(finding.file, finding.line) ?? '';
      return { ...finding, anchor: computeAnchor(finding.file, lineText) };
    });
  const resolved = await checkResolved(output.resolved, findings, context, changes, logger);
  return { findings, resolved };
}

/** Keeps a finding's `relatesTo` only when it names a discussion that
 * `listDiscussions` returned for this change. An unknown ID is removed with a
 * `warn` line, and the finding stays. When the discussions cannot be read,
 * every `relatesTo` is removed. `listDiscussions` is cached per review, so
 * this makes no extra API call when the agent already used the tool. */
async function checkRelatesTo(findings: Finding[], context: ReviewContext, logger: Logger): Promise<Finding[]> {
  if (!findings.some((finding) => finding.relatesTo !== undefined)) return findings;

  const discussions = await context.listDiscussions();
  const knownIds = Array.isArray(discussions) ? new Set(discussions.map((discussion) => discussion.id)) : null;

  return findings.map((finding) => {
    if (finding.relatesTo === undefined || knownIds?.has(finding.relatesTo)) return finding;
    logger.warn(
      {
        file: finding.file,
        line: finding.line,
        relatesTo: finding.relatesTo,
        reason: knownIds === null ? 'discussions_unavailable' : 'unknown_discussion',
      },
      'removed relatesTo from a finding',
    );
    const { relatesTo: _removed, ...rest } = finding;
    return rest;
  });
}

/** Why a fixed declaration was not accepted. The checks run in this order,
 * and the first failure is the reason. */
type ResolveRejection =
  | 'discussion_not_found'
  | 'not_from_this_tool'
  | 'already_resolved'
  | 'no_anchor'
  | 'linked_by_finding'
  | 'file_unreadable'
  | 'anchor_still_present';

/** Accepts a fixed declaration only when every check passes
 * (`resolve-fixed-discussions` design, Decision 2). The last check is on the
 * code, not the model: no line of the file's current content may still have
 * the discussion's anchor, so the exact code the comment pointed at must be
 * gone or changed. A file that the change deletes passes it without a read.
 * Each file is read at most once per review. */
async function checkResolved(
  declarations: ResolvedDiscussion[],
  findings: Finding[],
  context: ReviewContext,
  changes: ChangeSet,
  logger: Logger,
): Promise<ResolvedDiscussion[]> {
  if (declarations.length === 0) return [];

  const discussions = await context.listDiscussions();
  const byId = new Map(Array.isArray(discussions) ? discussions.map((d) => [d.id, d] as const) : []);
  const linked = new Set(findings.map((finding) => finding.relatesTo).filter((id) => id !== undefined));
  const fileContents = new Map<string, Promise<string | { error: string }>>();
  const readFile = (path: string) => {
    let content = fileContents.get(path);
    if (!content) {
      content = context.getFileContent(path);
      fileContents.set(path, content);
    }
    return content;
  };

  const check = async (declaration: ResolvedDiscussion): Promise<ResolveRejection | null> => {
    const discussion = byId.get(declaration.discussionId);
    if (!discussion) return 'discussion_not_found';
    if (!discussion.fromThisTool) return 'not_from_this_tool';
    if (discussion.resolved) return 'already_resolved';
    if (discussion.anchor === null || discussion.file === null) return 'no_anchor';
    if (linked.has(discussion.id)) return 'linked_by_finding';

    const file = discussion.file;
    if (changes.isDeleted(file)) return null;

    const content = await readFile(file);
    if (typeof content !== 'string') return 'file_unreadable';
    const anchor = discussion.anchor;
    if (content.split('\n').some((line) => computeAnchor(file, line) === anchor)) return 'anchor_still_present';
    return null;
  };

  const accepted: ResolvedDiscussion[] = [];
  for (const declaration of declarations) {
    const rejection = await check(declaration);
    if (rejection === null) {
      accepted.push(declaration);
    } else {
      logger.warn({ discussionId: declaration.discussionId, reason: rejection }, 'did not accept a fixed declaration');
    }
  }
  return accepted;
}
