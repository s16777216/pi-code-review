import type { Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion, ReviewResult, UnreviewedFile } from '../types.ts';
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

/** The verify agent step: it gets the findings and the declarations of the
 * judge, and returns the final findings and the resolved discussions
 * (`add-verify-agent` design). */
export type DecideFinal = (
  findings: Finding[],
  declarations: ResolvedDiscussion[],
) => Promise<{ findings: Finding[]; resolved: ResolvedDiscussion[] }>;

/** The fixed checks, in their existing order, on one merged output:
 * the diff line check and the anchor, then the steps that use a model.
 * `betweenSteps` is an optional step on the checked findings: the
 * deduplication step runs there (`add-multi-agent-review` design, Decision 4).
 * `judgeDiscussions` is an optional step: it gets no argument and is the only
 * source of fixed declarations (`remove-agent-resolve-declaration` design,
 * Decision 3). It does not read the findings (`decouple-judge-from-findings`
 * design). The caller starts the step early and the function only returns its
 * promise, so the check waits here for the result
 * (`run-judge-with-review-agents` design). The verify agent decides the final
 * findings and the resolved discussions, and no rule of the code checks a
 * resolve (`remove-evidence-line` design, Decision 2). Without the verify
 * agent nothing is resolved: a judgment alone does not resolve. */
export async function runChecks(
  output: ParsedReviewOutput,
  changes: ChangeSet,
  logger: Logger,
  betweenSteps: (findings: Finding[]) => Promise<Finding[]> = async (findings) => findings,
  judgeDiscussions?: () => Promise<ResolvedDiscussion[]>,
  decideFinal?: DecideFinal,
): Promise<Omit<ReviewResult, 'unreviewedFiles' | 'warnings'>> {
  const checked = output.findings
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
  if (decideFinal === undefined) return { findings, resolved: [] };
  // The first declaration of a discussion ID wins.
  const decided = await decideFinal(
    findings,
    judged.filter((item, index) => judged.findIndex((other) => other.discussionId === item.discussionId) === index),
  );
  return { findings: decided.findings, resolved: decided.resolved };
}
