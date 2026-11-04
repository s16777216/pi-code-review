import type { GitLabDiffRefs } from './client.ts';

const DIFF_REF_FIELDS = ['baseSha', 'startSha', 'headSha'] as const;

/** Checks the `diffRefs` value of a findings file: an object with a
 * non-empty `baseSha`, `startSha`, and `headSha`. Returns a copy with only
 * those fields, or throws an `Error` whose message names the field.
 * `readFindingsFile` adds the file name around the message. */
export function parseGitLabDiffRefs(value: unknown): GitLabDiffRefs {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('"diffRefs" is missing or is not an object.');
  }
  const refs = value as Record<string, unknown>;
  for (const field of DIFF_REF_FIELDS) {
    const sha = refs[field];
    if (typeof sha !== 'string' || sha.length === 0) {
      throw new Error(`"diffRefs.${field}" is missing or is not a non-empty string.`);
    }
  }
  return { baseSha: refs.baseSha as string, startSha: refs.startSha as string, headSha: refs.headSha as string };
}
