import type { ReviewContext } from '../types.ts';
import { numberDiffHunks } from './diff.ts';

/** Builds the agent's user-facing prompt from a `ReviewContext`. Each diff's
 * added and context lines carry their new-file line number (see
 * `numberDiffHunks`), so the agent never has to count lines itself. Full file
 * content is deliberately not included here; the agent reads it on demand
 * through the `get_file_content` tool (see `agent.ts`). */
export function buildReviewPrompt(context: ReviewContext): string {
  const files = context.changedFiles
    .map((file) => {
      const path = file.newPath ?? file.oldPath ?? '(unknown path)';
      return `### ${path}\n\`\`\`diff\n${numberDiffHunks(file.hunks)}\n\`\`\``;
    })
    .join('\n\n');

  return [
    `# Change: ${context.title}`,
    '',
    context.description.trim() || '(no description provided)',
    '',
    '## Changed files',
    '',
    files || '(no changed files)',
  ].join('\n');
}
