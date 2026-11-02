import type { ChangedFileDiff, DiffLine } from '../types.ts';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parses unified-diff hunk text (as returned by GitLab's diff API) into one
 * `DiffLine` per added, removed, or context line, each tagged with its old
 * and/or new line number. Lines outside any `@@ ... @@` hunk, and
 * "\ No newline at end of file" markers, are ignored. */
export function parseDiffHunks(diffText: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of diffText.split('\n')) {
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

/** True when `line` is a visible line in the new version of `path`'s diff
 * (an added or context line) — i.e. a line an inline comment can target.
 * False when `path` is not a changed file, or `line` does not appear as a
 * new-file line in any of that file's hunks. */
export function isValidNewFileLine(files: ChangedFileDiff[], path: string, line: number): boolean {
  const file = files.find((f) => f.newPath === path);
  if (!file) return false;
  return parseDiffHunks(file.hunks).some(
    (diffLine) => diffLine.newLine === line && diffLine.type !== 'removed',
  );
}
