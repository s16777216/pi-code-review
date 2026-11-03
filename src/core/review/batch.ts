import type { ChangedFileDiff } from '../types.ts';
import { hunkStartLine, splitHunks } from './diff.ts';
import { ReviewFailureError } from './findings.ts';

/** A review needs at most this many batches; more fails before the first
 * model call (`review-large-changes-in-batches` design, Decision 7). */
export const MAX_BATCHES = 20;

/** One file's diff in a batch: the whole file, or one part of a file that is
 * split at hunk boundaries. */
export interface BatchItem {
  file: ChangedFileDiff;
  /** The diff text of this item: all of the file's hunks, or a part of them. */
  hunks: string;
  /** Set only for a part of a split file. Both numbers start at 1. */
  part?: { index: number; count: number };
}

/** Whether a batch with these items fits the budget. */
export type FitsBudget = (items: BatchItem[]) => boolean;

/** The path a changed file is known by: the new path, or the old path of a
 * deleted file. */
export function itemPath(file: ChangedFileDiff): string {
  return file.newPath ?? file.oldPath ?? '(unknown path)';
}

/** A part label with the largest numbers a plan can have. It is used while a
 * file's parts are packed, before their final count is known, so the size
 * check never sees a label shorter than the final one. */
const PROVISIONAL_PART = { index: MAX_BATCHES, count: MAX_BATCHES };

/** Plans the batches of a review (`review-large-changes-in-batches` design,
 * Decisions 2, 3, and 7). Files are sorted by path and added to the current
 * batch while `fits` accepts it; the next file that does not fit starts a new
 * batch. A file that does not fit an empty batch is split at its hunk
 * headers, and its hunks are packed in order into parts, each part starting a
 * new batch. The result is the same for the same input.
 *
 * Throws `ReviewFailureError` when one hunk does not fit an empty batch, or
 * when the plan needs more than `MAX_BATCHES` batches. `contextWindow` is only
 * used in that error. */
export function planBatches(files: ChangedFileDiff[], fits: FitsBudget, contextWindow: number): BatchItem[][] {
  const sorted = [...files].sort((a, b) => compare(itemPath(a), itemPath(b)));
  const batches: BatchItem[][] = [];
  let current: BatchItem[] = [];

  const closeCurrent = () => {
    if (current.length === 0) return;
    batches.push(current);
    current = [];
    if (batches.length > MAX_BATCHES) throw tooManyBatches(contextWindow);
  };

  for (const file of sorted) {
    const whole: BatchItem = { file, hunks: file.hunks };
    if (fits([...current, whole])) {
      current.push(whole);
      continue;
    }
    closeCurrent();
    if (fits([whole])) {
      current.push(whole);
      continue;
    }

    // The file does not fit an empty batch: split it at hunk boundaries.
    const hunks = splitHunks(file.hunks);
    if (hunks.length === 0) {
      throw new ReviewFailureError(
        `The diff of "${itemPath(file)}" is too large to review and has no hunk headers to split it at.`,
      );
    }
    const parts: BatchItem[] = [];
    let group: string[] = [];
    for (const hunk of hunks) {
      const grown = [...group, hunk];
      if (fits([{ file, hunks: grown.join('\n'), part: PROVISIONAL_PART }])) {
        group = grown;
        continue;
      }
      if (group.length === 0 || !fits([{ file, hunks: hunk, part: PROVISIONAL_PART }])) {
        throw new ReviewFailureError(
          `The hunk at new-file line ${hunkStartLine(hunk) ?? '?'} of "${itemPath(file)}" is too large to review: it does not fit in one batch of half the ${contextWindow}-token context window. Set --context-window (OPENAI_CONTEXT_WINDOW) if the model's real window is larger.`,
        );
      }
      parts.push({ file, hunks: group.join('\n') });
      group = [hunk];
    }
    if (group.length > 0) parts.push({ file, hunks: group.join('\n') });

    parts.forEach((part, index) => {
      part.part = { index: index + 1, count: parts.length };
      if (index > 0) closeCurrent();
      current.push(part);
    });
  }
  closeCurrent();
  return batches;
}

function tooManyBatches(contextWindow: number): ReviewFailureError {
  return new ReviewFailureError(
    `The change is too large to review: it needs at least ${MAX_BATCHES + 1} batches (at most ${MAX_BATCHES} are allowed) of half the ${contextWindow}-token context window. Set --context-window (OPENAI_CONTEXT_WINDOW) if the model's real window is larger.`,
  );
}

/** Plain code-point order, so the plan does not depend on the locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
