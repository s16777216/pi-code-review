import { readFile, writeFile } from 'node:fs/promises';
import type { GitLabDiffRefs } from './gitlab/client.ts';
import type { Finding } from './types.ts';

/** What `review` writes and `publish` reads. `diffRefs` is the one thing
 * `publish` cannot get anywhere else — `GitLabSinkProvider` needs it to
 * position inline comments, and it only comes from `GitLabSourceProvider`
 * during `review`. */
export interface FindingsFile {
  diffRefs: GitLabDiffRefs;
  findings: Finding[];
}

export class FindingsFileError extends Error {}

export async function writeFindingsFile(path: string, data: FindingsFile): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

export async function readFindingsFile(path: string): Promise<FindingsFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new FindingsFileError(
      `Could not read findings file "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(raw) as FindingsFile;
  } catch (error) {
    throw new FindingsFileError(
      `Findings file "${path}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
