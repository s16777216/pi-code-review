import type { ChangedFileDiff, DiffLine, OmittedReason } from '../types.ts';
import { changedFilePath, numberDiffHunks, parseDiffHunks, splitHunks, type NewFileLineCheck } from './diff.ts';

/** One changed file of a change, as a value object (`model-diffs-and-run-scopes`
 * design, Decision 1). The diff text is parsed once when the object is built;
 * every question about lines, text, numbering, counts, and state is answered
 * from that parse, with the rules of the functions in `diff.ts`. The object
 * does not change.
 *
 * A part of a file (see `hunks` and `withHunks`) is a `ChangedFile` too. It
 * has only some of the file's hunks, but it is still that file: it keeps the
 * state of the whole file (added, deleted, renamed), and its lines keep the
 * numbers of the whole file. */
export class ChangedFile {
  readonly path: string;
  readonly oldPath: string | null;
  readonly newPath: string | null;
  readonly deleted: boolean;
  readonly omitted: OmittedReason | undefined;
  /** The raw diff text of this file, or of this part of it. */
  readonly hunkText: string;

  private readonly lines: readonly DiffLine[];
  private readonly wholeFileIsNew: boolean;

  private constructor(source: ChangedFileDiff, hunkText: string, wholeFileIsNew: boolean) {
    this.path = changedFilePath(source);
    this.oldPath = source.oldPath;
    this.newPath = source.newPath;
    this.deleted = source.deleted === true;
    this.omitted = source.omitted;
    this.hunkText = hunkText;
    this.wholeFileIsNew = wholeFileIsNew;
    this.lines = parseDiffHunks(hunkText);
  }

  /** Builds a file from the host's data, and parses its diff. */
  static from(diff: ChangedFileDiff): ChangedFile {
    return new ChangedFile(diff, diff.hunks, /^@@ -0,0 /.test(diff.hunks));
  }

  /** True when `line` is an added or context line of the new version, in
   * this file's diff. */
  hasNewLine(line: number): boolean {
    return this.lines.some((diffLine) => diffLine.newLine === line && diffLine.type !== 'removed');
  }

  /** The text of the added or context line `line` of the new version, or
   * `null` when that line is not in this file's diff. */
  newLineText(line: number): string | null {
    const match = this.lines.find((diffLine) => diffLine.newLine === line && diffLine.type !== 'removed');
    return match ? match.content : null;
  }

  /** The old-file line number of the new-file line `line`, when that line is
   * unchanged context (present in both versions); `null` for an added line,
   * or when `line` is not in this file's diff. A host's discussion API may
   * need the old-file line too when positioning a comment on a context
   * line. */
  oldLineFor(line: number): number | null {
    const match = this.lines.find((diffLine) => diffLine.newLine === line && diffLine.type !== 'removed');
    return match?.oldLine ?? null;
  }

  /** The diff text with the new-file line number in front of every added and
   * context line, for the prompt (`numberDiffHunks`). */
  numbered(): string {
    return numberDiffHunks(this.hunkText);
  }

  /** The numbers of added and removed lines. */
  counts(): { added: number; removed: number } {
    return {
      added: this.lines.filter((line) => line.type === 'added').length,
      removed: this.lines.filter((line) => line.type === 'removed').length,
    };
  }

  /** How the prompt names this file: added, deleted, renamed from X, or
   * modified. A part has the state of the whole file. */
  state(): string {
    if (this.deleted) return 'deleted';
    if (this.oldPath === null || this.wholeFileIsNew) return 'added';
    if (this.newPath !== null && this.oldPath !== this.newPath) return `renamed from ${this.oldPath}`;
    return 'modified';
  }

  /** One `ChangedFile` for each hunk, in order, with the same paths and the
   * same line numbers. */
  hunks(): ChangedFile[] {
    return splitHunks(this.hunkText).map((text) => new ChangedFile(this.source(), text, this.wholeFileIsNew));
  }

  /** The same file with only `parts`, which come from `hunks()`, joined in
   * the given order. */
  withHunks(parts: readonly ChangedFile[]): ChangedFile {
    return new ChangedFile(this.source(), parts.map((part) => part.hunkText).join('\n'), this.wholeFileIsNew);
  }

  private source(): ChangedFileDiff {
    return {
      oldPath: this.oldPath,
      newPath: this.newPath,
      hunks: this.hunkText,
      ...(this.deleted ? { deleted: true } : {}),
      ...(this.omitted === undefined ? {} : { omitted: this.omitted }),
    };
  }
}

/** The changed files of one review, built once from the host's data
 * (`model-diffs-and-run-scopes` design, Decision 2). */
export class ChangeSet {
  readonly files: readonly ChangedFile[];
  private readonly byNewPath = new Map<string, ChangedFile>();

  private constructor(files: ChangedFile[]) {
    this.files = files;
    for (const file of files) {
      // `find` in the old code returned the first file with a path.
      if (file.newPath !== null && !this.byNewPath.has(file.newPath)) this.byNewPath.set(file.newPath, file);
    }
  }

  /** Builds the set in the host's order. */
  static from(diffs: readonly ChangedFileDiff[]): ChangeSet {
    return new ChangeSet(diffs.map((diff) => ChangedFile.from(diff)));
  }

  /** The file with this new path. */
  file(path: string): ChangedFile | undefined {
    return this.byNewPath.get(path);
  }

  /** Why `line` can or cannot carry an inline comment on `path`: `'ok'` for
   * an added or context line, `'file_not_changed'` when `path` is not a
   * changed file, and `'line_not_in_diff'` otherwise. */
  lineCheck(path: string, line: number): NewFileLineCheck {
    const file = this.file(path);
    if (file === undefined) return 'file_not_changed';
    return file.hasNewLine(line) ? 'ok' : 'line_not_in_diff';
  }

  /** The text of the added or context line, or `null`. */
  lineText(path: string, line: number): string | null {
    return this.file(path)?.newLineText(line) ?? null;
  }

  /** The old-file line number of `path`'s new-file line `line`, or `null`
   * (an added line, an unknown file, or a line not in the diff). */
  oldLineFor(path: string, line: number): number | null {
    return this.file(path)?.oldLineFor(line) ?? null;
  }

  /** True when `path` is a changed file whose diff is omitted. */
  isOmitted(path: string): boolean {
    return this.files.some((file) => file.omitted !== undefined && file.newPath === path);
  }

  /** True when the change deletes a file with this old or new path. */
  isDeleted(path: string): boolean {
    return this.files.some((file) => file.deleted && (file.oldPath === path || file.newPath === path));
  }

  /** The files whose diff is not omitted. */
  reviewable(): ChangedFile[] {
    return this.files.filter((file) => file.omitted === undefined);
  }
}
