/** The merge request that a review read, as written to the findings file. */
export interface GitLabSource {
  host: 'gitlab';
  projectId: string;
  mergeRequestIid: string;
}

/** Checks the `source` value of a findings file: an object whose `host` is
 * `gitlab`, with a non-empty `projectId` and `mergeRequestIid`. Returns a copy
 * with only those fields, or throws an `Error` whose message names the field.
 * `readFindingsFile` adds the file name around the message. */
export function parseGitLabSource(value: unknown): GitLabSource {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('"source" is missing or is not an object.');
  }
  const source = value as Record<string, unknown>;
  if (typeof source.host !== 'string' || source.host.length === 0) {
    throw new Error('"source.host" is missing or is not a non-empty string.');
  }
  if (source.host !== 'gitlab') {
    throw new Error(`"source.host" is "${source.host}", but this tool supports only "gitlab".`);
  }
  for (const field of ['projectId', 'mergeRequestIid'] as const) {
    const id = source[field];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`"source.${field}" is missing or is not a non-empty string.`);
    }
  }
  return { host: 'gitlab', projectId: source.projectId as string, mergeRequestIid: source.mergeRequestIid as string };
}
