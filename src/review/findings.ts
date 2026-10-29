import type { Finding, Severity } from '../types.ts';

export class ReviewFailureError extends Error {}

const VALID_SEVERITIES: readonly Severity[] = ['important', 'nit', 'pre_existing'];

function extractJsonText(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1]! : text).trim();
}

function validateFinding(item: unknown, index: number): Finding {
  if (typeof item !== 'object' || item === null) {
    throw new ReviewFailureError(`Finding at index ${index} is not an object.`);
  }
  const { file, line, severity, summary } = item as Record<string, unknown>;

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

  return { file, line, severity: severity as Severity, summary };
}

/** Parses the agent's final output text into `Finding[]`. Expects a JSON
 * array (optionally wrapped in a ```json fenced code block). Throws
 * `ReviewFailureError` for anything else, instead of silently returning no
 * findings. */
export function parseFindings(text: string): Finding[] {
  const jsonText = extractJsonText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new ReviewFailureError(`Agent output is not valid JSON: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new ReviewFailureError('Agent output is not a JSON array of findings.');
  }

  return parsed.map((item, index) => validateFinding(item, index));
}
