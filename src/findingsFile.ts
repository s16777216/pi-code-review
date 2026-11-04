import { readFile, writeFile } from 'node:fs/promises';
import type { GitLabDiffRefs } from './providers/index.ts';
import type { Finding, ResolvedDiscussion, UnreviewedFile } from './core/types.ts';
import { validateFinding, validateResolvedDiscussion } from './core/review/findings.ts';
import { errorMessage } from './core/errorMessage.ts';

/** What `review` writes and `publish` reads. `diffRefs` is the one thing
 * `publish` cannot get anywhere else — `GitLabSinkProvider` needs it to
 * position inline comments, and it only comes from `GitLabSourceProvider`
 * during `review`. */
export interface FindingsFile {
  diffRefs: GitLabDiffRefs;
  findings: Finding[];
  /** Fixed declarations that passed the engine's checks. A file without this
   * field (from an older `review`) reads as an empty list. */
  resolved: ResolvedDiscussion[];
  /** Changed files the review did not review. A file without this field
   * (from an older `review`) reads as an empty list. */
  unreviewedFiles: UnreviewedFile[];
}

export class FindingsFileError extends Error {}

export async function writeFindingsFile(path: string, data: FindingsFile): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

/** Reads and validates a findings file. Throws `FindingsFileError` when the
 * file cannot be read, is not JSON, or does not have the structure `publish`
 * needs — so a bad file stops `publish` before it calls the GitLab API,
 * instead of failing quietly in the middle of publishing. Unknown extra
 * fields are ignored. */
export async function readFindingsFile(path: string): Promise<FindingsFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new FindingsFileError(`Could not read findings file "${path}": ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FindingsFileError(`Findings file "${path}" is not valid JSON: ${errorMessage(error)}`);
  }

  try {
    return validateFindingsFile(parsed);
  } catch (error) {
    throw new FindingsFileError(`Findings file "${path}" is invalid: ${errorMessage(error)}`);
  }
}

const DIFF_REF_FIELDS = ['baseSha', 'startSha', 'headSha'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the parsed file's structure and returns a copy with only the known
 * fields. Each finding goes through the engine's own `validateFinding`, and
 * the whole file is rejected on the first bad field: a file `review` wrote
 * always passes, so a bad one means something changed it. */
function validateFindingsFile(value: unknown): FindingsFile {
  if (!isObject(value)) {
    throw new Error('the top-level value is not an object.');
  }

  const { diffRefs, findings, resolved = [], unreviewedFiles = [] } = value;
  if (!isObject(diffRefs)) {
    throw new Error('"diffRefs" is missing or is not an object.');
  }
  for (const field of DIFF_REF_FIELDS) {
    const sha = diffRefs[field];
    if (typeof sha !== 'string' || sha.length === 0) {
      throw new Error(`"diffRefs.${field}" is missing or is not a non-empty string.`);
    }
  }

  if (!Array.isArray(findings)) {
    throw new Error('"findings" is missing or is not an array.');
  }
  if (!Array.isArray(resolved)) {
    throw new Error('"resolved" is not an array.');
  }
  if (!Array.isArray(unreviewedFiles)) {
    throw new Error('"unreviewedFiles" is not an array.');
  }

  return {
    diffRefs: {
      baseSha: diffRefs.baseSha as string,
      startSha: diffRefs.startSha as string,
      headSha: diffRefs.headSha as string,
    },
    findings: findings.map((item, index) => validateFinding(item, index)),
    resolved: resolved.map((item, index) => validateResolvedDiscussion(item, index)),
    unreviewedFiles: unreviewedFiles.map((item, index) => validateUnreviewedFile(item, index)),
  };
}

const UNREVIEWED_REASONS: readonly string[] = ['too_large', 'generated'];

function validateUnreviewedFile(item: unknown, index: number): UnreviewedFile {
  if (!isObject(item)) {
    throw new Error(`Unreviewed file at index ${index} is not an object.`);
  }
  const { path, reason } = item;
  if (typeof path !== 'string' || path.length === 0) {
    throw new Error(`Unreviewed file at index ${index} is missing a "path" string.`);
  }
  if (typeof reason !== 'string' || !UNREVIEWED_REASONS.includes(reason)) {
    throw new Error(
      `Unreviewed file at index ${index} has an invalid "reason": ${JSON.stringify(reason)}. Must be one of ${UNREVIEWED_REASONS.join(', ')}.`,
    );
  }
  return { path, reason: reason as UnreviewedFile['reason'] };
}
