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

/** One note in a `ReviewDiscussion`. */
export interface ReviewDiscussionNote {
  author: string;
  body: string;
}

/** An existing discussion on the change under review, from a person or from an
 * earlier run of this tool. Platform-agnostic: a GitHub review thread fits the
 * same shape as a GitLab merge request discussion. */
export interface ReviewDiscussion {
  id: string;
  /** The file a diff discussion is on, or `null` for a general comment. */
  file: string | null;
  /** The new-file line of the discussion's position, or `null`. */
  line: number | null;
  /** The head commit `line` refers to. On an older commit, the line can point
   * at different code than today. */
  positionCommit: string | null;
  /** `false` for a discussion that cannot be resolved. */
  resolved: boolean;
  /** `true` when an earlier run of this tool started the discussion. */
  fromThisTool: boolean;
  notes: ReviewDiscussionNote[];
}

/** The engine's input. Platform-agnostic: nothing here names GitLab, GitHub,
 * or any other host. */
export interface ReviewContext {
  title: string;
  description: string;
  changedFiles: ChangedFileDiff[];
  getFileContent(path: string): Promise<string | { error: string }>;
  /** The change's existing discussions. Fetched at most once per review. */
  listDiscussions(): Promise<ReviewDiscussion[] | { error: string }>;
}

/** The engine's output. Also pulled forward from task 4.0, for the same
 * reason: `SinkProvider` (in `src/review/providers.ts`) needs this type. */
export interface Finding {
  file: string;
  line: number;
  severity: Severity;
  summary: string;
  /** The ID of an existing discussion that covers the same problem. */
  relatesTo?: string;
  /** Set by the engine, never by the agent: a hash of the file and the text of
   * the finding's line (see `core/review/anchor.ts`). */
  anchor?: string;
}
