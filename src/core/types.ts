export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pre_existing';

/** The severity threshold for pass or fail; `none` always passes. */
export type FailOnSeverity = Severity | 'none';

export type DiffLineType = 'added' | 'removed' | 'context';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

/** One changed file's diff, in the shape the `ReviewEngine` consumes. */
export interface ChangedFileDiff {
  oldPath: string | null;
  newPath: string | null;
  hunks: string;
  /** `true` when the change deletes this file. */
  deleted?: boolean;
  /** Set when the host gives no diff to review for this file: `too_large`
   * when the host left the diff out for its size, `generated` when the host
   * marks the file as generated. The review does not show an omitted file's
   * diff (`handle-omitted-diffs` design, Decision 1). */
  omitted?: OmittedReason;
}

/** Why a changed file's diff is not reviewed. */
export type OmittedReason = 'too_large' | 'generated';

/** A changed file that the review did not review. */
export interface UnreviewedFile {
  /** The new path, or the old path of a deleted file. */
  path: string;
  reason: OmittedReason;
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
  /** The anchor this tool recorded when it started the discussion, or `null`
   * (a person's discussion, or one from a version without anchors). */
  anchor: string | null;
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

/** One problem the review reports, on a new-file line of a changed file. */
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

/** The agent's claim that an existing discussion from this tool is fixed. */
export interface ResolvedDiscussion {
  discussionId: string;
  /** One sentence; it becomes the reply that explains the resolve. */
  reason: string;
}

/** What one review produces. */
export interface ReviewResult {
  findings: Finding[];
  /** Fixed declarations that passed every check (see `resolve-fixed-discussions`). */
  resolved: ResolvedDiscussion[];
  /** Every omitted changed file, in path order (see `handle-omitted-diffs`). */
  unreviewedFiles: UnreviewedFile[];
}
