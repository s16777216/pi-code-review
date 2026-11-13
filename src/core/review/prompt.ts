import type { OmittedReason, ReviewContext } from '../types.ts';
import type { BatchItem } from './batch.ts';
import type { ChangedFile, ChangeSet } from './changedFile.ts';
import { BUILTIN_DIR, fillTemplate, readTemplateFile, TemplateError } from '../template.ts';

/** The built-in text of the two user prompts (`move-review-prompt-to-templates`
 * design). A template is plain text with `${name}` placeholders. */
export interface PromptTemplates {
  /** The prompt of a batch run. */
  batch: string;
  /** The prompt of a run over the whole change. */
  whole: string;
}

const PROMPT_FILES = { batch: 'BATCH_PROMPT.md', whole: 'WHOLE_PROMPT.md' } as const;

/** Reads the two prompt templates from `dir`. A file that is missing is a
 * defect of the package, so this throws `TemplateError` that names the file,
 * and never uses other text (Decision 4). */
export function readPromptTemplates(dir: string = BUILTIN_DIR): PromptTemplates {
  const read = (file: string): string => {
    const text = readTemplateFile(dir, file);
    if (text === undefined) {
      throw new TemplateError(
        `The built-in template ${file} is missing from the package (${dir}). This is a defect of the package.`,
      );
    }
    return text;
  };
  return { batch: read(PROMPT_FILES.batch), whole: read(PROMPT_FILES.whole) };
}

let cachedTemplates: PromptTemplates | undefined;

/** The built-in prompt templates, read once. `AgentReviewEngine.review()`
 * calls it before the first run, so a missing file fails the review before any
 * model call. */
export function promptTemplates(): PromptTemplates {
  cachedTemplates ??= readPromptTemplates();
  return cachedTemplates;
}

/** The description of the change, or the fixed text when it is empty. */
function describeChange(context: ReviewContext): string {
  return context.description.trim() || '(no description provided)';
}

/** The title and the description, which the prompt of the verifier starts
 * with. The prompts of the review runs come from templates. */
export function header(context: ReviewContext): string[] {
  return [`# Change: ${context.title}`, '', describeChange(context), ''];
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
  return fillTemplate(promptTemplates().whole, {
    title: context.title,
    description: describeChange(context),
    files: files || '(no changed files)',
  });
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

  return fillTemplate(promptTemplates().batch, {
    title: context.title,
    description: describeChange(context),
    list,
    diffs,
    index: String(index),
    count: String(count),
  });
}

/** How the input names each reason a diff is omitted (`handle-omitted-diffs`
 * design, Decision 2). */
const OMITTED_TEXT: Record<OmittedReason, string> = {
  too_large: 'too large',
  generated: 'generated file',
};

export function formatDiff(title: string, file: ChangedFile): string {
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
