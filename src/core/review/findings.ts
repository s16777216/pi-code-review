import type { Finding, ResolvedDiscussion, Severity } from '../types.ts';

export class ReviewFailureError extends Error {}

const VALID_SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'pre_existing'];

/** Checks one finding's shape and returns it with only the known fields. Shared by
 * the engine (agent output) and `findingsFile.ts` (the file `publish` reads), so the
 * two can never disagree on what a valid finding is. Throws `ReviewFailureError`
 * naming the index and the bad field. */
export function validateFinding(item: unknown, index: number): Finding {
  if (typeof item !== 'object' || item === null) {
    throw new ReviewFailureError(`Finding at index ${index} is not an object.`);
  }
  const { file, line, severity, summary, relatesTo, anchor } = item as Record<string, unknown>;

  if (typeof file !== 'string' || file.length === 0) {
    throw new ReviewFailureError(`Finding at index ${index} is missing a "file" string.`);
  }
  if (typeof line !== 'number' || !Number.isInteger(line)) {
    throw new ReviewFailureError(`Finding at index ${index} is missing an integer "line".`);
  }
  if (typeof severity !== 'string' || !VALID_SEVERITIES.includes(severity as Severity)) {
    throw new ReviewFailureError(
      `Finding at index ${index} has an invalid "severity": ${JSON.stringify(severity)}. Must be one of ${VALID_SEVERITIES.join(', ')}.`,
    );
  }
  if (typeof summary !== 'string' || summary.length === 0) {
    throw new ReviewFailureError(`Finding at index ${index} is missing a "summary" string.`);
  }

  if (relatesTo !== undefined && (typeof relatesTo !== 'string' || relatesTo.length === 0)) {
    throw new ReviewFailureError(`Finding at index ${index} has a "relatesTo" that is not a non-empty string.`);
  }

  if (anchor !== undefined && (typeof anchor !== 'string' || !/^[0-9a-f]{16}$/.test(anchor))) {
    throw new ReviewFailureError(`Finding at index ${index} has an "anchor" that is not 16 hexadecimal characters.`);
  }

  const finding: Finding = { file, line, severity: severity as Severity, summary };
  if (relatesTo !== undefined) finding.relatesTo = relatesTo;
  if (anchor !== undefined) finding.anchor = anchor;
  return finding;
}

/** Checks one fixed declaration's shape. Shared by the engine (agent output)
 * and `findingsFile.ts`. Throws `ReviewFailureError` naming the index and the
 * bad field. */
export function validateResolvedDiscussion(item: unknown, index: number): ResolvedDiscussion {
  if (typeof item !== 'object' || item === null) {
    throw new ReviewFailureError(`Fixed declaration at index ${index} is not an object.`);
  }
  const { discussionId, reason } = item as Record<string, unknown>;
  if (typeof discussionId !== 'string' || discussionId.length === 0) {
    throw new ReviewFailureError(`Fixed declaration at index ${index} is missing a "discussionId" string.`);
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ReviewFailureError(`Fixed declaration at index ${index} is missing a "reason" string.`);
  }
  return { discussionId, reason };
}

/** What the agent's `submit_review` call parses into, before the engine's checks. */
export interface ParsedReviewOutput {
  findings: Finding[];
  resolved: ResolvedDiscussion[];
}
