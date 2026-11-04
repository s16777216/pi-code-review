import type { ChangedFileDiff, OmittedReason, ReviewContext } from '../types.ts';
import { itemPath, type BatchItem } from './batch.ts';
import { numberDiffHunks, parseDiffHunks } from './diff.ts';

/** One batch of a review that runs in batches. Both numbers start at 1. */
export interface PromptBatch {
  items: BatchItem[];
  index: number;
  count: number;
}

/** Builds the agent's user-facing prompt from a `ReviewContext`. Each diff's
 * added and context lines carry their new-file line number (see
 * `numberDiffHunks`), so the agent never has to count lines itself. Full file
 * content is deliberately not included here; the agent reads it on demand
 * through the `get_file_content` tool (see `agent.ts`).
 *
 * With `batch`, the prompt has a list of every changed file, with the batch's
 * files marked, and only the batch's diffs (`review-large-changes-in-batches`
 * design, Decision 4). Without it, the prompt is the same as before batches.
 *
 * A file whose diff is omitted is shown with its path and the reason, and no
 * diff (`handle-omitted-diffs` design, Decision 2). */
export function buildReviewPrompt(context: ReviewContext, batch?: PromptBatch): string {
  const header = [`# Change: ${context.title}`, '', context.description.trim() || '(no description provided)', ''];

  if (batch === undefined) {
    const files = context.changedFiles
      .map((file) =>
        file.omitted === undefined
          ? formatDiff(itemPath(file), file.hunks)
          : `### ${itemPath(file)}\n(diff not shown: ${OMITTED_TEXT[file.omitted]})`,
      )
      .join('\n\n');
    return [...header, '## Changed files', '', files || '(no changed files)'].join('\n');
  }

  const inBatch = new Set(batch.items.map((item) => item.file));
  const list = context.changedFiles
    .map((file) => `- ${describeFile(file)}${inBatch.has(file) ? ' [in this part]' : ''}`)
    .join('\n');
  const diffs = batch.items
    .map((item) => {
      const title = item.part
        ? `${itemPath(item.file)} (part ${item.part.index} of ${item.part.count})`
        : itemPath(item.file);
      return formatDiff(title, item.hunks);
    })
    .join('\n\n');

  return [
    ...header,
    '## All changed files',
    '',
    `This change is reviewed in ${batch.count} parts. This is part ${batch.index}. Files marked [in this part] have their diff below.`,
    '',
    list,
    '',
    `## Diffs in part ${batch.index} of ${batch.count}`,
    '',
    diffs,
  ].join('\n');
}

/** How the input names each reason a diff is omitted (`handle-omitted-diffs`
 * design, Decision 2). */
const OMITTED_TEXT: Record<OmittedReason, string> = {
  too_large: 'too large',
  generated: 'generated file',
};

function formatDiff(title: string, hunks: string): string {
  return `### ${title}\n\`\`\`diff\n${numberDiffHunks(hunks)}\n\`\`\``;
}

/** One line of the file list: the path, its state, and its counts of added
 * and removed lines. */
function describeFile(file: ChangedFileDiff): string {
  if (file.omitted !== undefined) {
    return `${itemPath(file)} (${fileState(file)}, diff not shown: ${OMITTED_TEXT[file.omitted]})`;
  }
  const lines = parseDiffHunks(file.hunks);
  const added = lines.filter((line) => line.type === 'added').length;
  const removed = lines.filter((line) => line.type === 'removed').length;
  return `${itemPath(file)} (${fileState(file)}, +${added} -${removed})`;
}

function fileState(file: ChangedFileDiff): string {
  if (file.deleted === true) return 'deleted';
  if (file.oldPath === null || /^@@ -0,0 /.test(file.hunks)) return 'added';
  if (file.newPath !== null && file.oldPath !== file.newPath) return `renamed from ${file.oldPath}`;
  return 'modified';
}
