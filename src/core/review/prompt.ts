import type { OmittedReason, ReviewContext } from '../types.ts';
import type { BatchItem } from './batch.ts';
import type { ChangedFile, ChangeSet } from './changedFile.ts';

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
export function buildReviewPrompt(context: ReviewContext, changes: ChangeSet, batch?: PromptBatch): string {
  const header = [`# Change: ${context.title}`, '', context.description.trim() || '(no description provided)', ''];

  if (batch === undefined) {
    const files = changes.files
      .map((file) =>
        file.omitted === undefined
          ? formatDiff(file.path, file)
          : `### ${file.path}\n(diff not shown: ${OMITTED_TEXT[file.omitted]})`,
      )
      .join('\n\n');
    return [...header, '## Changed files', '', files || '(no changed files)'].join('\n');
  }

  // A part of a file is a new object, so the batch's files are marked by path.
  // A path is one file in a change.
  const inBatch = new Set(batch.items.map((item) => item.file.path));
  const list = changes.files
    .map((file) => `- ${describeFile(file)}${inBatch.has(file.path) ? ' [in this part]' : ''}`)
    .join('\n');
  const diffs = batch.items
    .map((item) => {
      const title = item.part ? `${item.file.path} (part ${item.part.index} of ${item.part.count})` : item.file.path;
      return formatDiff(title, item.file);
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

function formatDiff(title: string, file: ChangedFile): string {
  return `### ${title}\n\`\`\`diff\n${file.numbered()}\n\`\`\``;
}

/** One line of the file list: the path, its state, and its counts of added
 * and removed lines. */
function describeFile(file: ChangedFile): string {
  if (file.omitted !== undefined) {
    return `${file.path} (${file.state()}, diff not shown: ${OMITTED_TEXT[file.omitted]})`;
  }
  const { added, removed } = file.counts();
  return `${file.path} (${file.state()}, +${added} -${removed})`;
}
