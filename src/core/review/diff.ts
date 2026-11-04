import type { ChangedFileDiff, DiffLine } from '../types.ts';

/** The path a changed file is known by: the new path, or the old path of a
 * deleted file. */
export function changedFilePath(file: ChangedFileDiff): string {
  return file.newPath ?? file.oldPath ?? '(unknown path)';
}

/** Plain code-point order, so a sort by path does not depend on the locale. */
export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** The diff text's lines. GitLab's diff text ends with a line break, and
 * splitting on it leaves one empty string after the last line. That string is
 * not a line of the diff: without this, it would count as a blank context
 * line, one past the end of the hunk. An empty line inside the text stays: it
 * is a blank context line whose leading space was removed. */
function splitDiffLines(diffText: string): string[] {
  const lines = diffText.split('\n');
  if (diffText.endsWith('\n')) lines.pop();
  return lines;
}

/** Parses unified-diff hunk text (as returned by GitLab's diff API) into one
 * `DiffLine` per added, removed, or context line, each tagged with its old
 * and/or new line number. Lines outside any `@@ ... @@` hunk, and
 * "\ No newline at end of file" markers, are ignored. */
export function parseDiffHunks(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of splitDiffLines(diffText)) {
    const header = HUNK_HEADER.exec(rawLine);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;

    if (rawLine.startsWith('\\')) continue; // "\ No newline at end of file"

    if (rawLine.startsWith('+')) {
      lines.push({ type: 'added', content: rawLine.slice(1), oldLine: null, newLine });
      newLine += 1;
    } else if (rawLine.startsWith('-')) {
      lines.push({ type: 'removed', content: rawLine.slice(1), oldLine, newLine: null });
      oldLine += 1;
    } else if (rawLine.startsWith(' ') || rawLine === '') {
      lines.push({ type: 'context', content: rawLine.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
    // Any other line (e.g. a stray blank line between hunks) is ignored.
  }

  return lines;
}

const MIN_LINE_NUMBER_WIDTH = 4;

/** Rewrites unified-diff hunk text so every added and context line starts
 * with its new-file line number and a `|` separator, e.g. `  11 | +foo();`.
 * Removed lines get a blank gutter of the same width, since they have no
 * new-file line. `@@` headers and any line outside a hunk stay unchanged.
 * Walks the hunks with the same rules as `parseDiffHunks`, so the numbers
 * printed here are exactly the ones `checkNewFileLine` accepts. */
export function numberDiffHunks(diffText: string): string {
  // `'verbatim'`: a header or a line before the first hunk, printed as is.
  // A number: the line's new-file line. `null`: a hunk line with no new-file line.
  const entries: { rawLine: string; gutter: 'verbatim' | number | null }[] = [];
  let newLine = 0;
  let inHunk = false;
  let maxNumber = 0;

  for (const rawLine of splitDiffLines(diffText)) {
    const header = HUNK_HEADER.exec(rawLine);
    if (header) {
      newLine = Number(header[3]);
      inHunk = true;
      entries.push({ rawLine, gutter: 'verbatim' });
    } else if (!inHunk) {
      entries.push({ rawLine, gutter: 'verbatim' });
    } else if (rawLine.startsWith('+') || rawLine.startsWith(' ') || rawLine === '') {
      entries.push({ rawLine, gutter: newLine });
      maxNumber = Math.max(maxNumber, newLine);
      newLine += 1;
    } else {
      entries.push({ rawLine, gutter: null }); // removed line or "\ No newline" marker
    }
  }

  const width = Math.max(MIN_LINE_NUMBER_WIDTH, String(maxNumber).length);
  return entries
    .map(({ rawLine, gutter }) => {
      if (gutter === 'verbatim') return rawLine;
      const prefix = gutter === null ? ' '.repeat(width) : String(gutter).padStart(width);
      return `${prefix} | ${rawLine}`;
    })
    .join('\n');
}

/** Splits unified-diff text into one diff text for each `@@` header, in
 * order. Each part starts with its header, so `numberDiffHunks` prints the
 * same new-file line numbers for a part as for the full text. Text before the
 * first header is dropped. */
export function splitHunks(diffText: string): string[] {
  const hunks: string[][] = [];
  for (const rawLine of splitDiffLines(diffText)) {
    if (HUNK_HEADER.test(rawLine)) {
      hunks.push([rawLine]);
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1]!.push(rawLine);
    }
  }
  return hunks.map((lines) => lines.join('\n'));
}

/** The first new-file line of a hunk, from its `@@` header, or `null` when
 * the text does not start with a header. */
export function hunkStartLine(hunkText: string): number | null {
  const header = HUNK_HEADER.exec(hunkText);
  return header ? Number(header[3]) : null;
}

export type NewFileLineCheck = 'ok' | 'file_not_changed' | 'line_not_in_diff';

/** Why `line` can or cannot carry an inline comment on `path`: `'ok'` when it
 * is a visible line in the new version of the file's diff (an added or
 * context line), `'file_not_changed'` when `path` is not a changed file, and
 * `'line_not_in_diff'` when the file changed but `line` is not a new-file
 * line in any of its hunks. */
export function checkNewFileLine(files: ChangedFileDiff[], path: string, line: number): NewFileLineCheck {
  const file = files.find((f) => f.newPath === path);
  if (!file) return 'file_not_changed';
  const visible = parseDiffHunks(file.hunks).some(
    (diffLine) => diffLine.newLine === line && diffLine.type !== 'removed',
  );
  return visible ? 'ok' : 'line_not_in_diff';
}

/** The text of `line` in the new version of `path`, taken from the diff (an
 * added or context line), or `null` when that line is not in the diff. */
export function getNewFileLineText(files: ChangedFileDiff[], path: string, line: number): string | null {
  const file = files.find((f) => f.newPath === path);
  if (!file) return null;
  const match = parseDiffHunks(file.hunks).find((diffLine) => diffLine.newLine === line && diffLine.type !== 'removed');
  return match ? match.content : null;
}
