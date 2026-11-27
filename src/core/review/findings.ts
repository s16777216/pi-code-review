import type { Confidence, FailureCategory, Finding, ResolvedDiscussion, Severity, StoredVerdict } from '../types.ts';

/** A review failure. The `category` is what `review` writes to the findings
 * file, so `publish` can tell the failure without the text of the error. */
export class ReviewFailureError extends Error {
  readonly category: FailureCategory;

  constructor(message: string, category: FailureCategory = 'other') {
    super(message);
    this.category = category;
  }
}

const VALID_SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'pre_existing'];

/** Checks one finding's shape and returns it with only the known fields. Shared by
 * the engine (agent output) and `findingsFile.ts` (the file `publish` reads), so the
 * two can never disagree on what a valid finding is. Throws `ReviewFailureError`
 * naming the index and the bad field. */
export function validateFinding(item: unknown, index: number): Finding {
  if (typeof item !== 'object' || item === null) {
    throw new ReviewFailureError(`Finding at index ${index} is not an object.`);
  }
  const { file, line, endLine, severity, summary, relatesTo, anchor } = item as Record<string, unknown>;

  if (typeof file !== 'string' || file.length === 0) {
    throw new ReviewFailureError(`Finding at index ${index} is missing a "file" string.`);
  }
  if (typeof line !== 'number' || !Number.isInteger(line)) {
    throw new ReviewFailureError(`Finding at index ${index} is missing an integer "line".`);
  }
  if (endLine !== undefined && (typeof endLine !== 'number' || !Number.isInteger(endLine) || endLine < line)) {
    throw new ReviewFailureError(
      `Finding at index ${index} has an "endLine" that is not an integer equal to or greater than "line".`,
    );
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
  if (endLine !== undefined) finding.endLine = endLine;
  if (relatesTo !== undefined) finding.relatesTo = relatesTo;
  if (anchor !== undefined) finding.anchor = anchor;
  return finding;
}

const VALID_VERDICTS: readonly StoredVerdict[] = ['confirmed', 'uncertain', 'unverified'];
const VALID_CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

/** Checks a finding of the findings file: `validateFinding`, and the fields that only the engine
 * writes (`corroboration`, `verdict`, `confidence`). Agent output goes through `validateFinding`
 * and so can never set them. A file from an older `review` has none of them. The review focus is
 * never kept (`record-review-confidence` design, Decision 1). */
export function validateStoredFinding(item: unknown, index: number): Finding {
  const finding = validateFinding(item, index);
  const { corroboration, verdict, confidence } = item as Record<string, unknown>;
  if (corroboration !== undefined) {
    if (typeof corroboration !== 'number' || !Number.isInteger(corroboration) || corroboration < 1) {
      throw new ReviewFailureError(`Finding at index ${index} has a "corroboration" that is not a positive integer.`);
    }
    finding.corroboration = corroboration;
  }
  if (verdict !== undefined) {
    if (typeof verdict !== 'string' || !VALID_VERDICTS.includes(verdict as StoredVerdict)) {
      throw new ReviewFailureError(
        `Finding at index ${index} has an invalid "verdict": ${JSON.stringify(verdict)}. Must be one of ${VALID_VERDICTS.join(', ')}.`,
      );
    }
    finding.verdict = verdict as StoredVerdict;
  }
  if (confidence !== undefined) {
    if (typeof confidence !== 'string' || !VALID_CONFIDENCES.includes(confidence as Confidence)) {
      throw new ReviewFailureError(
        `Finding at index ${index} has an invalid "confidence": ${JSON.stringify(confidence)}. Must be one of ${VALID_CONFIDENCES.join(', ')}.`,
      );
    }
    finding.confidence = confidence as Confidence;
  }
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
}
