import type { Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion, ReviewContext, ReviewResult, UnreviewedFile } from '../types.ts';
import { computeAnchor } from './anchor.ts';
import type { ChangeSet } from './changedFile.ts';
import { compareCodePoints } from './diff.ts';
import type { ParsedReviewOutput } from './findings.ts';

// The fixed checks that run after the agent runs, in code, not in the model.
// Nothing here names GitLab.

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
 * `relatesTo`, the diff line check, the anchor, and the fixed declarations.
 * `betweenSteps` is an optional step on the checked findings, before the check
 * on the fixed declarations: the deduplication step runs there
 * (`add-multi-agent-review` design, Decision 4). `judgeDiscussions` is an
 * optional step after it: it gets no argument and is the only source of
 * fixed declarations (`remove-agent-resolve-declaration` design, Decision 3).
 * It does not read the findings (`decouple-judge-from-findings` design). */
/** A declaration from the discussion judgment step. `evidence` is the line of
 * the current file that the judge gave for a `fixed` judgment
 * (`judge-evidence-line` design, Decision 5). It never reaches the result. */
export type JudgedDeclaration = ResolvedDiscussion & { evidence?: string };

/** The verify agent step: it gets the findings and the declarations of the
 * judge, and returns the final findings and the resolved discussions
 * (`add-verify-agent` design). */
export type DecideFinal = (
  findings: Finding[],
  declarations: JudgedDeclaration[],
) => Promise<{ findings: Finding[]; resolved: ResolvedDiscussion[] }>;

export async function runChecks(
  output: ParsedReviewOutput,
  context: ReviewContext,
  changes: ChangeSet,
  logger: Logger,
  betweenSteps: (findings: Finding[]) => Promise<Finding[]> = async (findings) => findings,
  judgeDiscussions?: () => Promise<JudgedDeclaration[]>,
  decideFinal?: DecideFinal,
): Promise<Omit<ReviewResult, 'unreviewedFiles' | 'warnings'>> {
  const checked = (await checkRelatesTo(output.findings, context, logger))
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
  const findings = await betweenSteps(checked);
  if (judgeDiscussions === undefined) return { findings, resolved: [] };
  const judged = await judgeDiscussions();
  // The evidence line of each declaration. A key with no value is a
  // declaration with no evidence line. The first declaration of an ID wins.
  const evidenceById = new Map<string, string | undefined>();
  const declarations: ResolvedDiscussion[] = [];
  for (const { evidence, ...declaration } of judged) {
    if (evidenceById.has(declaration.discussionId)) continue;
    evidenceById.set(declaration.discussionId, evidence);
    declarations.push(declaration);
  }
  if (decideFinal === undefined) {
    const resolved = await checkResolved(declarations, findings, context, changes, logger, evidenceById);
    return { findings, resolved };
  }
  // The verify agent decides. The code check runs for the log only: it writes
  // a `warn` line for each resolved discussion that it would reject
  // (`add-verify-agent` design, Decision 7).
  const decided = await decideFinal(
    findings,
    judged.filter((item, index) => judged.findIndex((other) => other.discussionId === item.discussionId) === index),
  );
  await checkResolved(decided.resolved, decided.findings, context, changes, logger, evidenceById, {
    comparison: 'verify_agent_resolved',
  });
  return { findings: decided.findings, resolved: decided.resolved };
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
  | 'anchor_still_present'
  | 'evidence_not_valid';

/** The shortest evidence line that counts, in characters of the normalized text. A
 * line such as `}` is in almost every file and proves nothing. */
const MIN_EVIDENCE_LENGTH = 8;

/** Why an evidence line is not valid. The first failing rule is the answer. The
 * `warn` line of a drop has it, so that a log shows which rule drops most. */
type EvidenceProblem = 'multiple_lines' | 'too_short' | 'is_anchored_line' | 'not_in_file';

/** The form in which an evidence line and a file line are compared: trimmed,
 * one space for each run of white space, and no `;` or `,` at the end. A model
 * often drops the last `;` or `,` of a line (`judge-evidence-line` design,
 * Decision 3). */
function normalizeLine(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[;,]+$/, '');
}

function evidenceProblem(file: string, evidence: string, anchor: string, lines: string[]): EvidenceProblem | null {
  if (evidence.includes('\n')) return 'multiple_lines';
  const wanted = normalizeLine(evidence);
  if (wanted.length < MIN_EVIDENCE_LENGTH) return 'too_short';
  const matches = lines.filter((line) => normalizeLine(line) === wanted);
  if (matches.length === 0) return 'not_in_file';
  // A match that is only the anchored line is the problem and not the fix.
  if (matches.every((line) => computeAnchor(file, line) === anchor)) return 'is_anchored_line';
  return null;
}

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
  judged: ReadonlyMap<string, string | undefined>,
  extraWarnFields: Record<string, unknown> = {},
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

  const evidenceProblems = new Map<string, EvidenceProblem>();
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
    const lines = content.split('\n');
    if (!lines.some((line) => computeAnchor(file, line) === anchor)) return null;

    // The anchored line is still there. Only a judge declaration with a valid
    // evidence line passes (`judge-evidence-line` design, Decisions 2 and 3).
    const evidence = judged.get(discussion.id)?.trim();
    if (evidence === undefined || evidence === '') return 'anchor_still_present';
    const problem = evidenceProblem(file, evidence, anchor, lines);
    if (problem !== null) {
      evidenceProblems.set(discussion.id, problem);
      return 'evidence_not_valid';
    }
    logger.info({ discussionId: discussion.id, file, evidence }, 'accepted a fixed declaration by its evidence line');
    return null;
  };

  const accepted: ResolvedDiscussion[] = [];
  for (const declaration of declarations) {
    const rejection = await check(declaration);
    if (rejection === null) {
      accepted.push(declaration);
    } else {
      logger.warn(
        {
          discussionId: declaration.discussionId,
          reason: rejection,
          ...(rejection === 'evidence_not_valid'
            ? {
                evidence: judged.get(declaration.discussionId),
                problem: evidenceProblems.get(declaration.discussionId),
              }
            : {}),
          ...(judged.has(declaration.discussionId) ? { source: 'discussion_judgment' } : {}),
          ...extraWarnFields,
        },
        'did not accept a fixed declaration',
      );
    }
  }
  return accepted;
}
