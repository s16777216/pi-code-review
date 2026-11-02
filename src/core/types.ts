export type Severity = 'important' | 'nit' | 'pre_existing';

export type DiffLineType = 'added' | 'removed' | 'context';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

/** One changed file's diff, in the shape the `ReviewEngine` consumes.
 * Pulled forward from task 4.0: `SourceProvider` (below) needs this type
 * before the rest of the engine exists. `Finding` and `ReviewEngine` are
 * still defined in task 4.0. */
export interface ChangedFileDiff {
  oldPath: string | null;
  newPath: string | null;
  hunks: string;
}

/** The engine's input. Platform-agnostic: nothing here names GitLab, GitHub,
 * or any other host. */
export interface ReviewContext {
  title: string;
  description: string;
  changedFiles: ChangedFileDiff[];
  getFileContent(path: string): Promise<string | { error: string }>;
}

/** The engine's output. Also pulled forward from task 4.0, for the same
 * reason: `SinkProvider` (in `src/review/providers.ts`) needs this type. */
export interface Finding {
  file: string;
  line: number;
  severity: Severity;
  summary: string;
}
