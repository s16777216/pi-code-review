import { silentLogger, type Logger } from '../../logger.ts';
import type { Finding, ResolvedDiscussion, Severity } from '../types.ts';

export class ReviewFailureError extends Error {}

const VALID_SEVERITIES: readonly Severity[] = ['important', 'nit', 'pre_existing'];

function extractJsonText(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

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

/** What the agent's final output parses into, before the engine's checks. */
export interface ParsedReviewOutput {
  findings: Finding[];
  resolved: ResolvedDiscussion[];
}

/** Parses the agent's final output text (optionally wrapped in a ```json
 * fenced code block). Accepts `{ "findings": [...], "resolved": [...] }`, and
 * also a bare array, read as findings with no fixed declarations. Throws
 * `ReviewFailureError` when the text is not JSON, or is neither an array nor
 * an object with a `findings` array, instead of silently returning nothing.
 * Each invalid finding or declaration is dropped with one `warn` log line. */
export function parseReviewOutput(text: string, logger: Logger = silentLogger()): ParsedReviewOutput {
  const jsonText = extractJsonText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new ReviewFailureError(`Agent output is not valid JSON: ${(error as Error).message}`);
  }

  let rawFindings: unknown[];
  let rawResolved: unknown = [];
  if (Array.isArray(parsed)) {
    rawFindings = parsed;
  } else if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { findings?: unknown }).findings)) {
    rawFindings = (parsed as { findings: unknown[] }).findings;
    rawResolved = (parsed as { resolved?: unknown }).resolved ?? [];
  } else {
    throw new ReviewFailureError('Agent output is neither a JSON array of findings nor an object with a "findings" array.');
  }

  const findings: Finding[] = [];
  rawFindings.forEach((item, index) => {
    try {
      findings.push(validateFinding(withoutAgentAnchor(item), index));
    } catch (error) {
      if (!(error instanceof ReviewFailureError)) throw error;
      logger.warn({ index, reason: error.message }, 'dropped an invalid finding from the agent output');
    }
  });

  const resolved: ResolvedDiscussion[] = [];
  if (!Array.isArray(rawResolved)) {
    logger.warn({ reason: '"resolved" is not an array' }, 'ignored the fixed declarations in the agent output');
  } else {
    rawResolved.forEach((item, index) => {
      try {
        resolved.push(validateResolvedDiscussion(item, index));
      } catch (error) {
        if (!(error instanceof ReviewFailureError)) throw error;
        logger.warn({ index, reason: error.message }, 'dropped an invalid fixed declaration from the agent output');
      }
    });
  }

  return { findings, resolved };
}

/** The findings part of `parseReviewOutput`. */
export function parseFindings(text: string, logger: Logger = silentLogger()): Finding[] {
  return parseReviewOutput(text, logger).findings;
}

/** The engine computes `anchor` itself and replaces any value the agent wrote,
 * so a stray or malformed `anchor` in the agent's output must not make an
 * otherwise valid finding invalid. */
function withoutAgentAnchor(item: unknown): unknown {
  if (typeof item !== 'object' || item === null || !('anchor' in item)) return item;
  const { anchor: _ignored, ...rest } = item as Record<string, unknown>;
  return rest;
}
