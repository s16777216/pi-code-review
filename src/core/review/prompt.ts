import type { OmittedReason, ReviewContext } from '../types.ts';
import type { BatchItem } from './batch.ts';
import type { ChangedFile, ChangeSet } from './changedFile.ts';

/** The title and the description, which every run's prompt starts with. */
function header(context: ReviewContext): string[] {
  return [`# Change: ${context.title}`, '', context.description.trim() || '(no description provided)', ''];
}

/** Builds the agent's prompt for a run over the whole change. Each diff's
 * added and context lines carry their new-file line number (see
 * `ChangedFile.numbered`), so the agent never has to count lines itself. Full
 * file content is deliberately not included here; the agent reads it on
 * demand through the `get_file_content` tool (see `agent.ts`).
 *
 * A file whose diff is omitted is shown with its path and the reason, and no
 * diff (`handle-omitted-diffs` design, Decision 2). */
export function buildWholePrompt(context: ReviewContext, changes: ChangeSet): string {
  const files = changes.files
    .map((file) =>
      file.omitted === undefined
        ? formatDiff(file.path, file)
        : `### ${file.path}\n(diff not shown: ${OMITTED_TEXT[file.omitted]})`,
    )
    .join('\n\n');
  return [...header(context), '## Changed files', '', files || '(no changed files)'].join('\n');
}

/** Builds the agent's prompt for one batch: a list of every changed file,
 * with the batch's files marked, and only the batch's own diffs
 * (`review-large-changes-in-batches` design, Decision 4). `index` and
 * `count` start at 1. */
export function buildBatchPrompt(
  context: ReviewContext,
  changes: ChangeSet,
  items: readonly BatchItem[],
  index: number,
  count: number,
): string {
  // A part of a file is a new object, so the batch's files are marked by path.
  // A path is one file in a change.
  const inBatch = new Set(items.map((item) => item.file.path));
  const list = changes.files
    .map((file) => `- ${describeFile(file)}${inBatch.has(file.path) ? ' [in this part]' : ''}`)
    .join('\n');
  const diffs = items
    .map((item) => {
      const title = item.part ? `${item.file.path} (part ${item.part.index} of ${item.part.count})` : item.file.path;
      return formatDiff(title, item.file);
    })
    .join('\n\n');

  return [
    ...header(context),
    '## All changed files',
    '',
    `This change is reviewed in ${count} parts. This is part ${index}. Files marked [in this part] have their diff below.`,
    '',
    list,
    '',
    `## Diffs in part ${index} of ${count}`,
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
